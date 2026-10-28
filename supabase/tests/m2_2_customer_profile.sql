-- M2.2 — Customer profile tests (pgTAP): notes timeline, pagination, assignee.
-- Self-contained fixtures + rollback. Fixed UUIDs keep asserts independent.

begin;

create extension if not exists pgtap;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures.
-- ---------------------------------------------------------------------------

insert into public.branches (id, code, name, is_active)
values ('b0000000-0000-4000-8000-000000000002', 'TST-02', 'فرع اختبار M2.2', true)
on conflict (code) do update set is_active = excluded.is_active;

insert into public.staff_signup_claims (email, expires_at)
values ('m2.2.sales.tst@example.com', now() + interval '15 minutes');

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000201', 'authenticated', 'authenticated', 'm2.2.sales.tst@example.com', now(), '{"full_name":"مبيعات M2.2"}'::jsonb, now(), now());

insert into public.profiles (id, full_name, phone, role, branch_id, is_active)
values ('00000000-0000-4000-8000-000000000201', 'مبيعات M2.2', '+201000000201', 'sales', 'b0000000-0000-4000-8000-000000000002', true)
on conflict (id) do update
set full_name = excluded.full_name,
    phone = excluded.phone,
    role = excluded.role,
    branch_id = excluded.branch_id,
    is_active = excluded.is_active;

insert into public.user_branches (user_id, branch_id, is_default)
select u.id::uuid, b.id, true
from (values ('00000000-0000-4000-8000-000000000201', 'b0000000-0000-4000-8000-000000000002')) as u(id, branch)
join public.branches as b on b.id = u.branch::uuid
on conflict do nothing;

insert into public.user_roles (user_id, role_id, branch_id, is_primary)
select u.id::uuid, r.id, b.id, true
from (values ('00000000-0000-4000-8000-000000000201', 'sales')) as u(id, role_code)
join public.roles as r on r.code = u.role_code
join public.branches as b on b.code = 'TST-02'
on conflict do nothing;

alter table public.customers disable trigger customers_block_delete;
delete from public.customers where national_id = '30101152345671';
alter table public.customers enable trigger customers_block_delete;

insert into public.customers (code, full_name, national_id, mobile, branch_id)
values ('CUS-5231', 'عبد الملاح M2.2', '30101152345671', '+201022222001', 'b0000000-0000-4000-8000-000000000002')
on conflict (national_id) do update set full_name = excluded.full_name;

delete from public.customer_notes where customer_id = (select id from public.customers where national_id = '30101152345671');

select public.no_plan();

-- ---------------------------------------------------------------------------
-- Notes: add + list + validation.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000201","role":"authenticated"}', true);

select public.is(
  (select count(*) from public.list_customer_notes(
    (select id from public.customers where national_id = '30101152345671'))),
  0::bigint,
  'a fresh customer has no notes'
);

select public.is(
  (select created_by_name from public.add_customer_note(
    (select id from public.customers where national_id = '30101152345671'),
    'أول اتصال من العميل',
    'call',
    now() + interval '2 days')),
  (select full_name from public.profiles where id = '00000000-0000-4000-8000-000000000201'),
  'the note is attributed to the acting sales staff'
);

select public.is(
  (select note_type from public.add_customer_note(
    (select id from public.customers where national_id = '30101152345671'),
    'زيارة الوحدة',
    'visit')),
  'visit',
  'a visit note stores its type'
);

select public.matches(
  (select note_type from public.add_customer_note(
    (select id from public.customers where national_id = '30101152345671'),
    'وعد سداد بقيمة', 'PROMISE')),
  '^promise$',
  'note types are normalized to lowercase'
);

select public.throws_ok(
  $$ select public.add_customer_note(
    (select id from public.customers where national_id = '30101152345671'),
    'ملاحظة', 'invalid_type') $$,
  '22023',
  null,
  'an unsupported note type is rejected'
);

select public.throws_ok(
  $$ select public.add_customer_note(
    (select id from public.customers where national_id = '30101152345671'),
    ' ') $$,
  '22023',
  null,
  'an empty note is rejected'
);

select public.throws_ok(
  $$ select public.add_customer_note(
    gen_random_uuid(), 'ملاحظة') $$,
  'P0001',
  null,
  'a note for a missing customer is rejected'
);

-- Client writes go through the RPC only: direct inserts are denied.
select public.throws_ok(
  $$ insert into public.customer_notes (customer_id, note)
     select id, 'دخول مباشر' from public.customers where national_id = '30101152345671' $$,
  '42501',
  null,
  'direct note inserts are denied'
);

update public.customer_notes set note = note where customer_id = (select id from public.customers where national_id = '30101152345671');

select public.is(
  (select count(*) from public.list_customer_notes(
    (select id from public.customers where national_id = '30101152345671'))),
  3::bigint,
  'three notes are listed after three timeline entries'
);

select public.is(
  (select count(*) from public.list_customer_notes(
    (select id from public.customers where national_id = '30101152345671'),
    2, 0)),
  2::bigint,
  'the limit parameter caps the page size'
);

select public.is(
  (select count(*) from public.list_customer_notes(
    (select id from public.customers where national_id = '30101152345671'),
    2, 2)),
  1::bigint,
  'the offset parameter paginates the timeline'
);

-- ---------------------------------------------------------------------------
-- Assignee.
-- ---------------------------------------------------------------------------

select public.is(
  (select assigned_to from public.set_customer_assignee(
    (select id from public.customers where national_id = '30101152345671'),
    '00000000-0000-4000-8000-000000000201')),
  '00000000-0000-4000-8000-000000000201',
  'the assignee is stored on the customer row'
);

select public.throws_ok(
  $$ select public.set_customer_assignee(
    (select id from public.customers where national_id = '30101152345671'),
    gen_random_uuid()) $$,
  '22023',
  null,
  'an unknown staff assignee is rejected'
);

select public.throws_ok(
  $$ select public.set_customer_assignee(
    gen_random_uuid(), '00000000-0000-4000-8000-000000000201') $$,
  'P0001',
  null,
  'an assignee set on a missing customer is rejected'
);

-- ---------------------------------------------------------------------------
-- Audit rows exist for the notes (checked as the runner; audit RLS has no
-- client select policy).
-- ---------------------------------------------------------------------------

reset role;

select public.ok(
  (
    select count(*) = 3
    from public.audit_logs
    where table_name = 'customer_notes'
      and record_id in (select id::text from public.customer_notes
                        where customer_id = (select id from public.customers where national_id = '30101152345671'))
      and action = 'insert'
  ),
  'each timeline entry is audited on insert'
);

select public.finish();
rollback;
