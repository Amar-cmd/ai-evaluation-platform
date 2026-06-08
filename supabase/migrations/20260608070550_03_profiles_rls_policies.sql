-- =========================================================
-- 03_profiles_rls_policies
-- RLS policies for public.profiles
-- =========================================================

-- ---------------------------------------------------------
-- Backfill profiles for existing auth users
-- Useful if users were created before profile trigger existed.
-- ---------------------------------------------------------
insert into public.profiles (
  id,
  full_name,
  email,
  role
)
select
  au.id,
  coalesce(au.raw_user_meta_data ->> 'full_name', ''),
  au.email,
  'student'::public.user_role
from auth.users au
on conflict (id) do nothing;

-- ---------------------------------------------------------
-- Prevent non-admin users from changing protected profile fields
-- Normal users may update basic profile fields such as full_name,
-- but they must not change id, email, or role.
-- ---------------------------------------------------------
create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
as $$
begin
  -- Admins can update profile fields, including role.
  if public.is_admin() then
    return new;
  end if;

  -- Non-admin users cannot change profile id.
  if new.id is distinct from old.id then
    raise exception 'Profile id cannot be changed.';
  end if;

  -- Non-admin users cannot change email from profiles table.
  if new.email is distinct from old.email then
    raise exception 'Email cannot be changed from profile update.';
  end if;

  -- Non-admin users cannot change their own role.
  if new.role is distinct from old.role then
    raise exception 'You are not allowed to change your own role.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_profile_privilege_escalation_trigger
on public.profiles;

create trigger prevent_profile_privilege_escalation_trigger
before update on public.profiles
for each row
execute function public.prevent_profile_privilege_escalation();

-- ---------------------------------------------------------
-- Make sure RLS is enabled
-- ---------------------------------------------------------
alter table public.profiles enable row level security;

-- ---------------------------------------------------------
-- Clean existing policies if re-running in development
-- ---------------------------------------------------------
drop policy if exists "Users can read own profile"
on public.profiles;

drop policy if exists "Admins can read all profiles"
on public.profiles;

drop policy if exists "Users can update own basic profile"
on public.profiles;

drop policy if exists "Admins can update all profiles"
on public.profiles;

-- ---------------------------------------------------------
-- SELECT policies
-- ---------------------------------------------------------

create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
);

create policy "Admins can read all profiles"
on public.profiles
for select
to authenticated
using (
  public.is_admin()
);

-- ---------------------------------------------------------
-- UPDATE policies
-- ---------------------------------------------------------

create policy "Users can update own basic profile"
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
)
with check (
  id = auth.uid()
);

create policy "Admins can update all profiles"
on public.profiles
for update
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

-- ---------------------------------------------------------
-- Grants
-- RLS still controls which rows are accessible.
-- Trigger prevents non-admin role/email escalation.
-- ---------------------------------------------------------
grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;