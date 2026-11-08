-- Smart customer search (بحث ذكي للعملاء).
--
-- يبحث على قد الشوق:
--   * أسماء عربية تتسامح مع الهمزات والتاء المربوطة والتشكيل (أحمد = احمد = إحمد).
--   * أرقام عربية/فارسية (٠١٢٣) بتتحول لأرقام لاتينية.
--   * رقم قومي بمسافات أو من غير، كود بالـ CUS- أو من غير، موبايل بأي صيغة
--     (010... / +2010... / 2010... / 002010... / 10...).
--   * كلمات متعددة: كل كلمة لازم تكون موجودة في مكان (اسم/كود/قومي/موبايل).
--   * ترتيب ذكي: التطابق التام أولاً، وبعدها البادئة، وبعدها الاحتواء.

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
        'أإآؤ ئةى',
        'اااوىءنهي'
      ),
      '[ـً-ٰٟ]', '', 'g'
    )
  ), '')
$$;

create or replace function public.normalize_search_digits(input_text text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select regexp_replace(
    translate(
      coalesce(input_text, ''),
      '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
      '01234567890123456789'
    ),
    '[^0-9]', '', 'g'
  )
$$;

-- Mobile national part (10 digits starting with 1) whatever the input format.
create or replace function public.normalize_search_mobile(input_text text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  d text := public.normalize_search_digits(input_text);
begin
  if d is null or char_length(d) < 4 then return null; end if;
  if d ~ '^0020[0-9]+$' then d := substr(d, 5);
  elsif d ~ '^20[0-9]+$' and char_length(d) > 10 then d := substr(d, 3);
  elsif d ~ '^0[0-9]+$' then d := substr(d, 2);
  end if;
  return d;
end;
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
      public.normalize_search_mobile(c.mobile) as mobile_nat,
      public.normalize_search_digits(c.mobile) as mobile_full,
      public.normalize_search_mobile(c.phone2) as phone2_nat,
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
        where not (
          s.norm_name like '%' || tok || '%' or
          lower(s.code) like '%' || tok || '%' or
          -- digit tokens additionally match id / mobile / code digits
          (public.normalize_search_digits(tok) <> '' and (
            s.nid_digits like '%' || public.normalize_search_digits(tok) || '%' or
            s.mobile_nat like '%' || public.normalize_search_digits(tok) || '%' or
            s.mobile_full like '%' || public.normalize_search_digits(tok) || '%' or
            s.phone2_nat like '%' || public.normalize_search_digits(tok) || '%' or
            s.phone2_full like '%' || public.normalize_search_digits(tok) || '%' or
            s.code_digits like '%' || public.normalize_search_digits(tok) || '%'
          )) or
          -- non-digit tokens also match code text
          (public.normalize_search_digits(tok) = '' and lower(s.code) like '%' || tok || '%')
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
      when s.norm_name like q_norm || '%' then 3
      else 4
    end,
    s.code
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

revoke all on function public.normalize_search_arabic(text) from public, anon;
grant execute on function public.normalize_search_arabic(text) to authenticated, service_role;
revoke all on function public.normalize_search_digits(text) from public, anon;
grant execute on function public.normalize_search_digits(text) to authenticated, service_role;
revoke all on function public.normalize_search_mobile(text) from public, anon;
grant execute on function public.normalize_search_mobile(text) to authenticated, service_role;
revoke all on function public.search_customers(text, text, integer) from public, anon;
grant execute on function public.search_customers(text, text, integer) to authenticated, service_role;
