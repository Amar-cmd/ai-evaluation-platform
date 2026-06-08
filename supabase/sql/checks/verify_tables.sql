-- Verify that expected tables exist.
-- We will update this file after creating schema migrations.

-- Verify expected public tables.

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by table_name;