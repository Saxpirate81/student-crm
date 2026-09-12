begin;

set local statement_timeout = '30s';

insert into app_core.source_records (
  organization_id,
  source_type,
  source_record_key,
  source_payload,
  imported_at
)
select
  organization_id,
  'master_attendance_data',
  source_record_key,
  source_payload,
  now()
from app_private.master_attendance_stage
where source_payload->>'pilot_batch' = 'stage_25'
on conflict (organization_id, source_type, source_record_key)
do update set
  source_payload = excluded.source_payload,
  imported_at = now();

do $$
declare
  v_source_records int;
begin
  select count(*)
    into v_source_records
  from app_core.source_records sr
  join app_private.master_attendance_stage st
    on st.organization_id = sr.organization_id
   and st.source_record_key = sr.source_record_key
  where sr.source_type = 'master_attendance_data'
    and st.source_payload->>'pilot_batch' = 'stage_25';

  raise notice 'master_attendance source-record pilot complete: % source records linked to pilot rows.', v_source_records;
end;
$$;

commit;
