-- M2.5 — Delete all suppliers and their linked records.
delete from public.purchase_invoice_items
where invoice_id in (select id from public.purchase_invoices);

delete from public.purchase_invoices;

delete from public.supplier_transactions;

update public.vehicles set supplier_id = null where supplier_id is not null;

delete from public.documents where supplier_id is not null;

delete from public.suppliers;
