-- M1.4 — Branches, settings, and atomic numbering tests (pgTAP).
-- Run with: supabase test db
--
-- Self-contained: creates two branches and five staff users, exercises the
-- settings and numbering RPCs, and rolls everything back.

begin;

create extension if not exists pgtap;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures.
-- ---------------------------------------------------------------------------

insert into public.branches (id, code, name, address, is_active)
values
  ('b3000000-0000-4000-8000-000000000001', 'TST-51', 'فرع ترقيم M1.4 أول', 'اختبار M1.4', true),
  ('b3000000-0000-4000-8000-000000000002', 'TST-52', 'فرع ترقيم M1.4 ثانٍ', 'اختبار M1.4', true)
on conflict (code) do update
set name = excluded.name,
    address = excluded.address,
    is_active = excluded.is_active;

insert into public.staff_signup_claims (email, expires_at)
values
  ('m1.4.manager.tst@example.com', now() + interval '15 minutes'),
  ('m1.4.sales.tst@example.com', now() + interval '15 minutes'),
  ('m1.4.viewer.tst@example.com', now() + interval '15 minutes'),
  ('m1.4.accountant.tst@example.com', now() + interval '15 minutes'),
  ('m1.4.owner.tst@example.com', now() + interval '15 minutes');

insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'm1.4.manager.tst@example.com',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
    '{"full_name":"مدير ترقيم M1.4"}'::jsonb,
    now(),
    now()
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'm1.4.sales.tst@example.com',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
    '{"full_name":"مبيعات ترقيم M1.4"}'::jsonb,
    now(),
    now()
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'm1.4.viewer.tst@example.com',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
    '{"full_name":"مشاهد ترقيم M1.4"}'::jsonb,
    now(),
    now()
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'm1.4.accountant.tst@example.com',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
    '{"full_name":"محاسب ترقيم M1.4"}'::jsonb,
    now(),
    now()
  ),
  (
    '30000000-0000-4000-8000-000000000005',
    'authenticated',
    'authenticated',
    'm1.4.owner.tst@example.com',
    now(),
    '{"provider":"email","providers":["email"],"account_type":"staff"}'::jsonb,
    '{"full_name":"مالك ترقيم M1.4"}'::jsonb,
    now(),
    now()
  )
on conflict (id) do nothing;

update public.profiles
set branch_id = 'b3000000-0000-4000-8000-000000000001'::uuid,
    role = case id
      when '30000000-0000-4000-8000-000000000001' then 'manager'
      when '30000000-0000-4000-8000-000000000002' then 'sales'
      when '30000000-0000-4000-8000-000000000003' then 'viewer'
      when '30000000-0000-4000-8000-000000000004' then 'accountant'
      when '30000000-0000-4000-8000-000000000005' then 'owner'
      else 'viewer'
    end
where id in (
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000004',
  '30000000-0000-4000-8000-000000000005'
);

insert into public.user_branches (user_id, branch_id, is_default)
select fixture.user_id, fixture.branch_id, true
from (
  values
    ('30000000-0000-4000-8000-000000000001'::uuid, 'b3000000-0000-4000-8000-000000000001'::uuid),
    ('30000000-0000-4000-8000-000000000002'::uuid, 'b3000000-0000-4000-8000-000000000001'::uuid),
    ('30000000-0000-4000-8000-000000000003'::uuid, 'b3000000-0000-4000-8000-000000000001'::uuid),
    ('30000000-0000-4000-8000-000000000004'::uuid, 'b3000000-0000-4000-8000-000000000001'::uuid),
    ('30000000-0000-4000-8000-000000000005'::uuid, 'b3000000-0000-4000-8000-000000000001'::uuid)
) as fixture(user_id, branch_id)
on conflict (user_id, branch_id) do update
set is_default = excluded.is_default;

insert into public.user_roles (user_id, role_id, branch_id, is_primary)
select fixture.user_id, role.id, fixture.branch_id, true
from (
  values
    ('30000000-0000-4000-8000-000000000001'::uuid, 'manager'::text, 'b3000000-0000-4000-8000-000000000001'::uuid),
    ('30000000-0000-4000-8000-000000000002'::uuid, 'sales'::text, 'b3000000-0000-4000-8000-000000000001'::uuid),
    ('30000000-0000-4000-8000-000000000003'::uuid, 'viewer'::text, 'b3000000-0000-4000-8000-000000000001'::uuid),
    ('30000000-0000-4000-8000-000000000004'::uuid, 'accountant'::text, 'b3000000-0000-4000-8000-000000000001'::uuid),
    ('30000000-0000-4000-8000-000000000005'::uuid, 'owner'::text, 'b3000000-0000-4000-8000-000000000001'::uuid)
) as fixture(user_id, role_code, branch_id)
join public.roles as role on role.code = fixture.role_code
on conflict (user_id, role_id, branch_id) do update
set is_primary = excluded.is_primary;

select public.no_plan();

-- ---------------------------------------------------------------------------
-- Branch defaults.
-- ---------------------------------------------------------------------------

select public.is(
  (select count(*) from public.cashboxes where branch_id = 'b3000000-0000-4000-8000-000000000001'),
  1::bigint,
  'a new branch receives a default cashbox'
);

select public.is(
  (select count(*) from public.number_sequences where branch_id = 'b3000000-0000-4000-8000-000000000001'),
  6::bigint,
  'a new branch receives six document sequences'
);

select public.is(
  (select is_active from public.bank_accounts where branch_id = 'b3000000-0000-4000-8000-000000000001' and code = 'BANK-01'),
  false,
  'the bank placeholder starts inactive'
);

select public.throws_ok(
  $$ insert into public.branches (code, name) values ('bad code', 'فرع غير صالح') $$,
  '23514',
  null,
  'branch codes must match the uppercase format'
);

select public.throws_ok(
  $$ update public.branches set id = gen_random_uuid() where code = 'TST-51' $$,
  '42501',
  'branch_id_immutable',
  'branch ids are immutable'
);

select public.throws_ok(
  $$ update public.branches set is_active = false where code = 'SNH-01' $$,
  '42501',
  'launch_branch_active_required',
  'the launch branch cannot be deactivated'
);

select public.throws_ok(
  $$ update public.branches set code = 'SNH-02' where code = 'SNH-01' $$,
  '42501',
  'launch_branch_code_immutable',
  'the launch branch code is immutable'
);

-- ---------------------------------------------------------------------------
-- Manager settings and numbering.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.is(
  (select count(*) from public.list_document_sequences('b3000000-0000-4000-8000-000000000001')),
  6::bigint,
  'manager can list six document sequences for their branch'
);

select public.is(
  (select prefix from public.list_document_sequences('b3000000-0000-4000-8000-000000000001') where document_type = 'sales_invoice'),
  'SAL',
  'the seeded sales prefix is SAL'
);

select public.matches(
  public.next_document_number('sales_invoice', 'b3000000-0000-4000-8000-000000000001'),
  '^SAL-[0-9]{4}-00001$',
  'the first sales document number starts at 00001'
);

select public.is(
  (
    select count(distinct value)
    from (
      select public.next_document_number(
        'sales_invoice',
        'b3000000-0000-4000-8000-000000000001'
      ) as value
      from generate_series(1, 50)
    ) as generated
  ),
  50::bigint,
  'fifty sequential allocations produce fifty distinct numbers'
);

select public.is(
  (
    select count(distinct value)
    from (
      select public.next_document_number(
        'sales_invoice',
        'b3000000-0000-4000-8000-000000000001'
      ) as value
      from generate_series(1, 25)
    ) as generated
  ),
  25::bigint,
  'a second batch also produces unique numbers'
);

select public.is(
  public.next_document_number('sales_invoice', 'b3000000-0000-4000-8000-000000000001'),
  'SAL-' || extract(year from (now() at time zone 'Africa/Cairo'))::integer::text || '-00077',
  'the sequence continues without gaps after 76 allocations'
);

select public.throws_ok(
  $$ select public.next_document_number('sales_invoice', 'b3000000-0000-4000-8000-000000000002') $$,
  '42501',
  'forbidden',
  'a manager cannot allocate numbers for a branch outside their scope; the second branch is tested by the owner below'
);

select public.throws_ok(
  $$ select public.list_document_sequences('b3000000-0000-4000-8000-000000000002') $$,
  '42501',
  'forbidden',
  'manager cannot read sequences for a branch outside their scope'
);

select public.matches(
  public.next_document_number('journal_entry', 'b3000000-0000-4000-8000-000000000001'),
  '^JV-[0-9]{4}-00001$',
  'manager can number journal entries'
);

select public.is(
  (
    select (public.update_system_settings(
      p_app_name => 'معرض البركة',
      p_logo_url => null,
      p_address => 'محافظة الشرقية — مركز صان الحجر',
      p_phone => '01000172840',
      p_email => null,
      p_tax_number => null,
      p_currency => 'EGP',
      p_timezone => 'Africa/Cairo',
      p_document_prefixes => '{"sales_invoice":"INV","purchase_invoice":"PUR","contract":"CON","receipt":"REC","payment":"PAY","journal_entry":"JV"}'::jsonb,
      p_default_discount_limit => 5000
    ) ->> 'default_discount_limit')::numeric
  ),
  5000.00::numeric,
  'manager can update the showroom settings'
);

select public.matches(
  public.next_document_number('sales_invoice', 'b3000000-0000-4000-8000-000000000001'),
  '^INV-[0-9]{4}-00078$',
  'the new sales prefix applies to the next number'
);

select public.is(
  (select prefix from public.list_document_sequences('b3000000-0000-4000-8000-000000000001')
   where document_type = 'sales_invoice'),
  'INV',
  'the sequence prefix is synchronized with the settings'
);

select public.throws_ok(
  $$ select public.update_system_settings(
       p_app_name => 'معرض البركة',
       p_document_prefixes => '{"sales_invoice":"x"}'::jsonb
     ) $$,
  '22023',
  'invalid_document_prefix',
  'invalid document prefixes are rejected'
);

select public.throws_ok(
  $$ select public.update_system_settings(
       p_app_name => 'معرض البركة',
       p_timezone => 'Not/A_Timezone'
     ) $$,
  '22023',
  'invalid_timezone',
  'invalid time zones are rejected'
);

select public.is(
  (select updated_by from public.system_settings where id),
  '30000000-0000-4000-8000-000000000001'::uuid,
  'the settings update records the acting manager'
);

-- ---------------------------------------------------------------------------
-- Sales, viewer, accountant, and owner boundaries.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select public.matches(
  public.next_document_number('sales_invoice', 'b3000000-0000-4000-8000-000000000001'),
  '^INV-[0-9]{4}-00079$',
  'sales can allocate a sales invoice number'
);

select public.throws_ok(
  $$ select public.next_document_number('journal_entry', 'b3000000-0000-4000-8000-000000000001') $$,
  '42501',
  'forbidden',
  'sales cannot allocate a journal entry number'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

select public.throws_ok(
  $$ select public.next_document_number('sales_invoice', 'b3000000-0000-4000-8000-000000000001') $$,
  '42501',
  'forbidden',
  'viewer cannot allocate document numbers'
);

select public.throws_ok(
  $$ select public.update_system_settings(p_app_name => 'محاولة مشاهد') $$,
  '42501',
  'forbidden',
  'viewer cannot update settings'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

select public.throws_ok(
  $$ select public.update_system_settings(p_app_name => 'محاولة محاسب') $$,
  '42501',
  'forbidden',
  'accountant can read settings but cannot update them'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);

select public.ok(
  (select count(*) from public.list_document_sequences('b3000000-0000-4000-8000-000000000002')) = 6,
  'owner can read sequences for any branch'
);

select public.matches(
  public.next_document_number('journal_entry', 'b3000000-0000-4000-8000-000000000002'),
  '^JV-[0-9]{4}-00001$',
  'owner can allocate a journal entry number in another branch'
);

reset role;

select * from public.finish();

rollback;
