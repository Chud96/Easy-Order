-- ============================================================
-- JMS Schema — safe to run multiple times
-- Run in Supabase: SQL Editor → New query → paste → Run
-- The suppliers and standard_flashings tables already exist.
-- ============================================================

-- ── Jobs ────────────────────────────────────────────────────
create table if not exists jobs (
  id            uuid          primary key default gen_random_uuid(),
  owner_id      uuid          not null references auth.users(id) on delete cascade,
  job_number    text          not null default '',
  builder       text          not null default '',
  site_address  text          not null default '',
  total_amount  numeric(12,2) not null default 0,
  status        text          not null default 'quoted',
  notes         text          not null default '',
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now(),
  constraint jobs_status_check check (
    status in ('quoted','ordered','scheduled','in_progress','complete','invoiced')
  )
);

alter table jobs enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'jobs' and policyname = 'Users manage own jobs'
  ) then
    execute 'create policy "Users manage own jobs" on jobs for all using (auth.uid() = owner_id)';
  end if;
end $$;

-- ── Orders ──────────────────────────────────────────────────
create table if not exists orders (
  id              uuid          primary key default gen_random_uuid(),
  job_id          uuid          not null references jobs(id) on delete cascade,
  owner_id        uuid          not null references auth.users(id) on delete cascade,
  supplier_id     uuid          references suppliers(id) on delete set null,
  order_number    text          not null default '',
  supply_amount   numeric(12,2) not null default 0,
  install_amount  numeric(12,2) not null default 0,
  status          text          not null default 'draft',
  notes           text          not null default '',
  roof_colour     text          not null default '',
  fascia_colour   text          not null default '',
  gutter_colour   text          not null default '',
  delivery_date   date,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),
  constraint orders_status_check check (status in ('draft','sent','delivered','in_progress','complete'))
);

alter table orders enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'orders' and policyname = 'Users manage own orders'
  ) then
    execute 'create policy "Users manage own orders" on orders for all using (auth.uid() = owner_id)';
  end if;
end $$;

-- ── Order items ──────────────────────────────────────────────
create table if not exists order_items (
  id          uuid          primary key default gen_random_uuid(),
  order_id    uuid          not null references orders(id) on delete cascade,
  category    text          not null default '',
  subcategory text          not null default '',
  item        text          not null default '',
  qty         numeric(10,3) not null default 0,
  length      numeric(10,3),
  sort_order  integer       not null default 0,
  created_at  timestamptz   not null default now()
);

alter table order_items enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'order_items' and policyname = 'Users manage own order_items'
  ) then
    execute $policy$
      create policy "Users manage own order_items" on order_items for all using (
        exists (select 1 from orders where orders.id = order_items.order_id and orders.owner_id = auth.uid())
      )
    $policy$;
  end if;
end $$;

-- ── Flashing items ───────────────────────────────────────────
create table if not exists flashing_items (
  id               uuid        primary key default gen_random_uuid(),
  order_id         uuid        not null references orders(id) on delete cascade,
  folds_json       jsonb       not null default '[]',
  order_items_json jsonb       not null default '[]',
  sort_order       integer     not null default 0,
  created_at       timestamptz not null default now()
);

alter table flashing_items enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'flashing_items' and policyname = 'Users manage own flashing_items'
  ) then
    execute $policy$
      create policy "Users manage own flashing_items" on flashing_items for all using (
        exists (select 1 from orders where orders.id = flashing_items.order_id and orders.owner_id = auth.uid())
      )
    $policy$;
  end if;
end $$;

-- ── Purchase orders ──────────────────────────────────────────
create table if not exists purchase_orders (
  id          uuid        primary key default gen_random_uuid(),
  order_id    uuid        not null references orders(id) on delete cascade,
  job_id      uuid        not null references jobs(id) on delete cascade,
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  supplier_id uuid        references suppliers(id) on delete set null,
  po_number   text        not null default '',
  status      text        not null default 'draft',
  notes       text        not null default '',
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  constraint purchase_orders_status_check check (status in ('draft','sent','received'))
);

alter table purchase_orders enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'purchase_orders' and policyname = 'Users manage own purchase_orders'
  ) then
    execute 'create policy "Users manage own purchase_orders" on purchase_orders for all using (auth.uid() = owner_id)';
  end if;
end $$;

-- ── Install contracts ────────────────────────────────────────
create table if not exists install_contracts (
  id               uuid          primary key default gen_random_uuid(),
  order_id         uuid          not null references orders(id) on delete cascade,
  job_id           uuid          not null references jobs(id) on delete cascade,
  owner_id         uuid          not null references auth.users(id) on delete cascade,
  contractor_name  text          not null default '',
  contractor_email text          not null default '',
  amount           numeric(12,2) not null default 0,
  scope_notes      text          not null default '',
  status           text          not null default 'draft',
  created_at       timestamptz   not null default now(),
  constraint install_contracts_status_check check (status in ('draft','sent','signed'))
);

alter table install_contracts enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'install_contracts' and policyname = 'Users manage own install_contracts'
  ) then
    execute 'create policy "Users manage own install_contracts" on install_contracts for all using (auth.uid() = owner_id)';
  end if;
end $$;

-- ── Invoices ─────────────────────────────────────────────────
create table if not exists invoices (
  id             uuid          primary key default gen_random_uuid(),
  job_id         uuid          not null references jobs(id) on delete cascade,
  owner_id       uuid          not null references auth.users(id) on delete cascade,
  invoice_number text          not null default '',
  type           text          not null default 'deposit',
  amount         numeric(12,2) not null default 0,
  status         text          not null default 'draft',
  due_date       date,
  sent_at        timestamptz,
  paid_at        timestamptz,
  notes          text          not null default '',
  created_at     timestamptz   not null default now(),
  constraint invoices_type_check   check (type   in ('deposit','final')),
  constraint invoices_status_check check (status in ('draft','sent','paid'))
);

alter table invoices enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'invoices' and policyname = 'Users manage own invoices'
  ) then
    execute 'create policy "Users manage own invoices" on invoices for all using (auth.uid() = owner_id)';
  end if;
end $$;

-- ── Job files ─────────────────────────────────────────────────
create table if not exists job_files (
  id           uuid        primary key default gen_random_uuid(),
  job_id       uuid        not null references jobs(id) on delete cascade,
  owner_id     uuid        not null references auth.users(id) on delete cascade,
  name         text        not null default '',
  category     text        not null default 'Other',
  storage_path text        not null default '',
  mime_type    text        not null default '',
  size_bytes   bigint      not null default 0,
  created_at   timestamptz not null default now()
);

alter table job_files enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'job_files' and policyname = 'Users manage own job_files'
  ) then
    execute 'create policy "Users manage own job_files" on job_files for all using (auth.uid() = owner_id)';
  end if;
end $$;

-- ── Schedule entries ─────────────────────────────────────────
create table if not exists schedule_entries (
  id              uuid        primary key default gen_random_uuid(),
  owner_id        uuid        not null references auth.users(id) on delete cascade,
  order_id        uuid        references orders(id) on delete set null,
  job_id          uuid        references jobs(id) on delete set null,
  builder         text        not null default '',
  address         text        not null default '',
  info            text        not null default '',
  color           text        not null default 'blue',
  start_date      date        not null,
  span            integer     not null default 1,
  category        text        not null default 'Measures',
  row_in_category integer     not null default 0,
  workers         text[]      not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table schedule_entries enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'schedule_entries' and policyname = 'Users manage own schedule_entries'
  ) then
    execute 'create policy "Users manage own schedule_entries" on schedule_entries for all using (auth.uid() = owner_id)';
  end if;
end $$;

-- ── Column additions (safe to re-run) ────────────────────────
alter table install_contracts add column if not exists supplier_id uuid references suppliers(id) on delete set null;
alter table orders          add column if not exists file_path  text;
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check check (status in ('draft','sent','delivered','in_progress','complete'));
alter table install_contracts add column if not exists line_items_json jsonb not null default '[]';
alter table invoices drop constraint if exists invoices_type_check;
alter table invoices add constraint invoices_type_check check (type in ('deposit','progress','final'));
