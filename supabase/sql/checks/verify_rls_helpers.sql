-- Verify RLS helper functions exist.

select
  n.nspname as schema_name,
  p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_user_role',
    'current_user_role',
    'has_role',
    'is_admin',
    'is_professor',
    'is_student'
  )
order by p.proname;