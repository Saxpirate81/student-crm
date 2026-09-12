-- Grant API roles access to the exposed app_core schema.
-- RLS policies still enforce row-level access. app_private remains unexposed.

begin;

grant usage on schema app_core to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema app_core to anon, authenticated, service_role;
grant usage, select on all sequences in schema app_core to anon, authenticated, service_role;

alter default privileges in schema app_core
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

alter default privileges in schema app_core
  grant usage, select on sequences to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
