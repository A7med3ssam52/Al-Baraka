-- 20261118 - expose reference_type/reference_id in public_portal_lookup transactions so
-- the customer portal can show each installment's last collection date.
-- Body identical to 20261107000000_public_portal.sql except for the two added keys.
-- Public portal (Landing Page + Customer self-service read-only dashboard).
--
-- The public Inquiry Page on the main domain lets a customer look up their
-- own installment account with EITHER a national ID (الرقم القومي) OR a
-- mobile number. All customer tables are locked to `authenticated` via RLS,
-- so anonymous visitors cannot query them directly.
--
-- To keep public exposure minimal this migration exposes exactly ONE
-- security-definer RPC, `public_portal_lookup`, granted to `anon`:
--   * It accepts at most one identifier at a time (or both = must match the
--     SAME customer row).
--   * Exact match only. No substring / fuzzy search, no enumeration.
--   * Returns a single jsonb snapshot (customer, notes, contacts, linked
--     guarantors, contracts, installments, document metadata, statement
--     transactions, summary) and nothing else — no write path exists.
--   * Every attempt is audit-logged (hashed identifier, never the raw value).
--   * If a mobile matches more than one active customer, it returns the
--     minimal candidate list (id, code, name) and asks for the national ID
--     to disambiguate, instead of picking one silently.
--   * Archived customers are never exposed.
--   * Documents are metadata only (no Cloudinary public_id / signed URLs).
--     Sensitive file images must be shared through the showroom.
--   * Only active contracts (active / completed) and their ACTIVE
--     installment schedules are exposed. Draft contracts/schedules stay
--     internal.
--
-- NOTE (security): national ID alone has high entropy, but a mobile number
-- alone can be probed sequentially. Do NOT expose any additional lookup
-- endpoint. Put a CDN/WAF rate limit + CAPTCHA in front of the public page
-- in production, and keep the per-identifier budget below low.

-- Ensure the contract_guarantors schema used below exists regardless of
-- migration order (M2.3 created the table without `role`).
alter table public.contract_guarantors
  add column if not exists id uuid not null default gen_random_uuid();

alter table public.contract_guarantors
  add column if not exists role text not null default 'guarantor'
    check (role in ('guarantor', 'co_signer'));

-- ---------------------------------------------------------------------------
-- 1. Access log (no raw identifiers, no client read access).
-- ---------------------------------------------------------------------------

create table if not exists public.public_portal_access_logs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete set null,
  lookup_kind text not null check (lookup_kind in ('national_id', 'mobile', 'both')),
  identifier_hash text not null,
  result text not null check (result in ('found', 'not_found', 'multiple_matches', 'rate_limited')),
  created_at timestamptz not null default now()
);

create index if not exists public_portal_access_logs_hash_time_idx
  on public.public_portal_access_logs (identifier_hash, created_at desc);

alter table public.public_portal_access_logs enable row level security;

-- No client access at all. The security-definer RPC below writes here.
drop policy if exists public_portal_access_logs_select_denied on public.public_portal_access_logs;
drop policy if exists public_portal_access_logs_all_denied on public.public_portal_access_logs;
create policy public_portal_access_logs_all_denied
on public.public_portal_access_logs
for all
to anon, authenticated
using (false)
with check (false);

revoke all on public.public_portal_access_logs from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. public_portal_lookup — single read-only snapshot for the public portal.
-- ---------------------------------------------------------------------------

create or replace function public.public_portal_lookup(
  p_national_id text default null,
  p_mobile text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  nid_clean text;
  mob_clean text;
  v_lookup_kind text;
  v_identifier_hash text;
  recent_attempts integer;
  match_count integer;
  matched_customer_id uuid;
  cust record;
  v_customer jsonb;
  v_notes jsonb;
  v_contacts jsonb;
  v_guarantors jsonb;
  v_contracts jsonb;
  v_installments jsonb;
  v_documents jsonb;
  v_transactions jsonb;
  v_summary jsonb;
  v_matches jsonb;
begin
  nid_clean := regexp_replace(btrim(coalesce(p_national_id, '')), '\D', '', 'g');
  if nid_clean = '' then nid_clean := null; end if;

  if btrim(coalesce(p_mobile, '')) = '' then
    mob_clean := null;
  else
    begin
      mob_clean := public.normalize_egypt_mobile(p_mobile);
    exception when sqlstate '22023' then
      raise exception 'invalid_mobile' using errcode = '22023';
    end;
  end if;

  if nid_clean is null and mob_clean is null then
    raise exception 'identifier_required' using errcode = '22023';
  end if;

  if nid_clean is not null and not public.validate_national_id(nid_clean) then
    raise exception 'invalid_national_id' using errcode = '22023';
  end if;

  if nid_clean is not null and mob_clean is not null then
    v_lookup_kind := 'both';
  elsif nid_clean is not null then
    v_lookup_kind := 'national_id';
  else
    v_lookup_kind := 'mobile';
  end if;

  v_identifier_hash := md5(coalesce(nid_clean, '') || '|' || coalesce(mob_clean, ''));

  -- Per-identifier rate limit: 20 attempts / hour (success or failure).
  select count(*) into recent_attempts
  from public.public_portal_access_logs as _log
  where _log.identifier_hash = v_identifier_hash
    and _log.created_at > now() - interval '1 hour';

  if recent_attempts >= 20 then
    insert into public.public_portal_access_logs (customer_id, lookup_kind, identifier_hash, result)
    values (null, v_lookup_kind, v_identifier_hash, 'rate_limited');
    raise exception 'rate_limited' using errcode = '42501';
  end if;

  -- Count exact matches on non-archived customers.
  select count(*) into match_count
  from public.customers as c
  where c.status <> 'archived'
    and (
      (nid_clean is not null and mob_clean is not null
        and c.national_id = nid_clean
        and (c.mobile = mob_clean or c.phone2 = mob_clean))
      or (nid_clean is not null and mob_clean is null
        and c.national_id = nid_clean)
      or (nid_clean is null and mob_clean is not null
        and (c.mobile = mob_clean or c.phone2 = mob_clean))
    );

  if match_count = 0 then
    insert into public.public_portal_access_logs (customer_id, lookup_kind, identifier_hash, result)
    values (null, v_lookup_kind, v_identifier_hash, 'not_found');
    return jsonb_build_object(
      'found', false,
      'reason', 'not_found',
      'customer', null,
      'notes', '[]'::jsonb,
      'contacts', '[]'::jsonb,
      'guarantors', '[]'::jsonb,
      'contracts', '[]'::jsonb,
      'installments', '[]'::jsonb,
      'documents', '[]'::jsonb,
      'transactions', '[]'::jsonb,
      'summary', null,
      'matches', '[]'::jsonb
    );
  end if;

  if match_count > 1 then
    select coalesce(jsonb_agg(
      jsonb_build_object('id', c2.id, 'code', c2.code, 'full_name', c2.full_name)
      order by c2.code
    ), '[]'::jsonb)
    into v_matches
    from public.customers as c2
    where c2.status <> 'archived'
      and (
        (nid_clean is not null and mob_clean is not null
          and c2.national_id = nid_clean
          and (c2.mobile = mob_clean or c2.phone2 = mob_clean))
        or (nid_clean is not null and mob_clean is null
          and c2.national_id = nid_clean)
        or (nid_clean is null and mob_clean is not null
          and (c2.mobile = mob_clean or c2.phone2 = mob_clean))
      );
    insert into public.public_portal_access_logs (customer_id, lookup_kind, identifier_hash, result)
    values (null, v_lookup_kind, v_identifier_hash, 'multiple_matches');
    return jsonb_build_object(
      'found', false,
      'reason', 'multiple_matches',
      'customer', null,
      'notes', '[]'::jsonb,
      'contacts', '[]'::jsonb,
      'guarantors', '[]'::jsonb,
      'contracts', '[]'::jsonb,
      'installments', '[]'::jsonb,
      'documents', '[]'::jsonb,
      'transactions', '[]'::jsonb,
      'summary', null,
      'matches', v_matches
    );
  end if;

  -- Exactly one match.
  select c.* into cust
  from public.customers as c
  where c.status <> 'archived'
    and (
      (nid_clean is not null and mob_clean is not null
        and c.national_id = nid_clean
        and (c.mobile = mob_clean or c.phone2 = mob_clean))
      or (nid_clean is not null and mob_clean is null
        and c.national_id = nid_clean)
      or (nid_clean is null and mob_clean is not null
        and (c.mobile = mob_clean or c.phone2 = mob_clean))
    )
  limit 1;

  matched_customer_id := cust.id;

  select to_jsonb(c) || jsonb_build_object(
    'branch_name', b.name
  )
  into v_customer
  from public.customers as c
  left join public.branches as b on b.id = c.branch_id
  where c.id = matched_customer_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', n.id,
      'note', n.note,
      'note_type', n.note_type,
      'next_followup_at', n.next_followup_at,
      'created_at', n.created_at,
      'created_by_name', coalesce(p.full_name, 'مستخدم محذوف')
    ) order by n.created_at desc, n.id desc
  ), '[]'::jsonb)
  into v_notes
  from public.customer_notes as n
  left join public.profiles as p on p.id = n.created_by
  where n.customer_id = matched_customer_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', ct.id,
      'label', ct.label,
      'mobile', ct.mobile,
      'note', ct.note,
      'created_at', ct.created_at
    ) order by ct.created_at desc, ct.id desc
  ), '[]'::jsonb)
  into v_contacts
  from public.customer_contacts as ct
  where ct.customer_id = matched_customer_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', g.id,
      'full_name', g.full_name,
      'national_id', g.national_id,
      'mobile', g.mobile,
      'job', g.job,
      'address', g.address,
      'contract_number', c.number,
      'role', cg.role
    ) order by c.number, g.full_name
  ), '[]'::jsonb)
  into v_guarantors
  from public.contract_guarantors as cg
  join public.contracts as c on c.id = cg.contract_id
  join public.guarantors as g on g.id = cg.guarantor_id
  where c.customer_id = matched_customer_id
    and g.is_active
    and c.status in ('active', 'completed');

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'number', c.number,
      'contract_date', c.contract_date,
      'total_amount', c.total_amount,
      'down_payment', c.down_payment,
      'financed_amount', c.financed_amount,
      'installment_count', c.installment_count,
      'frequency', c.frequency,
      'first_due_date', c.first_due_date,
      'status', c.status
    ) order by c.contract_date desc, c.number desc
  ), '[]'::jsonb)
  into v_contracts
  from public.contracts as c
  where c.customer_id = matched_customer_id
    and c.status in ('active', 'completed');

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', v.id,
      'contract_number', c.number,
      'installment_no', v.installment_no,
      'due_date', v.due_date,
      'amount', v.amount,
      'paid_amount', v.paid_amount,
      'remaining_amount', v.remaining_amount,
      'stored_status', v.stored_status,
      'computed_status', v.computed_status,
      'display_status', (case when v.stored_status = 'waived' then 'waived' else v.computed_status end)
    ) order by v.due_date, v.installment_no
  ), '[]'::jsonb)
  into v_installments
  from public.v_installment_status as v
  join public.contracts as c on c.id = v.contract_id
  join public.installment_schedules as s on s.id = v.schedule_id
  where v.customer_id = matched_customer_id
    and c.status in ('active', 'completed')
    and s.status = 'active';

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', d.id,
      'doc_number', d.doc_number,
      'title', d.title,
      'doc_type', d.doc_type,
      'status', d.status,
      'notes', d.notes,
      'created_at', d.created_at,
      'file_count', (select count(*)::integer from public.document_files as df where df.document_id = d.id)
    ) order by d.created_at desc, d.id desc
  ), '[]'::jsonb)
  into v_documents
  from public.documents as d
  where d.owner_type = 'customer'
    and d.customer_id = matched_customer_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'transaction_date', t.transaction_date,
      'transaction_type', t.transaction_type,
      'amount', t.amount,
      'notes', t.notes,
      'reference_type', t.reference_type,
      'reference_id', t.reference_id
    ) order by t.transaction_date, t.created_at
  ), '[]'::jsonb)
  into v_transactions
  from public.customer_transactions as t
  where t.customer_id = matched_customer_id;

  select jsonb_build_object(
    'total_amount', coalesce(sum(case when disp <> 'waived' then amount else 0 end), 0),
    'total_paid', coalesce(sum(case when disp <> 'waived' then paid_amount else 0 end), 0),
    'total_remaining', coalesce(sum(case when disp <> 'waived' then greatest(remaining_amount, 0) else 0 end), 0),
    'overdue_count', coalesce(sum(case when disp = 'overdue' then 1 else 0 end), 0),
    'overdue_amount', coalesce(sum(case when disp = 'overdue' then greatest(remaining_amount, 0) else 0 end), 0),
    'due_count', coalesce(sum(case when disp = 'due' then 1 else 0 end), 0),
    'due_amount', coalesce(sum(case when disp = 'due' then greatest(remaining_amount, 0) else 0 end), 0),
    'paid_count', coalesce(sum(case when disp = 'paid' then 1 else 0 end), 0),
    'next_due_date', min(due_date) filter (where disp in ('pending', 'due', 'overdue')),
    'next_due_amount', (array_agg(remaining_amount order by due_date) filter (where disp in ('pending', 'due', 'overdue')))[1]
  ) into v_summary
  from (
    select v2.amount, v2.paid_amount, v2.remaining_amount, v2.due_date,
           (case when v2.stored_status = 'waived' then 'waived' else v2.computed_status end) as disp
    from public.v_installment_status as v2
    join public.contracts as c2 on c2.id = v2.contract_id
    join public.installment_schedules as s2 on s2.id = v2.schedule_id
    where v2.customer_id = matched_customer_id
      and c2.status in ('active', 'completed')
      and s2.status = 'active'
  ) as pub_inst;

  -- Append counts (not in the aggregate above).
  v_summary := v_summary || jsonb_build_object(
    'contract_count', (select count(*)::integer from public.contracts where customer_id = matched_customer_id and status in ('active', 'completed')),
    'active_contract_count', (select count(*)::integer from public.contracts where customer_id = matched_customer_id and status = 'active')
  );

  insert into public.public_portal_access_logs (customer_id, lookup_kind, identifier_hash, result)
  values (matched_customer_id, v_lookup_kind, v_identifier_hash, 'found');

  return jsonb_build_object(
    'found', true,
    'reason', 'ok',
    'customer', v_customer,
    'notes', v_notes,
    'contacts', v_contacts,
    'guarantors', v_guarantors,
    'contracts', v_contracts,
    'installments', v_installments,
    'documents', v_documents,
    'transactions', v_transactions,
    'summary', v_summary,
    'matches', '[]'::jsonb
  );
end;
$$;

revoke all on function public.public_portal_lookup(text, text) from public, anon;
grant execute on function public.public_portal_lookup(text, text) to anon, authenticated, service_role;

-- Dependencies called from inside the security-definer RPC must also be
-- callable when the caller is `anon` (Supabase resolves them with the
-- caller's JWT for function permission checks in some paths). They are pure
-- validators with no data access, so exposing them to anon is safe.
revoke all on function public.validate_national_id(text) from public, anon;
grant execute on function public.validate_national_id(text) to anon, authenticated, service_role;

revoke all on function public.normalize_egypt_mobile(text) from public, anon;
grant execute on function public.normalize_egypt_mobile(text) to anon, authenticated, service_role;

comment on function public.public_portal_lookup(text, text) is
  'Public read-only snapshot for the results page. Exact-match only; metadata for documents; active contracts/schedules only.';
comment on table public.public_portal_access_logs is
  'Audit + per-identifier rate budget for public portal lookups. Stores md5(identifier), never the raw value.';
