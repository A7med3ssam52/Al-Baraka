-- M2.4 — Documents registry, files, and access logs (pgTAP).
-- Self-contained fixtures + rollback. Fixed UUIDs keep asserts independent.

begin;

create extension if not exists pgtap;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Branches + fixture user (sales + inventory => documents.view/upload).
-- ---------------------------------------------------------------------------

insert into public.branches (id, code, name, is_active)
values
  ('b0000000-0000-4000-8000-000000000024', 'TST-24', 'فرع اختبار M2.4', true),
  ('b0000000-0000-4000-8000-000000000099', 'TST-99', 'فرع آخر M2.4', true)
on conflict (code) do update set is_active = excluded.is_active;

insert into public.staff_signup_claims (email, expires_at)
values ('m2.4.docs.tst@example.com', now() + interval '15 minutes');

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000302', 'authenticated', 'authenticated', 'm2.4.docs.tst@example.com', now(), '{"full_name":"مستندات M2.4"}'::jsonb, now(), now());

insert into public.profiles (id, full_name, phone, role, branch_id, is_active)
values ('00000000-0000-4000-8000-000000000302', 'مستندات M2.4', '+201000000302', 'sales', 'b0000000-0000-4000-8000-000000000024', true)
on conflict (id) do update
set full_name = excluded.full_name,
    phone = excluded.phone,
    role = excluded.role,
    branch_id = excluded.branch_id,
    is_active = excluded.is_active;

insert into public.user_branches (user_id, branch_id, is_default)
select u.id::uuid, b.id, true
from (values ('00000000-0000-4000-8000-000000000302', 'b0000000-0000-4000-8000-000000000024')) as u(id, branch)
join public.branches as b on b.id = u.branch::uuid
on conflict do nothing;

insert into public.user_roles (user_id, role_id, branch_id, is_primary)
select u.id::uuid, r.id, b.id, (u.role_code = 'sales')
from (values
  ('00000000-0000-4000-8000-000000000302', 'sales'),
  ('00000000-0000-4000-8000-000000000302', 'inventory')
) as u(id, role_code)
join public.roles as r on r.code = u.role_code
join public.branches as b on b.code = 'TST-24'
on conflict do nothing;

-- Customers in both branches.
alter table public.customers disable trigger customers_block_delete;
delete from public.customer_contacts where customer_id in (select id from public.customers where national_id in ('30201152345672', '30201152345680'));
delete from public.customers where national_id in ('30201152345672', '30201152345680');
alter table public.customers enable trigger customers_block_delete;

insert into public.customers (code, full_name, national_id, mobile, branch_id)
values
  ('CUS-5240', 'عميل مستندات M2.4', '30201152345672', '+201040000302', 'b0000000-0000-4000-8000-000000000024'),
  ('CUS-5241', 'عميل فرع آخر M2.4', '30201152345680', '+201040000303', 'b0000000-0000-4000-8000-000000000099');

delete from public.suppliers where full_name = 'مورد مستندات M2.4';
insert into public.suppliers (code, full_name, contact_name, phone, phone2, tax_number,
  address, notes, branch_id, created_by, updated_by)
values ('SUP-5240', 'مورد مستندات M2.4', null, '01012345678', null, null, null, null,
  'b0000000-0000-4000-8000-000000000024', '00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000302');

-- Clean leftover documents for these fixtures.
delete from public.documents
where (customer_id in (select id from public.customers where national_id in ('30201152345672', '30201152345680')))
   or (supplier_id in (select id from public.suppliers where full_name = 'مورد مستندات M2.4'));

alter table public.documents disable trigger audit_documents_change;
alter table public.document_files disable trigger audit_document_files_change;
update public.code_sequences set next_number = 900 where entity = 'document';
alter table public.documents enable trigger audit_documents_change;
alter table public.document_files enable trigger audit_document_files_change;

select public.no_plan();

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000302","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- Section 1: permissions.
-- ---------------------------------------------------------------------------

select public.ok(public.has_permission('documents.view'), 'fixture user can view documents');
select public.ok(public.has_permission('documents.upload'), 'fixture user can upload documents');

-- ---------------------------------------------------------------------------
-- Section 2: create documents.
-- ---------------------------------------------------------------------------

select public.is(
  (select doc_number from public.create_document(
    'بطاقة موبايل العميل', 'id_card', 'customer',
    (select id from public.customers where national_id = '30201152345672')
  )),
  'DOC-00900',
  'the customer document takes the next atomic DOC number'
);

select public.is(
  (select status from public.documents where doc_number = 'DOC-00900'),
  'pending',
  'a fresh document starts as pending until its first file lands'
);

select public.is(
  (select branch_id from public.documents where doc_number = 'DOC-00900'),
  'b0000000-0000-4000-8000-000000000024'::uuid,
  'the document branch is inherited from the customer'
);

select public.throws_ok(
  $$ select public.create_document('ن', 'id_card', 'customer',
    (select id from public.customers where national_id = '30201152345672')) $$,
  '22023',
  null,
  'a document title shorter than 2 characters is rejected'
);

select public.throws_ok(
  $$ select public.create_document('بطاقة', 'driver_license', 'customer',
    (select id from public.customers where national_id = '30201152345672')) $$,
  '22023',
  null,
  'an unknown document type is rejected'
);

select public.throws_ok(
  format('select public.create_document(%L, %L, %L, gen_random_uuid())',
         'بطاقة', 'id_card', 'customer'),
  'P0001',
  null,
  'a missing customer owner is rejected'
);

-- The other-branch customer is invisible to this user's branch membership.
select public.throws_ok(
  $$ select public.create_document('بطاقة فرع آخر', 'id_card', 'customer',
    (select id from public.customers where national_id = '30201152345680')) $$,
  '42501',
  null,
  'creating a document for another branch is rejected'
);

select public.is(
  (select doc_number from public.create_document(
    'سجل تجاري للمورد', 'commercial_registry', 'supplier',
    null, (select id from public.suppliers where full_name = 'مورد مستندات M2.4')
  )),
  'DOC-00901',
  'the supplier document continues the shared DOC sequence'
);

select public.throws_ok(
  $$ select public.create_document('بلا مالك', 'other', 'customer') $$,
  'P0001',
  null,
  'a customer document without a customer id is rejected'
);

-- Inheriting the supplier branch: the fixture supplier belongs to TST-24, so create works;
-- cross owner_type/id mismatch is rejected.
select public.throws_ok(
  $$ select public.create_document('خلط أصحاب', 'other', 'supplier',
    (select id from public.customers where national_id = '30201152345672')) $$,
  'P0001',
  null,
  'a supplier document without a supplier id is rejected'
);

-- ---------------------------------------------------------------------------
-- Section 3: files.
-- ---------------------------------------------------------------------------

select public.is(
  (select bytes from public.attach_document_file(
    (select id from public.documents where doc_number = 'DOC-00900'),
    'albaraka/staging/uploads/doc_00900_a', 'jpg', 234567,
    'بطاقة-وجه-1.jpg', 1600, 1200
  )),
  234567::bigint,
  'the first file attaches to the pending document'
);

select public.is(
  (select status from public.documents where doc_number = 'DOC-00900'),
  'complete',
  'the document status flips to complete once a file lands'
);

select public.is(
  (select uploaded_by from public.document_files where public_id = 'albaraka/staging/uploads/doc_00900_a'),
  '00000000-0000-4000-8000-000000000302'::uuid,
  'the file records its uploader'
);

select public.lives_ok(
  $$ select public.attach_document_file(
    (select id from public.documents where doc_number = 'DOC-00900'),
    'albaraka/staging/uploads/doc_00900_b', 'png', 34567,
    'بطاقة-وجه-2.png', 1600, 1200
  ) $$,
  'a second file attaches to the same document'
);

select public.throws_ok(
  $$ select public.attach_document_file(
    (select id from public.documents where doc_number = 'DOC-00900'),
    'albaraka/staging/uploads/doc_00900_a', 'jpg', 1
  ) $$,
  '23505',
  null,
  'a duplicate Cloudinary public id is rejected by the unique constraint'
);

select public.throws_ok(
  $$ select public.attach_document_file(
    (select id from public.documents where doc_number = 'DOC-00900'),
    'albaraka/staging/uploads/doc_00900_c', 'exe', 1
  ) $$,
  '22023',
  null,
  'an executable file format is rejected'
);

select public.throws_ok(
  $$ select public.attach_document_file(
    (select id from public.documents where doc_number = 'DOC-00900'),
    'albaraka/staging/uploads/doc_00900 d/x', 'jpg', 1
  ) $$,
  '22023',
  null,
  'a public id with illegal characters is rejected'
);

select public.throws_ok(
  $$ select public.attach_document_file(
    (select id from public.documents where doc_number = 'DOC-00900'),
    'albaraka/staging/uploads/doc_00900_d', 'jpg', 10485761
  ) $$,
  '22023',
  null,
  'a file larger than 10MB is rejected'
);

select public.throws_ok(
  format('select public.attach_document_file(gen_random_uuid(), %L, %L, 1::bigint)',
         'albaraka/staging/uploads/x1', 'jpg'),
  'P0001',
  null,
  'attaching a file to a missing document is rejected'
);

-- ---------------------------------------------------------------------------
-- Section 4: listing + access logs.
-- ---------------------------------------------------------------------------

select public.is(
  (select count(*) from public.list_documents('customer',
     (select id from public.customers where national_id = '30201152345672'))),
  1::bigint,
  'the customer listing shows only his documents'
);

select public.is(
  (select count(*) from public.list_documents('supplier',
     (select id from public.suppliers where full_name = 'مورد مستندات M2.4'))),
  1::bigint,
  'the supplier listing shows its document'
);

select public.is(
  (select doc_number from public.list_documents('customer',
     (select id from public.customers where national_id = '30201152345672'), 'id_card')),
  'DOC-00900',
  'the doc_type filter narrows the listing'
);

select public.is(
  (select status from public.list_documents('customer',
     (select id from public.customers where national_id = '30201152345672'))),
  'complete',
  'the listing exposes the document status'
);

select public.lives_ok(
  $$ select public.record_document_access(
    (select id from public.documents where doc_number = 'DOC-00900'), null, 'view') $$,
  'a document view is logged'
);

select public.lives_ok(
  $$ select public.record_document_access(
    (select id from public.documents where doc_number = 'DOC-00900'),
    (select id from public.document_files where public_id = 'albaraka/staging/uploads/doc_00900_a'),
    'download') $$,
  'a file download is logged'
);

select public.throws_ok(
  $$ select public.record_document_access(
    (select id from public.documents where doc_number = 'DOC-00900'), null, 'delete') $$,
  '22023',
  null,
  'an unknown access action is rejected'
);

select public.throws_ok(
  format('select public.record_document_access((select id from public.documents where doc_number = ''DOC-00900''), gen_random_uuid(), %L)', 'view'),
  'P0001',
  null,
  'logging an access for a foreign file id is rejected'
);

select public.throws_ok(
  format('select public.record_document_access(gen_random_uuid())'),
  'P0001',
  null,
  'logging an access for a missing document is rejected'
);

select public.is(
  (select count(*) from public.list_document_access_logs(
    (select id from public.documents where doc_number = 'DOC-00900'))),
  2::bigint,
  'the access-log listing shows both logged events'
);

select public.is(
  (select count(*) from public.list_document_access_logs(
    (select id from public.documents where doc_number = 'DOC-00900')
  )
  where action = 'view'),
  1::bigint,
  'the access-log listing distinguishes actions'
);

select public.ok(
  not exists (
    select 1 from public.document_access_logs
    where action not in ('view', 'download', 'list')
  ),
  'no access row ever escapes the whitelist'
);

select public.finish();
rollback;
