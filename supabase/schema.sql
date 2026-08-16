-- ============================================================
-- BB Sales | بي بي سيلز — Supabase Database Schema v2
-- Multi-tenant: every row is scoped by store_id; reps are
-- isolated to their own rep_id. Run once in the SQL Editor.
-- Safe to re-run (idempotent).
-- ============================================================

-- ---------- IDEMPOTENT CLEANUP (safe re-runs) ----------
drop table if exists public.daily_reconciliation cascade;
drop table if exists public.rep_locations cascade;
drop table if exists public.transaction_items cascade;
drop table if exists public.sales_transactions cascade;
drop table if exists public.customers cascade;
drop table if exists public.trucks_inventory cascade;
drop table if exists public.stores cascade;
drop table if exists public.users cascade;
drop type if exists public.payment_status cascade;
drop type if exists public.user_role cascade;
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists trg_inventory_updated on public.trucks_inventory;
drop trigger if exists trg_customer_debt_limit on public.sales_transactions;
drop function if exists public.handle_new_user();
drop function if exists public.set_updated_at();
drop function if exists public.complete_manager_signup();
drop function if exists public.ensure_user_profile();
drop function if exists public.create_sales_rep(text, text, text, text);
drop function if exists public.current_store_id();
drop function if exists public.is_manager();
drop function if exists public.check_customer_debt_limit();

-- ---------- ENUMS ----------
create type public.user_role as enum ('manager', 'sales_rep');
create type public.payment_status as enum ('paid', 'partial', 'debt');

-- ---------- USERS (created first: stores references it) ----------
create table public.users (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  role       public.user_role not null default 'sales_rep',
  full_name  text not null default '',
  phone      text,
  store_id   uuid,
  truck_id   text,
  rep_token  uuid unique,
  created_at timestamptz not null default now()
);

-- ---------- STORES ----------
create table public.stores (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  owner_user_id uuid not null references public.users (id) on delete cascade,
  created_at    timestamptz not null default now()
);

-- ---------- CIRCULAR FK RESOLUTION ----------
-- users.store_id -> stores.id added after both tables exist.
alter table public.users
  add constraint users_store_fk
  foreign key (store_id) references public.stores (id) on delete set null;

-- ---------- TRUCKS INVENTORY ----------
create table public.trucks_inventory (
  id                 uuid primary key default gen_random_uuid(),
  store_id           uuid not null references public.stores (id) on delete cascade,
  rep_id             uuid not null references public.users (id) on delete cascade,
  product_name       text not null,
  product_image_url  text,
  quantity_loaded    integer not null default 0 check (quantity_loaded >= 0),
  quantity_remaining integer not null default 0 check (quantity_remaining >= 0),
  unit_price         numeric(12, 2) not null default 0 check (unit_price >= 0),
  updated_at         timestamptz not null default now()
);

-- ---------- CUSTOMERS ----------
create table public.customers (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores (id) on delete cascade,
  name              text not null,
  phone             text,
  address           text,
  latitude          double precision,
  longitude         double precision,
  debt_limit        numeric(12, 2) check (debt_limit is null or debt_limit >= 0),
  created_by_rep_id uuid not null references public.users (id) on delete cascade,
  created_at        timestamptz not null default now()
);

-- ---------- SALES TRANSACTIONS ----------
create table public.sales_transactions (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores (id) on delete cascade,
  rep_id         uuid not null references public.users (id) on delete cascade,
  customer_id    uuid not null references public.customers (id) on delete cascade,
  total_amount   numeric(12, 2) not null check (total_amount >= 0),
  paid_amount    numeric(12, 2) not null default 0 check (paid_amount >= 0),
  debt_amount    numeric(12, 2) not null default 0 check (debt_amount >= 0),
  payment_status public.payment_status not null default 'debt',
  created_at     timestamptz not null default now(),
  check (paid_amount + debt_amount = total_amount)
);

-- ---------- TRANSACTION ITEMS ----------
create table public.transaction_items (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.sales_transactions (id) on delete cascade,
  product_name   text not null,
  quantity       integer not null check (quantity > 0),
  unit_price     numeric(12, 2) not null check (unit_price >= 0),
  subtotal       numeric(12, 2) not null check (subtotal >= 0)
);

-- ---------- REP LOCATIONS (live tracking) ----------
create table public.rep_locations (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores (id) on delete cascade,
  rep_id      uuid not null references public.users (id) on delete cascade,
  latitude    double precision not null,
  longitude   double precision not null,
  captured_at timestamptz not null default now()
);

-- ---------- DAILY RECONCILIATION (retained) ----------
create table public.daily_reconciliation (
  id                    uuid primary key default gen_random_uuid(),
  store_id              uuid not null references public.stores (id) on delete cascade,
  rep_id                uuid not null references public.users (id) on delete cascade,
  date                  date not null default current_date,
  total_cash_collected  numeric(12, 2) not null default 0,
  total_debts_issued    numeric(12, 2) not null default 0,
  stock_returned_status text default 'pending',
  is_closed             boolean not null default false,
  closed_at             timestamptz,
  unique (rep_id, date)
);

-- ---------- INDEXES (FK + query paths) ----------
create index idx_users_store on public.users (store_id);
create index idx_users_token on public.users (rep_token);
create index idx_inventory_store on public.trucks_inventory (store_id);
create index idx_inventory_rep on public.trucks_inventory (rep_id);
create index idx_customers_store on public.customers (store_id);
create index idx_customers_rep on public.customers (created_by_rep_id);
create index idx_transactions_store on public.sales_transactions (store_id);
create index idx_transactions_rep on public.sales_transactions (rep_id);
create index idx_transactions_customer on public.sales_transactions (customer_id);
create index idx_transactions_date on public.sales_transactions (created_at desc);
create index idx_tx_items_tx on public.transaction_items (transaction_id);
create index idx_locations_store on public.rep_locations (store_id);
create index idx_locations_rep on public.rep_locations (rep_id, captured_at desc);

-- ---------- TRIGGERS ----------

-- Creates profile on signup; managers get a store + role automatically.
-- A user is treated as a Store Manager when their auth metadata carries
-- role='manager'/'admin' OR a store_name (the signup form always sends both).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb := new.raw_user_meta_data;
  v_store_id uuid;
  v_is_manager boolean;
begin
  v_is_manager :=
    coalesce(v_meta ->> 'role', '') in ('manager', 'admin')
    or v_meta ? 'store_name';

  insert into public.users (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(v_meta ->> 'full_name', '')
  )
  on conflict (id) do nothing;

  if v_is_manager then
    insert into public.stores (name, owner_user_id)
    values (coalesce(v_meta ->> 'store_name', new.email), new.id)
    returning id into v_store_id;
    update public.users
    set role = 'manager', store_id = v_store_id
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Keep inventory updated_at fresh.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_inventory_updated on public.trucks_inventory;
create trigger trg_inventory_updated
  before update on public.trucks_inventory
  for each row execute procedure public.set_updated_at();

-- Enforce per-customer debt limits at the database level: blocks any new
-- transaction whose debt would push the customer past their debt_limit.
create or replace function public.check_customer_debt_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit numeric(12,2);
  v_existing numeric(12,2);
begin
  if NEW.debt_amount > 0 then
    select debt_limit into v_limit
    from public.customers
    where id = NEW.customer_id;
    if v_limit is not null then
      select coalesce(sum(debt_amount), 0) into v_existing
      from public.sales_transactions
      where customer_id = NEW.customer_id;
      if (coalesce(v_existing, 0) + NEW.debt_amount) > v_limit then
        raise exception 'تجاوز حد الدين المسموح للعميل (الحد %)', v_limit;
      end if;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_customer_debt_limit on public.sales_transactions;
create trigger trg_customer_debt_limit
  before insert on public.sales_transactions
  for each row execute procedure public.check_customer_debt_limit();

-- ============================================================
-- SECURITY DEFINER RPCs (bypass RLS internally)
-- ============================================================

-- Manager self-provisioning fallback (used if signup ran without metadata).
-- Delegates to ensure_user_profile() so all provisioning paths stay in sync.
create or replace function public.complete_manager_signup()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
begin
  perform public.ensure_user_profile();
  select store_id into v_store_id from public.users where id = auth.uid();
  if v_store_id is null then raise exception 'manager setup failed'; end if;
  return v_store_id;
end;
$$;

-- Auto-provision (and self-repair) the profile row for the current user.
-- Handles the case where the on_auth_user_created trigger did not fire
-- (e.g. schema applied after signup, or direct auth.users inserts), and
-- upgrades stale rows so ANY store manager always has manager rights:
--   - no row at all          -> create a profile (manager gets a store too)
--   - manager metadata, but  -> repair: ensure role='manager' + store_id
--     row missing/role wrong
-- A user is treated as a manager when their auth metadata carries
-- role='manager'/'admin' OR a store_name (signup always sends both).
-- Never downgrades an existing manager.
create or replace function public.ensure_user_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    auth.users%rowtype;
  v_meta    jsonb;
  v_role    text;
  v_profile public.users%rowtype;
  v_store_id uuid;
begin
  select * into v_user from auth.users where id = auth.uid();
  if not found then raise exception 'not authenticated'; end if;

  v_meta := coalesce(v_user.raw_user_meta_data, '{}'::jsonb);
  v_role := case
    when coalesce(v_meta ->> 'role', '') in ('manager', 'admin') then 'manager'
    when v_meta ? 'store_name' then 'manager'
    else 'sales_rep'
  end;

  select * into v_profile from public.users where id = v_user.id;

  if v_role = 'manager' then
    if not found then
      -- create the profile row FIRST (stores.owner_user_id FK requires it),
      -- then the store, then upgrade the profile to manager.
      insert into public.users (id, email, full_name, role)
      values (
        v_user.id,
        coalesce(v_user.email, ''),
        coalesce(v_meta ->> 'full_name', v_meta ->> 'store_name', ''),
        'sales_rep'
      );
      insert into public.stores (name, owner_user_id)
      values (coalesce(v_meta ->> 'store_name', v_user.email), v_user.id)
      returning id into v_store_id;
      update public.users
      set role = 'manager', store_id = v_store_id
      where id = v_user.id;
      select * into v_profile from public.users where id = v_user.id;
    elsif v_profile.role <> 'manager' or v_profile.store_id is null then
      if v_profile.store_id is null then
        insert into public.stores (name, owner_user_id)
        values (coalesce(v_meta ->> 'store_name', v_user.email), v_user.id)
        returning id into v_store_id;
      else
        v_store_id := v_profile.store_id;
      end if;
      update public.users
      set role = 'manager', store_id = v_store_id
      where id = v_user.id;
      select * into v_profile from public.users where id = v_user.id;
    end if;
  elsif not found then
    insert into public.users (id, email, full_name, role)
    values (
      v_user.id,
      coalesce(v_user.email, ''),
      coalesce(v_meta ->> 'full_name', ''),
      'sales_rep'
    )
    returning * into v_profile;
  end if;

  return to_jsonb(v_profile);
end;
$$;

-- Managers provision reps. Creates the auth user + isolated profile
-- with a unique rep_token used to build the exclusive access link.
-- Self-heals the caller's profile first so ANY store manager account
-- (even one with a stale/older profile row) can create sales reps.
create or replace function public.create_sales_rep(
  p_full_name text,
  p_email     text,
  p_password  text,
  p_truck_id  text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_manager_id uuid := auth.uid();
  v_manager_store uuid;
  v_new_id uuid := gen_random_uuid();
  v_token  uuid := gen_random_uuid();
begin
  perform public.ensure_user_profile();

  select store_id into v_manager_store
  from public.users
  where id = v_manager_id and role = 'manager';
  if v_manager_store is null then
    raise exception 'only managers can create sales reps';
  end if;

  insert into auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, aud, role
  )
  values (
    v_new_id,
    lower(p_email),
    crypt(p_password, gen_salt('bf')),
    now(),
    jsonb_build_object('full_name', p_full_name, 'role', 'sales_rep', 'truck_id', p_truck_id),
    'authenticated',
    'authenticated'
  );

  update public.users
  set full_name = p_full_name,
      store_id = v_manager_store,
      truck_id = p_truck_id,
      rep_token = v_token
  where id = v_new_id;

  return jsonb_build_object('id', v_new_id, 'rep_token', v_token);
end;
$$;

-- ============================================================
-- RLS HELPERS
-- ============================================================

create or replace function public.current_store_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select store_id from public.users where id = auth.uid();
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'manager'
  );
$$;

-- ---------- STORES ----------
alter table public.stores enable row level security;

create policy "stores_select_member"
  on public.stores for select
  using (
    owner_user_id = auth.uid()
    or id in (select store_id from public.users where id = auth.uid())
  );

-- ---------- USERS ----------
alter table public.users enable row level security;

create policy "users_select_own_or_manager"
  on public.users for select
  using (
    id = auth.uid()
    or (is_manager() and store_id = current_store_id())
  );

create policy "users_insert_self"
  on public.users for insert
  with check (id = auth.uid() and role = 'sales_rep');

create policy "users_update_self_or_manager"
  on public.users for update
  using (id = auth.uid() or (is_manager() and store_id = current_store_id()))
  with check (
    -- reps cannot change their own role/store/token
    (id = auth.uid() and role = (select role from public.users where id = auth.uid()))
    or (is_manager() and store_id = current_store_id())
  );

-- ---------- TRUCKS INVENTORY ----------
alter table public.trucks_inventory enable row level security;

create policy "inventory_select"
  on public.trucks_inventory for select
  using (
    (is_manager() and store_id = current_store_id())
    or rep_id = auth.uid()
  );

create policy "inventory_insert"
  on public.trucks_inventory for insert
  with check (
    store_id = current_store_id()
    and (rep_id = auth.uid() or is_manager())
  );

create policy "inventory_update"
  on public.trucks_inventory for update
  using (store_id = current_store_id() and (rep_id = auth.uid() or is_manager()))
  with check (store_id = current_store_id() and (rep_id = auth.uid() or is_manager()));

create policy "inventory_delete_manager"
  on public.trucks_inventory for delete
  using (is_manager() and store_id = current_store_id());

-- ---------- CUSTOMERS ----------
alter table public.customers enable row level security;

create policy "customers_select"
  on public.customers for select
  using (
    (is_manager() and store_id = current_store_id())
    or created_by_rep_id = auth.uid()
  );

create policy "customers_insert"
  on public.customers for insert
  with check (
    store_id = current_store_id()
    and (created_by_rep_id = auth.uid() or is_manager())
  );

create policy "customers_update"
  on public.customers for update
  using (store_id = current_store_id() and (created_by_rep_id = auth.uid() or is_manager()))
  with check (store_id = current_store_id() and (created_by_rep_id = auth.uid() or is_manager()));

create policy "customers_delete"
  on public.customers for delete
  using (store_id = current_store_id() and (created_by_rep_id = auth.uid() or is_manager()));

-- ---------- SALES TRANSACTIONS ----------
alter table public.sales_transactions enable row level security;

create policy "tx_select"
  on public.sales_transactions for select
  using (
    (is_manager() and store_id = current_store_id())
    or rep_id = auth.uid()
  );

create policy "tx_insert"
  on public.sales_transactions for insert
  with check (store_id = current_store_id() and rep_id = auth.uid());

create policy "tx_update"
  on public.sales_transactions for update
  using (store_id = current_store_id() and (rep_id = auth.uid() or is_manager()))
  with check (store_id = current_store_id() and (rep_id = auth.uid() or is_manager()));

-- ---------- TRANSACTION ITEMS ----------
alter table public.transaction_items enable row level security;

create policy "items_select"
  on public.transaction_items for select
  using (
    exists (
      select 1 from public.sales_transactions t
      where t.id = transaction_id
        and (t.store_id = current_store_id() or t.rep_id = auth.uid())
    )
  );

create policy "items_insert"
  on public.transaction_items for insert
  with check (
    exists (
      select 1 from public.sales_transactions t
      where t.id = transaction_id and t.rep_id = auth.uid() and t.store_id = current_store_id()
    )
  );

create policy "items_update"
  on public.transaction_items for update
  using (
    exists (
      select 1 from public.sales_transactions t
      where t.id = transaction_id and t.store_id = current_store_id()
    )
  );

-- ---------- REP LOCATIONS ----------
alter table public.rep_locations enable row level security;

create policy "locations_select"
  on public.rep_locations for select
  using (
    (is_manager() and store_id = current_store_id())
    or rep_id = auth.uid()
  );

create policy "locations_insert"
  on public.rep_locations for insert
  with check (store_id = current_store_id() and rep_id = auth.uid());

-- ---------- DAILY RECONCILIATION ----------
alter table public.daily_reconciliation enable row level security;

create policy "recon_select"
  on public.daily_reconciliation for select
  using (
    (is_manager() and store_id = current_store_id())
    or rep_id = auth.uid()
  );

create policy "recon_insert"
  on public.daily_reconciliation for insert
  with check (store_id = current_store_id() and rep_id = auth.uid());

create policy "recon_update"
  on public.daily_reconciliation for update
  using (store_id = current_store_id() and (rep_id = auth.uid() or is_manager()))
  with check (store_id = current_store_id() and (rep_id = auth.uid() or is_manager()));

-- ============================================================
-- STORAGE: product images bucket (public read, app-upload)
-- Only applies on Supabase (storage schema present); skipped on
-- a bare local Postgres so the file remains fully portable.
-- ============================================================
do $$
begin
  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('product-images', 'product-images', true)
    on conflict (id) do nothing;

    drop policy if exists product_images_public_read on storage.objects;
    drop policy if exists product_images_app_insert on storage.objects;
    drop policy if exists product_images_app_update on storage.objects;
    drop policy if exists product_images_app_delete on storage.objects;

    create policy "product_images_public_read"
      on storage.objects for select
      using (bucket_id = 'product-images');

    create policy "product_images_app_insert"
      on storage.objects for insert
      with check (bucket_id = 'product-images' and auth.role() = 'authenticated');

    create policy "product_images_app_update"
      on storage.objects for update
      using (bucket_id = 'product-images' and auth.role() = 'authenticated');

    create policy "product_images_app_delete"
      on storage.objects for delete
      using (bucket_id = 'product-images' and auth.role() = 'authenticated');
  end if;
end
$$;

-- ============================================================
-- REALTIME: live sync for manager dashboard
-- ============================================================
do $$
begin
  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.sales_transactions;
    alter publication supabase_realtime add table public.customers;
    alter publication supabase_realtime add table public.rep_locations;
    alter publication supabase_realtime add table public.trucks_inventory;
  end if;
end
$$;
