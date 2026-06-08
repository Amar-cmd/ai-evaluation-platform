-- Verify RLS status of public tables.
-- We will use this after adding RLS policies.

select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;