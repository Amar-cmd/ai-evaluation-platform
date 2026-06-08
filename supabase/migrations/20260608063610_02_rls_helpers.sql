-- =========================================================
-- 02_rls_helpers
-- Recursion-safe helper functions for RLS policies
-- =========================================================

-- ---------------------------------------------------------
-- Get role of a specific user
-- ---------------------------------------------------------
create or replace function public.get_user_role(user_uuid uuid)
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select p.role
  from public.profiles p
  where p.id = user_uuid
  limit 1;
$$;

-- ---------------------------------------------------------
-- Get current authenticated user's role
-- ---------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select public.get_user_role(auth.uid());
$$;

-- ---------------------------------------------------------
-- Check if current authenticated user has a required role
-- ---------------------------------------------------------
create or replace function public.has_role(required_role public.user_role)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    public.current_user_role() = required_role,
    false
  );
$$;

-- ---------------------------------------------------------
-- Role-specific helpers
-- ---------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.has_role('admin'::public.user_role);
$$;

create or replace function public.is_professor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.has_role('professor'::public.user_role);
$$;

create or replace function public.is_student()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.has_role('student'::public.user_role);
$$;

-- ---------------------------------------------------------
-- Restrict direct public execution, then grant to authenticated users
-- ---------------------------------------------------------
revoke all on function public.get_user_role(uuid) from public;
revoke all on function public.current_user_role() from public;
revoke all on function public.has_role(public.user_role) from public;
revoke all on function public.is_admin() from public;
revoke all on function public.is_professor() from public;
revoke all on function public.is_student() from public;

grant execute on function public.get_user_role(uuid) to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.has_role(public.user_role) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_professor() to authenticated;
grant execute on function public.is_student() to authenticated;