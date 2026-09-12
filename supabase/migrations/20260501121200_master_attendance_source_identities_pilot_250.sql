begin;

set local statement_timeout = '30s';

with raw_student_identities as (
  select
    organization_id,
    'master_attendance_data'::text as source_type,
    'student'::text as source_identity_type,
    coalesce(
      student_norm_email,
      concat_ws(':', 'name_only', student_norm_name, coalesce(birth_month::text, 'unknown_month'), coalesce(birth_year::text, 'unknown_year'), coalesce(student_norm_phone, 'no_phone'))
    ) as source_identity_key,
    student_name as source_display_name,
    student_email as source_email,
    student_phone as source_phone,
    student_norm_name as normalized_name,
    student_norm_email as normalized_email,
    student_norm_phone as normalized_phone,
    jsonb_build_object('role_in_source', 'student', 'pilot_batch', 'stage_250') as source_payload,
    service_date,
    legacy_id
  from app_private.master_attendance_stage
  where source_payload->>'pilot_batch' = 'stage_250'
    and coalesce(student_norm_email, student_norm_name) is not null
),
student_identities as (
  select distinct on (organization_id, source_identity_key)
    organization_id,
    source_type,
    source_identity_type,
    source_identity_key,
    source_display_name,
    source_email,
    source_phone,
    normalized_name,
    normalized_email,
    normalized_phone,
    source_payload
  from raw_student_identities
  order by organization_id, source_identity_key, service_date desc nulls last, legacy_id desc nulls last
)
insert into app_core.source_identities (
  organization_id,
  source_type,
  source_identity_type,
  source_identity_key,
  source_display_name,
  source_email,
  source_phone,
  normalized_name,
  normalized_email,
  normalized_phone,
  source_payload,
  last_seen_at
)
select
  organization_id,
  source_type,
  source_identity_type,
  source_identity_key,
  source_display_name,
  source_email,
  source_phone,
  normalized_name,
  normalized_email,
  normalized_phone,
  source_payload,
  now()
from student_identities
on conflict (organization_id, source_type, source_identity_type, source_identity_key)
do update set
  source_display_name = excluded.source_display_name,
  source_email = excluded.source_email,
  source_phone = excluded.source_phone,
  normalized_name = excluded.normalized_name,
  normalized_email = excluded.normalized_email,
  normalized_phone = excluded.normalized_phone,
  source_payload = app_core.source_identities.source_payload || excluded.source_payload,
  last_seen_at = now();

with raw_parent_identities as (
  select
    organization_id,
    'master_attendance_data'::text as source_type,
    'parent'::text as source_identity_type,
    coalesce(primary_norm_email, concat_ws(':', 'name_only', primary_norm_name)) as source_identity_key,
    primary_name as source_display_name,
    primary_email as source_email,
    student_phone as source_phone,
    primary_norm_name as normalized_name,
    primary_norm_email as normalized_email,
    student_norm_phone as normalized_phone,
    jsonb_build_object('role_in_source', 'primary', 'pilot_batch', 'stage_250') as source_payload,
    service_date,
    legacy_id
  from app_private.master_attendance_stage
  where source_payload->>'pilot_batch' = 'stage_250'
    and coalesce(primary_norm_email, primary_norm_name) is not null
),
parent_identities as (
  select distinct on (organization_id, source_identity_key)
    organization_id,
    source_type,
    source_identity_type,
    source_identity_key,
    source_display_name,
    source_email,
    source_phone,
    normalized_name,
    normalized_email,
    normalized_phone,
    source_payload
  from raw_parent_identities
  order by organization_id, source_identity_key, service_date desc nulls last, legacy_id desc nulls last
)
insert into app_core.source_identities (
  organization_id,
  source_type,
  source_identity_type,
  source_identity_key,
  source_display_name,
  source_email,
  source_phone,
  normalized_name,
  normalized_email,
  normalized_phone,
  source_payload,
  last_seen_at
)
select
  organization_id,
  source_type,
  source_identity_type,
  source_identity_key,
  source_display_name,
  source_email,
  source_phone,
  normalized_name,
  normalized_email,
  normalized_phone,
  source_payload,
  now()
from parent_identities
on conflict (organization_id, source_type, source_identity_type, source_identity_key)
do update set
  source_display_name = excluded.source_display_name,
  source_email = excluded.source_email,
  source_phone = coalesce(app_core.source_identities.source_phone, excluded.source_phone),
  normalized_name = excluded.normalized_name,
  normalized_email = excluded.normalized_email,
  normalized_phone = coalesce(app_core.source_identities.normalized_phone, excluded.normalized_phone),
  source_payload = app_core.source_identities.source_payload || excluded.source_payload,
  last_seen_at = now();

with raw_instructor_identities as (
  select
    organization_id,
    'master_attendance_data'::text as source_type,
    'instructor'::text as source_identity_type,
    concat_ws(':', 'name_only', instructor_norm_name) as source_identity_key,
    instructor_name as source_display_name,
    instructor_norm_name as normalized_name,
    jsonb_build_object('role_in_source', 'instructor', 'pilot_batch', 'stage_250') as source_payload,
    service_date,
    legacy_id
  from app_private.master_attendance_stage
  where source_payload->>'pilot_batch' = 'stage_250'
    and instructor_norm_name is not null
),
instructor_identities as (
  select distinct on (organization_id, source_identity_key)
    organization_id,
    source_type,
    source_identity_type,
    source_identity_key,
    source_display_name,
    normalized_name,
    source_payload
  from raw_instructor_identities
  order by organization_id, source_identity_key, service_date desc nulls last, legacy_id desc nulls last
)
insert into app_core.source_identities (
  organization_id,
  source_type,
  source_identity_type,
  source_identity_key,
  source_display_name,
  normalized_name,
  source_payload,
  last_seen_at
)
select
  organization_id,
  source_type,
  source_identity_type,
  source_identity_key,
  source_display_name,
  normalized_name,
  source_payload,
  now()
from instructor_identities
on conflict (organization_id, source_type, source_identity_type, source_identity_key)
do update set
  source_display_name = excluded.source_display_name,
  normalized_name = excluded.normalized_name,
  source_payload = app_core.source_identities.source_payload || excluded.source_payload,
  last_seen_at = now();

insert into app_core.source_record_identities (
  organization_id,
  source_record_id,
  source_identity_id,
  role_in_record
)
select st.organization_id, sr.id, si.id, 'student'
from app_private.master_attendance_stage st
join app_core.source_records sr
  on sr.organization_id = st.organization_id
 and sr.source_type = 'master_attendance_data'
 and sr.source_record_key = st.source_record_key
join app_core.source_identities si
  on si.organization_id = st.organization_id
 and si.source_type = 'master_attendance_data'
 and si.source_identity_type = 'student'
 and si.source_identity_key = coalesce(
   st.student_norm_email,
   concat_ws(':', 'name_only', st.student_norm_name, coalesce(st.birth_month::text, 'unknown_month'), coalesce(st.birth_year::text, 'unknown_year'), coalesce(st.student_norm_phone, 'no_phone'))
 )
where st.source_payload->>'pilot_batch' = 'stage_250'
on conflict do nothing;

insert into app_core.source_record_identities (
  organization_id,
  source_record_id,
  source_identity_id,
  role_in_record
)
select st.organization_id, sr.id, si.id, 'primary'
from app_private.master_attendance_stage st
join app_core.source_records sr
  on sr.organization_id = st.organization_id
 and sr.source_type = 'master_attendance_data'
 and sr.source_record_key = st.source_record_key
join app_core.source_identities si
  on si.organization_id = st.organization_id
 and si.source_type = 'master_attendance_data'
 and si.source_identity_type = 'parent'
 and si.source_identity_key = coalesce(st.primary_norm_email, concat_ws(':', 'name_only', st.primary_norm_name))
where st.source_payload->>'pilot_batch' = 'stage_250'
on conflict do nothing;

insert into app_core.source_record_identities (
  organization_id,
  source_record_id,
  source_identity_id,
  role_in_record
)
select st.organization_id, sr.id, si.id, 'instructor'
from app_private.master_attendance_stage st
join app_core.source_records sr
  on sr.organization_id = st.organization_id
 and sr.source_type = 'master_attendance_data'
 and sr.source_record_key = st.source_record_key
join app_core.source_identities si
  on si.organization_id = st.organization_id
 and si.source_type = 'master_attendance_data'
 and si.source_identity_type = 'instructor'
 and si.source_identity_key = concat_ws(':', 'name_only', st.instructor_norm_name)
where st.source_payload->>'pilot_batch' = 'stage_250'
on conflict do nothing;

do $$
declare
  v_source_identities int;
  v_record_identity_links int;
begin
  select count(distinct si.id)
    into v_source_identities
  from app_core.source_identities si
  where si.source_type = 'master_attendance_data'
    and si.source_payload->>'pilot_batch' = 'stage_250';

  select count(*)
    into v_record_identity_links
  from app_core.source_record_identities sri
  join app_core.source_records sr
    on sr.organization_id = sri.organization_id
   and sr.id = sri.source_record_id
  join app_private.master_attendance_stage st
    on st.organization_id = sr.organization_id
   and st.source_record_key = sr.source_record_key
  where st.source_payload->>'pilot_batch' = 'stage_250';

  raise notice 'master_attendance source-identity pilot complete: % identities, % record-identity links.',
    v_source_identities,
    v_record_identity_links;
end;
$$;

commit;
