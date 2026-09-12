begin;

create unique index if not exists uq_persons_source_identity_id
on app_core.persons (organization_id, (metadata->>'source_identity_id'))
where metadata ? 'source_identity_id';

create unique index if not exists uq_households_import_household_key
on app_core.households (organization_id, (metadata->>'import_household_key'))
where metadata ? 'import_household_key';

commit;
