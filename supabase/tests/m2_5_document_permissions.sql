-- M2.5 — Document permissions and stage close-out (pgTAP).
-- Self-contained fixtures + rollback. Fixed UUIDs keep asserts independent.

begin;

create extension if not exists pgtap;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Branch + two fixture users:
--   A (302): sales+inventory => documents.upload, documents.view
--   B (303): collection only  => documents.view, documents.upload
--   C (304): no roles at all  => no permissions
-- ---------------------------------------------------------------------------

insert into public.branches (id, code, name, is_active)
values ('b0000000-0000-4000-8000-000000000025', 'TST-25', 'فرع اختبار M2.5', true)
on conflict (code) do update set is_active = excluded.is_active;

insert into public.staff_signup_claims (email, expires_at)
values
  ('m2.5.a.tst@example.com', now() + interval '15 minutes'),
  ('m2.5.b.tst@example.com', now() + interval '15 minutes'),
  ('m2.5.c.tst@example.com', now() + interval '15 minutes');

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000302', 'authenticated', 'authenticated', 'm2.5.a.tst@example.com', now(), '{"full_name":"صلاحيات A"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000303', 'authenticated', 'authenticated', 'm2.5.b.tst@example.com', now(), '{"full_name":"صلاحيات B"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000304', 'authenticated', 'authenticated', 'm2.5.c.tst@example.com', now(), '{"full_name":"صلاحيات C"}'::jsonb, now(), now());

insert into public.profiles (id, full_name, phone, role, branch_id, is_active)
values
  ('00000000-0000-4000-8000-000000000302', 'صلاحيات A', '+201000000312', 'sales', 'b0000000-0000-4000-8000-000000000025', true),
  ('00000000-0000-4000-8000-000000000303', 'صلاحيات B', '+201000000313', 'collection', 'b0000000-0000-4000-8000-000000000025', true),
  ('00000000-0000-4000-8000-000000000304', 'صلاحيات C', '+201000000314', 'viewer', 'b0000000-0000-4000-8000-000000000025', true)
on conflict (id) do update
set full_name = excluded.full_name,
    phone = excluded.phone,
    role = excluded.role,
    branch_id = excluded.branch_id,
    is_active = excluded.is_active;

insert into public.user_branches (user_id, branch_id, is_default)
select u.id::uuid, b.id, true
from (values
  ('00000000-0000-4000-8000-000000000302', 'b0000000-0000-4000-8000-000000000025'),
  ('00000000-0000-4000-8000-000000000303', 'b0000000-0000-4000-8000-000000000025'),
  ('00000000-0000-4000-8000-000000000304', 'b0000000-0000-4000-8000-000000000025')
) as u(id, branch)
join public.branches as b on b.id = u.branch::uuid
on conflict do nothing;

insert into public.user_roles (user_id, role_id, branch_id, is_primary)
select u.id::uuid, r.id, b.id, true
from (values
  ('00000000-0000-4000-8000-000000000302', 'sales'),
  ('00000000-0000-4000-8000-000000000302', 'inventory'),
  ('00000000-0000-4000-8000-000000000303', 'collection')
) as u(id, role_code)
join public.roles as r on r.code = u.role_code
join public.branches as b on b.code = 'TST-25'
on conflict do nothing;

alter table public.customers disable trigger customers_block_delete;
delete from public.customer_contacts where customer_id in (select id from public.customers where national_id in ('30401152345672'));
delete from public.customers where national_id in ('30401152345672');
alter table public.customers enable trigger customers_block_delete;

insert into public.customers (code, full_name, national_id, mobile, branch_id)
values ('CUS-5250', 'عميل صلاحيات M2.5', '30401152345672', '+201050000325', 'b0000000-0000-4000-8000-000000000025');

delete from public.documents
where customer_id in (select id from public.customers where national_id = '30401152345672');

alter table public.documents disable trigger audit_documents_change;
alter table public.document_files disable trigger audit_document_files_change;
update public.code_sequences set next_number = 950 where entity = 'document';
alter table public.documents enable trigger audit_documents_change;
alter table public.document_files enable trigger audit_document_files_change;

-- ---------------------------------------------------------------------------
-- Section 3 fixtures: the manager user with sensitive governance rights.
-- ---------------------------------------------------------------------------

insert into public.staff_signup_claims (email, expires_at)
values ('m2.5.m.tst@example.com', now() + interval '15 minutes');

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000305', 'authenticated', 'authenticated', 'm2.5.m.tst@example.com', now(), '{"full_name":"مدير M2.5"}'::jsonb, now(), now());

insert into public.profiles (id, full_name, phone, role, branch_id, is_active)
values ('00000000-0000-4000-8000-000000000305', 'مدير M2.5', '+201000000315', 'manager', 'b0000000-0000-4000-8000-000000000025', true)
on conflict (id) do update
set full_name = excluded.full_name,
    phone = excluded.phone,
    role = excluded.role,
    branch_id = excluded.branch_id,
    is_active = excluded.is_active;

insert into public.user_branches (user_id, branch_id, is_default)
select u.id::uuid, b.id, true
from (values ('00000000-0000-4000-8000-000000000305', 'b0000000-0000-4000-8000-000000000025')) as u(id, branch)
join public.branches as b on b.id = u.branch::uuid
on conflict do nothing;

insert into public.user_roles (user_id, role_id, branch_id, is_primary)
select u.id::uuid, r.id, b.id, true
from (values ('00000000-0000-4000-8000-000000000305', 'manager')) as u(id, role_code)
join public.roles as r on r.code = u.role_code
join public.branches as b on b.code = 'TST-25'
on conflict do nothing;

select public.no_plan();

-- ---------------------------------------------------------------------------
-- Section 1: user A (sales+inventory) creates a base document + file.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000302","role":"authenticated"}', true);

select public.ok(public.has_permission('documents.upload'), 'A can upload documents');
select public.ok(not public.has_permission('documents.delete'), 'A cannot delete documents');
select public.ok(not public.has_permission('documents.download_sensitive'), 'A lacks the sensitive-download permission');

select public.is(
  (select doc_number from public.create_document(
    'بطاقة معاينة M2.5', 'id_card', 'customer',
    (select id from public.customers where national_id = '30401152345672')
  )),
  'DOC-00950',
  'A creates the stage document'
);

select public.lives_ok(
  $$ select public.attach_document_file(
    (select id from public.documents where doc_number = 'DOC-00950'),
    'albaraka/staging/uploads/m25_a', 'jpg', 11111, 'a.jpg', 800, 600
  ) $$,
  'A attaches a file'
);

-- ---------------------------------------------------------------------------
-- Section 2: user B (collection) can view and read, cannot create documents? view ok.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000303","role":"authenticated"}', true);

select public.ok(public.has_permission('documents.view'), 'B can view documents');
select public.is(
  (select count(*) from public.list_documents('customer',
     (select id from public.customers where national_id = '30401152345672'))),
  1::bigint,
  'B lists the shared branch document'
);

select public.lives_ok(
  $$ select public.record_document_access(
    (select id from public.documents where doc_number = 'DOC-00950'), null, 'view') $$,
  'B records document access'
);

select public.throws_ok(
  $$ select public.delete_document((select id from public.documents where doc_number = 'DOC-00950')) $$,
  '42501',
  null,
  'B cannot delete documents'
);

select public.throws_ok(
  $$ select public.set_document_sensitivity(
    (select id from public.documents where doc_number = 'DOC-00950'), true) $$,
  '42501',
  null,
  'B cannot toggle sensitivity'
);

-- ---------------------------------------------------------------------------
-- Section 3: user C (no roles) is fully locked out of documents.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000304","role":"authenticated"}', true);

select public.ok(not public.has_permission('documents.view'), 'C has no documents.view');
select public.ok(not public.has_permission('documents.upload'), 'C has no documents.upload');

select public.throws_ok(
  $$ select public.create_document('متجسس', 'other', 'customer',
    (select id from public.customers where national_id = '30401152345672')) $$,
  '42501',
  null,
  'C cannot create documents'
);

select public.throws_ok(
  $$ select public.record_document_access(
    (select id from public.documents where doc_number = 'DOC-00950'), null, 'view') $$,
  '42501',
  null,
  'C cannot log or record access'
);

-- RLS row counts: direct table access by C must return zero document rows.
select public.is(
  coalesce((select count(*) from public.documents), 0),
  0::bigint,
  'C sees zero document rows through RLS'
);

select public.is(
  coalesce((select count(*) from public.document_files), 0),
  0::bigint,
  'C sees zero document-file rows through RLS'
);

select public.is(
  coalesce((select count(*) from public.document_access_logs), 0),
  0::bigint,
  'C sees zero access-log rows through RLS'
);

-- ---------------------------------------------------------------------------
-- Section 4: sensitivity governance — switch to the manager fixture.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000305","role":"authenticated"}', true);

select public.ok(public.has_permission('documents.delete'), 'manager can delete documents');
select public.ok(public.has_permission('documents.download_sensitive'), 'manager holds the sensitive-download permission');

select public.lives_ok(
  $$ select public.set_document_sensitivity(
    (select id from public.documents where doc_number = 'DOC-00950'), true) $$,
  'manager flags the document as sensitive'
);

select public.is(
  (select is_sensitive from public.documents where doc_number = 'DOC-00950'),
  true,
  'the sensitivity flag persists'
);

select public.lives_ok(
  $$ select public.delete_document(
    (select id from public.documents where doc_number = 'DOC-00950')) $$,
  'manager deletes the document'
);

select public.is(
  (select count(*) from public.list_documents('customer',
     (select id from public.customers where national_id = '30401152345672'))),
  0::bigint,
  'the listing is empty after the delete'
);

select public.is(
  (select count(*) from public.document_files),
  0::bigint,
  'the files cascade-deleted with the document'
);

select public.is(
  (select count(*) from public.document_access_logs),
  0::bigint,
  'the access logs cascade-deleted with the document'
);

select public.finish();
rollback;
