-- =========================================================
-- 04_fix_profile_role_bootstrap
-- Allow privileged database/service context to update roles
-- while still blocking normal users from self role escalation.
-- =========================================================

create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
as $$
begin
  -- Allow privileged database contexts.
  -- This is needed for SQL Editor / migrations / service role bootstrap.
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  -- Allow service_role JWT context when called through trusted backend.
  if auth.role() = 'service_role' then
    return new;
  end if;

  -- Allow app admins to manage roles.
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