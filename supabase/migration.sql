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
