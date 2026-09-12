-- Expose app_core through the Supabase REST/PostgREST API.
-- Keep app_private hidden. This only changes API schema exposure.

begin;

alter role authenticator set pgrst.db_schemas = 'public, graphql_public, app_core';
alter role authenticator set pgrst.db_extra_search_path = 'public, extensions';

notify pgrst, 'reload config';
notify pgrst, 'reload schema';

commit;
