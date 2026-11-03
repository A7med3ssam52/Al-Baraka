-- M6: Expenses table + RLS (frontend-managed, permission-gated)

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete restrict,
  expense_number text,
  category text not null default 'general',
  title text not null,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'EGP',
  expense_date date not null default current_date,
  cashbox_id uuid references public.cashboxes (id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'approved', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create index if not exists expenses_branch_id_idx on public.expenses (branch_id);
create index if not exists expenses_status_idx on public.expenses (status);
create index if not exists expenses_date_idx on public.expenses (expense_date);

alter table public.expenses enable row level security;

drop policy if exists expenses_select_authorized on public.expenses;
create policy expenses_select_authorized
on public.expenses
for select
to authenticated
using (public.has_permission('expenses.view', branch_id));

drop policy if exists expenses_insert_authorized on public.expenses;
create policy expenses_insert_authorized
on public.expenses
for insert
to authenticated
with check (public.has_permission('expenses.create', branch_id));

drop policy if exists expenses_update_authorized on public.expenses;
create policy expenses_update_authorized
on public.expenses
for update
to authenticated
using (public.has_permission('expenses.update', branch_id))
with check (public.has_permission('expenses.update', branch_id));

grant select, insert, update on public.expenses to authenticated;
