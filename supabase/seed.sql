-- Development seed — idempotent.
-- The branch and settings are also inserted by the M0.3 migration so a remote
-- `db push` without --include-seed still leaves a usable baseline.

insert into public.branches (code, name, address, is_active)
values (
  'SNH-01',
  'فرع صان الحجر',
  'محافظة الشرقية — مركز صان الحجر — بجوار مركز الشرطة',
  true
)
on conflict (code) do update
set name = excluded.name,
    address = excluded.address,
    is_active = excluded.is_active;

insert into public.system_settings as settings (id, app_name, branch_code, currency, timezone, address, phone)
values (
  true,
  'معرض البركة',
  'SNH-01',
  'EGP',
  'Africa/Cairo',
  'محافظة الشرقية — مركز صان الحجر — بجوار مركز الشرطة',
  '01000172840'
)
on conflict (id) do update
set app_name = excluded.app_name,
    branch_code = excluded.branch_code,
    currency = excluded.currency,
    timezone = excluded.timezone,
    address = coalesce(settings.address, excluded.address),
    phone = coalesce(settings.phone, excluded.phone);
