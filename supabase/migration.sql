-- ============================================================
-- BB Sales | بي بي سيلز — Additive Migration v1
-- Manager Authority & Account Creation Flow
-- ------------------------------------------------------------
-- SAFE TO RUN ON AN ALREADY-LIVE DATABASE (idempotent, additive).
-- No tables are dropped; existing data is preserved.
-- Run ONCE in the Supabase SQL Editor.
-- ============================================================

-- 1) PER-CUSTOMER DEBT LIMIT
--    Add the column if it does not exist, plus a non-negative guard.
alter table public.customers
  add column if not exists debt_limit numeric(12, 2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customers_debt_limit_nonneg'
  ) then
    alter table public.customers
      add constraint customers_debt_limit_nonneg
      check (debt_limit is null or debt_limit >= 0);
  end if;
end
$$;

-- 2) SELF-REPAIRING PROFILE (fixes "Only managers can create sales reps")
--    Any store manager whose auth metadata says role='manager'/'admin' or
--    carries a store_name is guaranteed a profile row with role='manager' and
--    a store_id, even if their row is stale or the signup trigger never ran.
--    Managers are never downgraded.
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
      set role = 'manager', store_id = v_store_id, rep_token = null
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
      set role = 'manager', store_id = v_store_id, rep_token = null
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

-- 2b) SIGNUP TRIGGER — also treats role='admin' / store_name as a manager.
--     Replaces the older trigger function on the live database.
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

-- 2c) ONE-TIME DATA FIX for the primary manager account.
--     Sets role='manager' for boubamahfoud@gmail.com regardless of how the
--     account was originally created, so create_sales_rep stops blocking.
--     Idempotent: safe to re-run; does nothing if the email is absent.
do $$
declare
  v_uid uuid;
  v_meta jsonb;
  v_profile public.users%rowtype;
  v_store_id uuid;
begin
  select id, raw_user_meta_data into v_uid, v_meta
  from auth.users
  where lower(email) = lower('boubamahfoud@gmail.com')
  limit 1;

  if v_uid is null then
    raise notice 'boubamahfoud@gmail.com not found in auth.users — skipping targeted fix';
    return;
  end if;

  v_meta := coalesce(v_meta, '{}'::jsonb);
  if not (v_meta ? 'store_name') then
    v_meta := v_meta || jsonb_build_object('store_name', split_part(v_uid::text, '-', 1));
  end if;
  if coalesce(v_meta ->> 'role', '') not in ('manager', 'admin') then
    v_meta := v_meta || jsonb_build_object('role', 'manager');
  end if;
  update auth.users set raw_user_meta_data = v_meta where id = v_uid;

  select * into v_profile from public.users where id = v_uid;
  if not found then
    insert into public.users (id, email, full_name, role)
    values (v_uid, 'boubamahfoud@gmail.com', coalesce(v_meta ->> 'full_name', v_meta ->> 'store_name', ''), 'sales_rep')
    returning * into v_profile;
  end if;

  if v_profile.store_id is null then
    select id into v_store_id
    from public.stores
    where owner_user_id = v_uid
    limit 1;
    if v_store_id is null then
      insert into public.stores (name, owner_user_id)
      values (coalesce(v_meta ->> 'store_name', v_uid::text), v_uid)
      returning id into v_store_id;
    end if;
    update public.users
    set store_id = v_store_id, role = 'manager'
    where id = v_uid;
  else
    update public.users
    set role = 'manager'
    where id = v_uid;
  end if;

  raise notice 'boubamahfoud@gmail.com promoted to manager (store %)', v_profile.store_id;
end;
$$;

-- 3) CREATE SALES REP — self-heals the caller before the manager check
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
    raw_app_meta_data, raw_user_meta_data, aud, role
  )
  values (
    v_new_id,
    lower(p_email),
    crypt(p_password, gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('full_name', p_full_name, 'role', 'sales_rep', 'truck_id', p_truck_id),
    'authenticated',
    'authenticated'
  );

  -- GoTrue only authenticates email/password sign-ins when the user has a
  -- matching row in auth.identities (provider 'email'); without it the rep
  -- would exist in auth.users but always get "Invalid login credentials".
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  )
  values (
    gen_random_uuid(),
    v_new_id,
    v_new_id::text,
    jsonb_build_object('sub', v_new_id::text, 'email', lower(p_email)),
    'email',
    now(), now(), now()
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

-- 3b) BACKFILL auth.identities FOR EXISTING SALES REPS
--     Reps created before the auth.identities insert above exist in
--     auth.users but cannot sign in with email/password because GoTrue
--     requires an identity row. This idempotently creates the missing
--     'email' identity for every existing sales rep (and any rep-created
--     account) that has a password hash but no email identity yet.
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(),
  u.id,
  u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email',
  coalesce(u.last_sign_in_at, u.created_at),
  u.created_at,
  u.created_at
from auth.users u
where u.id in (select id from public.users where role = 'sales_rep')
  and u.encrypted_password is not null
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  );

-- 4) DATABASE-LEVEL DEBT LIMIT ENFORCEMENT
--    Rejects any transaction that would push a customer past debt_limit.
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
-- 5) REP PORTAL TOKEN-AUTH (unique-link access)
--    The rep link /rep-portal/:token works with the token alone —
--    no email/password session needed. Any manager session on the
--    tab is cleared client-side and the link never redirects to the
--    manager dashboard. All reads/writes are security-definer and
--    strictly scoped to the rep resolved from rep_token.
-- ============================================================

create or replace function public.rep_session(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep public.users%rowtype;
  v_store public.stores%rowtype;
  v_result jsonb;
begin
  if p_token is null then raise exception 'rep_token_required'; end if;

  select * into v_rep from public.users where rep_token = p_token;
  if not found then raise exception 'rep_token_invalid'; end if;
  if v_rep.role <> 'sales_rep' then raise exception 'rep_token_invalid'; end if;

  select * into v_store from public.stores where id = v_rep.store_id;
  if not found then raise exception 'rep_store_not_found'; end if;

  select jsonb_build_object(
    'profile', to_jsonb(v_rep),
    'store', to_jsonb(v_store),
    'inventory', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.product_name)
      from public.trucks_inventory i where i.rep_id = v_rep.id
    ), '[]'::jsonb),
    'customers', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at desc)
      from public.customers c where c.created_by_rep_id = v_rep.id
    ), '[]'::jsonb),
    'transactions', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created_at desc)
      from public.sales_transactions t where t.rep_id = v_rep.id
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(to_jsonb(ti))
      from public.transaction_items ti
      where ti.transaction_id in (select id from public.sales_transactions where rep_id = v_rep.id)
    ), '[]'::jsonb),
    'repLocations', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.captured_at desc)
      from public.rep_locations l where l.rep_id = v_rep.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.rep_create_sale(
  p_token uuid,
  p_customer_id uuid,
  p_paid_amount numeric default 0,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep public.users%rowtype;
  v_customer public.customers%rowtype;
  v_total numeric(12,2) := 0;
  v_paid numeric(12,2);
  v_debt numeric(12,2);
  v_status public.payment_status;
  v_tx public.sales_transactions%rowtype;
  v_item jsonb;
  v_stock public.trucks_inventory%rowtype;
  v_qty integer;
begin
  if p_token is null then raise exception 'rep_token_required'; end if;
  select * into v_rep from public.users where rep_token = p_token;
  if not found then raise exception 'rep_token_invalid'; end if;

  select * into v_customer
  from public.customers
  where id = p_customer_id and created_by_rep_id = v_rep.id;
  if not found then raise exception 'rep_customer_not_found'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_total := v_total + (v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric;
  end loop;

  v_paid := least(coalesce(p_paid_amount, 0), v_total);
  v_debt := greatest(v_total - v_paid, 0);
  v_status := case when v_debt = 0 then 'paid' when v_paid = 0 then 'debt' else 'partial' end;

  insert into public.sales_transactions (
    store_id, rep_id, customer_id, total_amount, paid_amount, debt_amount, payment_status
  )
  values (v_rep.store_id, v_rep.id, v_customer.id, v_total, v_paid, v_debt, v_status)
  returning * into v_tx;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.transaction_items (
      transaction_id, product_name, quantity, unit_price, subtotal
    )
    values (
      v_tx.id,
      v_item->>'product_name',
      (v_item->>'quantity')::integer,
      (v_item->>'unit_price')::numeric,
      (v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric
    );

    select * into v_stock
    from public.trucks_inventory
    where rep_id = v_rep.id and product_name = v_item->>'product_name'
    order by id limit 1;
    if found then
      v_qty := greatest(0, v_stock.quantity_remaining - (v_item->>'quantity')::integer);
      update public.trucks_inventory
      set quantity_remaining = v_qty
      where id = v_stock.id;
    end if;
  end loop;

  return to_jsonb(v_tx);
end;
$$;

create or replace function public.rep_add_customer(
  p_token uuid,
  p_name text,
  p_phone text default null,
  p_address text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_debt_limit numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep public.users%rowtype;
  v_customer public.customers%rowtype;
begin
  if p_token is null then raise exception 'rep_token_required'; end if;
  select * into v_rep from public.users where rep_token = p_token;
  if not found then raise exception 'rep_token_invalid'; end if;

  insert into public.customers (
    store_id, name, phone, address, latitude, longitude, debt_limit, created_by_rep_id
  )
  values (
    v_rep.store_id, p_name, p_phone, p_address, p_latitude, p_longitude, p_debt_limit, v_rep.id
  )
  returning * into v_customer;
  return to_jsonb(v_customer);
end;
$$;

create or replace function public.rep_update_customer(
  p_token uuid,
  p_customer_id uuid,
  p_patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep public.users%rowtype;
  v_customer public.customers%rowtype;
begin
  if p_token is null then raise exception 'rep_token_required'; end if;
  select * into v_rep from public.users where rep_token = p_token;
  if not found then raise exception 'rep_token_invalid'; end if;

  select * into v_customer
  from public.customers
  where id = p_customer_id and created_by_rep_id = v_rep.id;
  if not found then raise exception 'rep_customer_not_found'; end if;

  if p_patch ? 'name' then v_customer.name := p_patch->>'name'; end if;
  if p_patch ? 'phone' then v_customer.phone := p_patch->>'phone'; end if;
  if p_patch ? 'address' then v_customer.address := p_patch->>'address'; end if;
  if p_patch ? 'latitude' then v_customer.latitude := (p_patch->>'latitude')::double precision; end if;
  if p_patch ? 'longitude' then v_customer.longitude := (p_patch->>'longitude')::double precision; end if;
  if p_patch ? 'debt_limit' then v_customer.debt_limit := (p_patch->>'debt_limit')::numeric; end if;

  update public.customers set
    name = v_customer.name,
    phone = v_customer.phone,
    address = v_customer.address,
    latitude = v_customer.latitude,
    longitude = v_customer.longitude,
    debt_limit = v_customer.debt_limit
  where id = v_customer.id
  returning * into v_customer;
  return to_jsonb(v_customer);
end;
$$;

create or replace function public.rep_delete_customer(
  p_token uuid,
  p_customer_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep public.users%rowtype;
begin
  if p_token is null then raise exception 'rep_token_required'; end if;
  select * into v_rep from public.users where rep_token = p_token;
  if not found then raise exception 'rep_token_invalid'; end if;

  delete from public.customers
  where id = p_customer_id and created_by_rep_id = v_rep.id;
  return found;
end;
$$;

create or replace function public.rep_add_inventory(
  p_token uuid,
  p_product_name text,
  p_product_image_url text default null,
  p_quantity_loaded integer default 0,
  p_unit_price numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep public.users%rowtype;
  v_row public.trucks_inventory%rowtype;
begin
  if p_token is null then raise exception 'rep_token_required'; end if;
  select * into v_rep from public.users where rep_token = p_token;
  if not found then raise exception 'rep_token_invalid'; end if;

  insert into public.trucks_inventory (
    store_id, rep_id, product_name, product_image_url,
    quantity_loaded, quantity_remaining, unit_price
  )
  values (
    v_rep.store_id, v_rep.id, p_product_name, p_product_image_url,
    p_quantity_loaded, p_quantity_loaded, p_unit_price
  )
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.rep_update_inventory(
  p_token uuid,
  p_item_id uuid,
  p_patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep public.users%rowtype;
  v_row public.trucks_inventory%rowtype;
begin
  if p_token is null then raise exception 'rep_token_required'; end if;
  select * into v_rep from public.users where rep_token = p_token;
  if not found then raise exception 'rep_token_invalid'; end if;

  select * into v_row
  from public.trucks_inventory
  where id = p_item_id and rep_id = v_rep.id;
  if not found then raise exception 'rep_inventory_not_found'; end if;

  if p_patch ? 'product_name' then v_row.product_name := p_patch->>'product_name'; end if;
  if p_patch ? 'product_image_url' then v_row.product_image_url := p_patch->>'product_image_url'; end if;
  if p_patch ? 'quantity_loaded' then v_row.quantity_loaded := (p_patch->>'quantity_loaded')::integer; end if;
  if p_patch ? 'quantity_remaining' then v_row.quantity_remaining := (p_patch->>'quantity_remaining')::integer; end if;
  if p_patch ? 'unit_price' then v_row.unit_price := (p_patch->>'unit_price')::numeric; end if;

  update public.trucks_inventory set
    product_name = v_row.product_name,
    product_image_url = v_row.product_image_url,
    quantity_loaded = v_row.quantity_loaded,
    quantity_remaining = v_row.quantity_remaining,
    unit_price = v_row.unit_price
  where id = v_row.id
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.rep_add_location(
  p_token uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep public.users%rowtype;
  v_loc public.rep_locations%rowtype;
begin
  if p_token is null then raise exception 'rep_token_required'; end if;
  select * into v_rep from public.users where rep_token = p_token;
  if not found then raise exception 'rep_token_invalid'; end if;

  insert into public.rep_locations (store_id, rep_id, latitude, longitude)
  values (v_rep.store_id, v_rep.id, p_latitude, p_longitude)
  returning * into v_loc;
  return to_jsonb(v_loc);
end;
$$;

-- 7b) PRODUCT IMAGE UPLOADS — storage bucket + policies (idempotent)
--     FIX: previously only the rep-token anon policy existed here, so
--     session-mode reps (email/password) could NOT upload ("فشل إضافة الصورة"):
--     no `product-images` bucket was guaranteed to exist and no authenticated
--     insert/read policies were created. This block creates the public bucket
--     and the full policy set so both session-mode and rep-portal uploads work.
do $$
begin
  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('product-images', 'product-images', true)
    on conflict (id) do nothing;

    -- Anyone can read product images (public bucket).
    drop policy if exists product_images_public_read on storage.objects;
    create policy "product_images_public_read"
      on storage.objects for select
      using (bucket_id = 'product-images');

    -- Logged-in app users (session mode) may upload/update/delete.
    drop policy if exists product_images_app_insert on storage.objects;
    create policy "product_images_app_insert"
      on storage.objects for insert
      with check (bucket_id = 'product-images' and auth.role() = 'authenticated');

    drop policy if exists product_images_app_update on storage.objects;
    create policy "product_images_app_update"
      on storage.objects for update
      using (bucket_id = 'product-images' and auth.role() = 'authenticated');

    drop policy if exists product_images_app_delete on storage.objects;
    create policy "product_images_app_delete"
      on storage.objects for delete
      using (bucket_id = 'product-images' and auth.role() = 'authenticated');

    -- Rep-portal (unique-link) uploads: no email/password session exists, so
    -- the client uploads with the anon key under a folder named by the rep's
    -- secret rep_token. The policy only grants anon inserts to paths whose
    -- first folder is a real, non-null rep_token — the token IS the credential.
    drop policy if exists product_images_rep_token_upload on storage.objects;
    create policy "product_images_rep_token_upload"
      on storage.objects for insert
      with check (
        bucket_id = 'product-images'
        and (storage.foldername(name))[1] in (
          select rep_token::text from public.users where rep_token is not null
        )
      );
  end if;
end
$$;

-- 8) LIVE LOCATION TRACKING — RLS + realtime (idempotent)
--    Ensures managers can read their store's rep_locations rows and reps can
--    only insert their own, and that the table is part of the realtime
--    publication so the manager's live map updates as reps move.

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

alter table public.rep_locations enable row level security;

drop policy if exists locations_select on public.rep_locations;
create policy "locations_select"
  on public.rep_locations for select
  using (
    (public.is_manager() and store_id = public.current_store_id())
    or rep_id = auth.uid()
  );

drop policy if exists locations_insert on public.rep_locations;
create policy "locations_insert"
  on public.rep_locations for insert
  with check (store_id = public.current_store_id() and rep_id = auth.uid());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'rep_locations'
    ) then
      alter publication supabase_realtime add table public.rep_locations;
    end if;
  end if;
end
$$;

-- Force PostgREST to reload its schema cache so the new RPCs are visible to
-- the anon key immediately (avoids PGRST202 "Could not find the function"
-- when the SQL editor / tooling did not auto-refresh it).
notify pgrst, 'reload schema';
