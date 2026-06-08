-- =========================================================
-- 01_identity_profiles
-- App identity table connected to Supabase Auth
-- =========================================================

-- ---------------------------------------------------------
-- Generic updated_at trigger function
-- ---------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------
-- Profiles table
-- ---------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,

  full_name text,
  email text not null,

  role public.user_role not null default 'student',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------
create index if not exists profiles_role_idx
on public.profiles(role);

create index if not exists profiles_email_idx
on public.profiles(email);

-- ---------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------
drop trigger if exists set_profiles_updated_at on public.profiles;

create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Auto-create profile when auth user is created
-- ---------------------------------------------------------
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    email,
    role
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    'student'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;

create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row
execute function public.handle_new_user_profile();

-- ---------------------------------------------------------
-- Enable RLS
-- Policies will be added in a later migration.
-- ---------------------------------------------------------
alter table public.profiles enable row level security;