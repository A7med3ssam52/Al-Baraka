-- Fix smart search normalization (الهمزات/التاء/التشكيل) + harden LIKE.
--
-- Migration 20261112000000 had translate():
--   source 'أإآؤ ئةى' -> target 'اااوىءنهي'
-- which mapped space -> ى (gluing words), ئ -> ء (wrong), ة -> ن (wrong).
-- This redefines normalize_search_arabic with the correct mapping and
-- re-escapes LIKE wildcards in search_customers so user input can
-- never break or tilt the pattern.

create or replace function public.normalize_search_arabic(input_text text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select nullif(btrim(
    regexp_replace(
      translate(
        lower(coalesce(input_text, '')),
        'أإآؤئىة',
        'اااوييه'
      ),
      '[ـً-ٰٟ]', '', 'g'
    )
  ), '')
$$;

-- Escape LIKE metacharacters inside user tokens.
create or replace function public.escape_like(input_text text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select replace(replace(replace(coalesce(input_text, ''), '\', '\\'), '%', '\%'), '_', '\_')
$$;

create or replace function public.search_customers(
  p_search text default null,
  p_status text default 'all',
  p_limit integer default 200
)
returns table (
  id uuid,
  code text,
  full_name text,
  national_id text,
  mobile text,
  phone2 text,
  job text,
  address text,
  status text,
  notes text,
  branch_id uuid,
  credit_balance numeric,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  q_raw text := btrim(coalesce(p_search, ''));
  q_norm text;
  q_digits text;
  q_mobile text;
  tokens text[] := '{}';
  t text;
  t_digits text;
begin
  if not public.has_permission('customers.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  q_norm := public.normalize_search_arabic(q_raw);
  q_digits := public.normalize_search_digits(q_raw);
  q_mobile := public.normalize_search_mobile(q_raw);

  if q_norm is not null and q_norm <> '' then
    foreach t in array string_to_array(q_norm, ' ') loop
      if btrim(t) <> '' then tokens := array_append(tokens, btrim(t)); end if;
    end loop;
  end if;

  return query
  with searched as (
    select
      c.id, c.code, c.full_name, c.national_id, c.mobile, c.phone2,
      c.job, c.address, c.status, c.notes, c.branch_id, c.credit_balance, c.created_at,
      public.normalize_search_arabic(c.full_name) as norm_name,
      public.normalize_search_digits(c.national_id) as nid_digits,
      coalesce(public.normalize_search_mobile(c.mobile), '') as mobile_nat,
      public.normalize_search_digits(c.mobile) as mobile_full,
      coalesce(public.normalize_search_mobile(c.phone2), '') as phone2_nat,
      public.normalize_search_digits(c.phone2) as phone2_full,
      public.normalize_search_digits(c.code) as code_digits
    from public.customers as c
    where (p_status is null or lower(btrim(p_status)) = 'all' or c.status = lower(btrim(p_status)))
  )
  select id, code, full_name, national_id, mobile, phone2, job, address, status, notes, branch_id, credit_balance, created_at
  from searched as s
  where (
    q_norm is null or q_norm = '' or (
      not exists (
        select 1 from unnest(tokens) as tok
        cross join lateral (
          select public.normalize_search_digits(tok) as tok_digits
        ) as td
        where not (
          s.norm_name like '%' || public.escape_like(tok) || '%' or
          lower(s.code) like '%' || public.escape_like(tok) || '%' or
          (td.tok_digits <> '' and (
            s.nid_digits like '%' || public.escape_like(td.tok_digits) || '%' or
            s.mobile_nat like '%' || public.escape_like(td.tok_digits) || '%' or
            s.mobile_full like '%' || public.escape_like(td.tok_digits) || '%' or
            s.phone2_nat like '%' || public.escape_like(td.tok_digits) || '%' or
            s.phone2_full like '%' || public.escape_like(td.tok_digits) || '%' or
            s.code_digits like '%' || public.escape_like(td.tok_digits) || '%'
          ))
        )
      )
    )
  )
  order by
    case
      when q_digits is not null and q_digits <> '' and s.nid_digits = q_digits then 0
      when q_mobile is not null and s.mobile_nat = q_mobile then 1
      when lower(s.code) = lower(q_norm) then 2
      when q_digits is not null and q_digits <> '' and s.code_digits = q_digits then 2
      when s.norm_name like public.escape_like(q_norm) || '%' then 3
      else 4
    end,
    s.code
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

revoke all on function public.normalize_search_arabic(text) from public, anon;
grant execute on function public.normalize_search_arabic(text) to authenticated, service_role;
revoke all on function public.escape_like(text) from public, anon;
grant execute on function public.escape_like(text) to authenticated, service_role;
revoke all on function public.search_customers(text, text, integer) from public, anon;
grant execute on function public.search_customers(text, text, integer) to authenticated, service_role;
