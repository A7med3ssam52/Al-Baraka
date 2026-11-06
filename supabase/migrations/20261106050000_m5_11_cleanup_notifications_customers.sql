-- M5.11 — Clear notifications and remove all customers except the kept one.
-- Customers are delete-blocked by design; we temporarily drop the trigger
-- for this cleanup, then restore it.
delete from public.notifications;

drop trigger if exists customers_block_delete on public.customers;

delete from public.payments
where customer_id in (select id from public.customers where full_name <> 'السيد علي السيد جاب الله شكر');

delete from public.installment_schedules
where contract_id in (select id from public.contracts where customer_id in (select id from public.customers where full_name <> 'السيد علي السيد جاب الله شكر'));

delete from public.contracts
where customer_id in (select id from public.customers where full_name <> 'السيد علي السيد جاب الله شكر');

delete from public.sales_return_items
where return_id in (select id from public.sales_returns where customer_id in (select id from public.customers where full_name <> 'السيد علي السيد جاب الله شكر'));

delete from public.sales_returns
where customer_id in (select id from public.customers where full_name <> 'السيد علي السيد جاب الله شكر');

delete from public.customer_transactions
where customer_id in (select id from public.customers where full_name <> 'السيد علي السيد جاب الله شكر');

delete from public.sales_invoices
where customer_id in (select id from public.customers where full_name <> 'السيد علي السيد جاب الله شكر');

delete from public.documents
where customer_id in (select id from public.customers where full_name <> 'السيد علي السيد جاب الله شكر');

delete from public.customer_notes
where customer_id in (select id from public.customers where full_name <> 'السيد علي السيد جاب الله شكر');

delete from public.customer_contacts
where customer_id in (select id from public.customers where full_name <> 'السيد علي السيد جاب الله شكر');

delete from public.customers
where full_name <> 'السيد علي السيد جاب الله شكر';

create trigger customers_block_delete
before delete on public.customers
for each statement execute function public.block_customer_delete();
