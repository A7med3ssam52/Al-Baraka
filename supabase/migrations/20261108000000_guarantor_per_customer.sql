-- M2.3-Fix — Guarantor per customer (الضامن يظهر للعميل بتاعه بس).
--
-- المشكلة: public.guarantors سجل عام (branch-scoped) بلا ربط بعميل، و
-- list_guarantors يرجّع كل الضامنين، و GuarantorsPanel يعرضهم لكل عميل —
-- فأي ضامن يُضاف من عميل بيظهر عند كل العملاء.
--
-- الحل: جدول ربط public.customer_guarantors (عميل ↔ ضامن). نفس الشخص
-- ممكن يكون ضامن لعميلين، لكن كل عميل بيشوف ضامنيه بس.
--   * backfill من contract_guarantors (الربط الحقيقي الحالي عبر العقود)
--   * add_guarantor بـ p_customer_id اختياري: يخلق الضامن + يربطه بالعميل،
--     ولو الرقم القومي موجود بيربطه بالعميل الجديد بدل ما يفشل.
--   * list_customer_guarantors(p_customer_id): للبانل بتاع العميل
--   * trigger: ربط عقد ↔ ضامن يضيف تلقائيًا للعميل بتاع العقد.

create table if not exists public.customer_guarantors (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  guarantor_id uuid not null references public.guarantors (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  unique (customer_id, guarantor_id)
);

create index if not exists customer_guarantors_customer_idx
  on public.customer_guarantors (customer_id);
create index if not exists customer_guarantors_guarantor_idx
  on public.customer_guarantors (guarantor_id);

alter table public.customer_guarantors enable row level security;

drop policy if exists customer_guarantors_select_authorized on public.customer_guarantors;
create policy customer_guarantors_select_authorized
on public.customer_guarantors
for select
to authenticated
using (
  public.has_permission('customers.view')
  and exists (
    select 1 from public.customers as customer
    where customer.id = customer_id
      and public.is_branch_member(customer.branch_id)
  )
);

revoke all on public.customer_guarantors from public, anon, authenticated;
grant select on public.customer_guarantors to authenticated;

-- Backfill: أي ضامن مرتبط بعقد عميل يُعتبر ضامن لهذا العميل.
insert into public.customer_guarantors (customer_id, guarantor_id)
select distinct c.customer_id, cg.guarantor_id
from public.contract_guarantors as cg
join public.contracts as c on c.id = cg.contract_id
on conflict (customer_id, guarantor_id) do nothing;

-- إبقاء الجدول متزامنًا: ربط عقد ↔ ضامن يربط الضامن بعميل العقد.
create or replace function public.sync_customer_guarantor_on_contract_link()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid;
begin
  select customer_id into v_customer_id
  from public.contracts where id = NEW.contract_id;

  if v_customer_id is not null then
    insert into public.customer_guarantors (customer_id, guarantor_id, created_by)
    values (v_customer_id, NEW.guarantor_id, NEW.created_by)
    on conflict (customer_id, guarantor_id) do nothing;
  end if;

  return NEW;
end;
$$;

drop trigger if exists sync_customer_guarantor_on_contract_link on public.contract_guarantors;
create trigger sync_customer_guarantor_on_contract_link
after insert on public.contract_guarantors
for each row execute function public.sync_customer_guarantor_on_contract_link();

-- ---------------------------------------------------------------------------
-- add_guarantor بـ p_customer_id (6 args). نستبدل الـ 5-arg القديمة بنفس
-- التوقيع الوسّع (p_customer_id اختياري) عشان مكالمات الـ RPC ما تبقاش
-- ملتبسة بين overloads — الـ 5-arg الفرعي بيشتغل بنفس الدالة.
-- ---------------------------------------------------------------------------

drop function if exists public.add_guarantor(text, text, text, text, text);

create or replace function public.add_guarantor(
  p_full_name text,
  p_national_id text,
  p_mobile text,
  p_job text default null,
  p_address text default null,
  p_customer_id uuid default null
)
returns public.guarantors
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  nid text;
  new_row public.guarantors;
  existing public.guarantors;
begin
  if not public.has_permission('customers.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_full_name is null or char_length(btrim(p_full_name)) < 3 then
    raise exception 'invalid_guarantor_name' using errcode = '22023';
  end if;

  nid := regexp_replace(btrim(coalesce(p_national_id, '')), '\D', '', 'g');

  if not public.validate_national_id(nid) then
    raise exception 'invalid_national_id' using errcode = '22023';
  end if;

  if p_customer_id is not null then
    if not exists (select 1 from public.customers as c where c.id = p_customer_id) then
      raise exception 'customer_missing' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from public.customers as c
      where c.id = p_customer_id and public.is_branch_member(c.branch_id)
    ) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  select * into existing from public.guarantors where national_id = nid;

  if found then
    -- نفس الشخص موجود: اربطه بالعميل الجديد (لو اتطلب) ورجّعه.
    if p_customer_id is not null then
      insert into public.customer_guarantors (customer_id, guarantor_id, created_by)
      values (p_customer_id, existing.id, auth.uid())
      on conflict (customer_id, guarantor_id) do nothing;
    end if;
    return existing;
  end if;

  insert into public.guarantors (
    full_name, national_id, mobile, job, address, branch_id, created_by, updated_by
  )
  values (
    btrim(p_full_name), nid, public.normalize_egypt_mobile(p_mobile),
    nullif(btrim(coalesce(p_job, '')), ''),
    nullif(btrim(coalesce(p_address, '')), ''),
    public.current_branch(), auth.uid(), auth.uid()
  )
  returning * into new_row;

  if p_customer_id is not null then
    insert into public.customer_guarantors (customer_id, guarantor_id, created_by)
    values (p_customer_id, new_row.id, auth.uid())
    on conflict (customer_id, guarantor_id) do nothing;
  end if;

  return new_row;
end;
$$;

revoke all on function public.add_guarantor(text, text, text, text, text, uuid) from public, anon;
grant execute on function public.add_guarantor(text, text, text, text, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- list_customer_guarantors: ضامنين عميل واحد بس (أصلح للبانل).
-- ---------------------------------------------------------------------------

create or replace function public.list_customer_guarantors(
  p_customer_id uuid,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  full_name text,
  national_id text,
  mobile text,
  job text,
  address text,
  is_active boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select g.id, g.full_name, g.national_id, g.mobile,
         g.job, g.address, g.is_active, g.created_at
  from public.customer_guarantors as cg
  join public.guarantors as g on g.id = cg.guarantor_id
  where cg.customer_id = p_customer_id
    and g.is_active
    and (p_search is null or g.full_name ilike '%' || btrim(p_search) || '%'
         or g.national_id ilike '%' || btrim(p_search) || '%'
         or g.mobile ilike '%' || btrim(p_search) || '%')
  order by g.created_at desc, g.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.list_customer_guarantors(uuid, text, integer, integer) from public, anon;
grant execute on function public.list_customer_guarantors(uuid, text, integer, integer) to authenticated, service_role;

drop trigger if exists audit_customer_guarantors_change on public.customer_guarantors;
create trigger audit_customer_guarantors_change
after insert or update or delete on public.customer_guarantors
for each row execute function public.audit_row_change();
