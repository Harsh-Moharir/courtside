-- 0011_service_role_grants.sql
-- Hosted projects created with "Grant API access to new tables automatically" switched off do not give the
-- service_role (used only by the local maintenance scripts: bootstrap-admin, add-admin, seed) privileges on new
-- tables. Grant them explicitly. The service role never reaches the browser or Next.js. anon/authenticated
-- privileges are unchanged (see 0003).

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges for role postgres in schema public grant all on tables to service_role;
alter default privileges for role postgres in schema public grant all on sequences to service_role;
alter default privileges for role postgres in schema public grant execute on functions to service_role;
