-- M2.1 patch: allow custom customer codes (old ledger migration)
-- Relax the code format check and extend create_customer to accept an optional code.

alter table public.customers
  drop constraint if exists customers_code_check;

alter table public.customers
  add constraint customers_code_check
  check (code ~ '^CUS-[0-9]{1,6}$');

-- Recreate create_customer with optional p_code.
create or replace function public.create_customer(
  p_full_name text,
  p_national_id text,
  p_mobile text,
  p_phone2 text default null,
  p_job text default null,
  p_address text default null,
  p_notes text default null,
  p_branch_id uuid default null,
  p_code text default null
)
returns public.customers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_branch uuid := coalesce(p_branch_id, public.current_branch());
  nid text := regexp_replace(btrim(coalesce(p_national_id, '')), '\D', '', 'g');
  mobile text;
  phone2 text;
  new_code text;
  new_row public.customers;
begin
  if not public.has_permission('customers.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not public.is_branch_member(target_branch) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_full_name is null or char_length(btrim(p_full_name)) < 3 then
    raise exception 'invalid_customer_name' using errcode = '22023';
  end if;

  if not public.validate_national_id(nid) then
    raise exception 'invalid_national_id' using errcode = '22023';
  end if;

  mobile := public.normalize_egypt_mobile(p_mobile);

  if exists (select 1 from public.customers where national_id = nid) then
    raise exception 'duplicate_national_id' using errcode = '23505';
  end if;

  if p_phone2 is not null and btrim(p_phone2) <> '' then
    phone2 := public.normalize_egypt_mobile(p_phone2);
  end if;

  if p_code is not null and btrim(p_code) <> '' then
    new_code := upper(btrim(p_code));
    if new_code !~ '^CUS-[0-9]{1,6}$' then
      raise exception 'invalid_customer_code' using errcode = '22023';
    end if;
    if exists (select 1 from public.customers where code = new_code) then
      raise exception 'duplicate_customer_code' using errcode = '23505';
    end if;
  else
    new_code := public.next_entity_code('customer');
  end if;

  insert into public.customers (
    code, full_name, national_id, mobile, phone2, job, address, notes,
    branch_id, created_by
  )
  values (
    new_code, btrim(p_full_name), nid, mobile, phone2, p_job, p_address, p_notes,
    target_branch, auth.uid()
  )
  returning * into new_row;

  return new_row;
end;
$$;

revoke all on function public.create_customer(
  text, text, text, text, text, text, text, uuid, text
) from public;

grant execute on function public.create_customer(
  text, text, text, text, text, text, text, uuid, text
) to authenticated;
