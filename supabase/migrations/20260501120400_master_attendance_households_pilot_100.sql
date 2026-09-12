begin;

set local statement_timeout = '30s';

create temporary table tmp_master_attendance_pilot_stage on commit drop as
with current_org as (
  select id as organization_id
  from app_core.organizations
  where slug = 'real-school'
),
latest_attendance as (
  select *
  from public.master_attendance_data
  order by id desc
  limit 100
),
pilot_keys as (
  select
    o.organization_id,
    app_private.master_attendance_stable_key(
      m.date,
      m.student_name,
      m.student_email,
      m.birthday,
      m.phone_numbers,
      m.start,
      m."end",
      m.instructor_name,
      m.location,
      m.room,
      m.product,
      m.category
    ) as source_record_key
  from latest_attendance m
  cross join current_org o
)
select st.*
from app_private.master_attendance_stage st
join pilot_keys pk
  on pk.organization_id = st.organization_id
 and pk.source_record_key = st.source_record_key;

with family_links as (
  select distinct
    st.organization_id,
    coalesce(st.primary_norm_email, st.primary_norm_name, 'student:' || student_si.source_identity_key) as household_key,
    coalesce(nullif(trim(st.primary_name), ''), nullif(trim(st.student_name), '') || ' Household', 'Imported Household') as household_name,
    app_private.norm_name(coalesce(nullif(trim(st.primary_name), ''), nullif(trim(st.student_name), '') || ' Household', 'Imported Household')) as normalized_household_name,
    parent_si.person_id as parent_person_id,
    student_si.person_id as student_person_id,
    st.primary_name,
    st.primary_email
  from tmp_master_attendance_pilot_stage st
  join app_core.source_identities student_si
    on student_si.organization_id = st.organization_id
   and student_si.source_type = 'master_attendance_data'
   and student_si.source_identity_type = 'student'
   and student_si.source_identity_key = coalesce(
     st.student_norm_email,
     concat_ws(':', 'name_only', st.student_norm_name, coalesce(st.birth_month::text, 'unknown_month'), coalesce(st.birth_year::text, 'unknown_year'), coalesce(st.student_norm_phone, 'no_phone'))
   )
  left join app_core.source_identities parent_si
    on parent_si.organization_id = st.organization_id
   and parent_si.source_type = 'master_attendance_data'
   and parent_si.source_identity_type = 'parent'
   and parent_si.source_identity_key = coalesce(st.primary_norm_email, concat_ws(':', 'name_only', st.primary_norm_name))
  where student_si.person_id is not null
),
family_households as (
  select distinct on (organization_id, household_key)
    organization_id,
    household_key,
    household_name,
    normalized_household_name,
    parent_person_id,
    primary_name,
    primary_email
  from family_links
  order by organization_id, household_key, parent_person_id nulls last
)
insert into app_core.households (
  organization_id,
  name,
  normalized_name,
  primary_contact_person_id,
  metadata
)
select
  organization_id,
  household_name,
  normalized_household_name,
  parent_person_id,
  jsonb_build_object(
    'created_from_source', 'master_attendance_data',
    'import_household_key', household_key,
    'primary_name', primary_name,
    'primary_email', primary_email,
    'pilot_batch', 'stage_100'
  )
from family_households fl
where not exists (
  select 1
  from app_core.households h
  where h.organization_id = fl.organization_id
    and h.metadata->>'import_household_key' = fl.household_key
);

with family_links as (
  select distinct
    st.organization_id,
    coalesce(st.primary_norm_email, st.primary_norm_name, 'student:' || student_si.source_identity_key) as household_key,
    parent_si.person_id as parent_person_id
  from tmp_master_attendance_pilot_stage st
  join app_core.source_identities student_si
    on student_si.organization_id = st.organization_id
   and student_si.source_type = 'master_attendance_data'
   and student_si.source_identity_type = 'student'
   and student_si.source_identity_key = coalesce(
     st.student_norm_email,
     concat_ws(':', 'name_only', st.student_norm_name, coalesce(st.birth_month::text, 'unknown_month'), coalesce(st.birth_year::text, 'unknown_year'), coalesce(st.student_norm_phone, 'no_phone'))
   )
  left join app_core.source_identities parent_si
    on parent_si.organization_id = st.organization_id
   and parent_si.source_type = 'master_attendance_data'
   and parent_si.source_identity_type = 'parent'
   and parent_si.source_identity_key = coalesce(st.primary_norm_email, concat_ws(':', 'name_only', st.primary_norm_name))
  where student_si.person_id is not null
    and parent_si.person_id is not null
)
insert into app_core.household_members (
  organization_id,
  household_id,
  person_id,
  relationship,
  is_primary
)
select
  fl.organization_id,
  h.id,
  fl.parent_person_id,
  'parent',
  true
from family_links fl
join app_core.households h
  on h.organization_id = fl.organization_id
 and h.metadata->>'import_household_key' = fl.household_key
on conflict do nothing;

with family_links as (
  select distinct
    st.organization_id,
    coalesce(st.primary_norm_email, st.primary_norm_name, 'student:' || student_si.source_identity_key) as household_key,
    parent_si.person_id as parent_person_id,
    student_si.person_id as student_person_id
  from tmp_master_attendance_pilot_stage st
  join app_core.source_identities student_si
    on student_si.organization_id = st.organization_id
   and student_si.source_type = 'master_attendance_data'
   and student_si.source_identity_type = 'student'
   and student_si.source_identity_key = coalesce(
     st.student_norm_email,
     concat_ws(':', 'name_only', st.student_norm_name, coalesce(st.birth_month::text, 'unknown_month'), coalesce(st.birth_year::text, 'unknown_year'), coalesce(st.student_norm_phone, 'no_phone'))
   )
  left join app_core.source_identities parent_si
    on parent_si.organization_id = st.organization_id
   and parent_si.source_type = 'master_attendance_data'
   and parent_si.source_identity_type = 'parent'
   and parent_si.source_identity_key = coalesce(st.primary_norm_email, concat_ws(':', 'name_only', st.primary_norm_name))
  where student_si.person_id is not null
)
insert into app_core.household_members (
  organization_id,
  household_id,
  person_id,
  relationship,
  is_primary
)
select
  fl.organization_id,
  h.id,
  fl.student_person_id,
  case when fl.parent_person_id is null then 'adult_student' else 'student' end,
  fl.parent_person_id is null
from family_links fl
join app_core.households h
  on h.organization_id = fl.organization_id
 and h.metadata->>'import_household_key' = fl.household_key
where fl.student_person_id is not null
on conflict do nothing;

do $$
declare
  v_households int;
  v_members int;
begin
  select count(distinct h.id)
    into v_households
  from app_core.households h
  join tmp_master_attendance_pilot_stage st
    on st.organization_id = h.organization_id
   and h.metadata->>'import_household_key' = coalesce(st.primary_norm_email, st.primary_norm_name, 'student:' || coalesce(
     st.student_norm_email,
     concat_ws(':', 'name_only', st.student_norm_name, coalesce(st.birth_month::text, 'unknown_month'), coalesce(st.birth_year::text, 'unknown_year'), coalesce(st.student_norm_phone, 'no_phone'))
   ));

  select count(*)
    into v_members
  from app_core.household_members hm
  join app_core.households h
    on h.organization_id = hm.organization_id
   and h.id = hm.household_id
  join tmp_master_attendance_pilot_stage st
    on st.organization_id = h.organization_id
   and h.metadata->>'import_household_key' = coalesce(st.primary_norm_email, st.primary_norm_name, 'student:' || coalesce(
     st.student_norm_email,
     concat_ws(':', 'name_only', st.student_norm_name, coalesce(st.birth_month::text, 'unknown_month'), coalesce(st.birth_year::text, 'unknown_year'), coalesce(st.student_norm_phone, 'no_phone'))
   ));

  raise notice 'master_attendance households pilot complete: % households, % household member links.',
    v_households,
    v_members;
end;
$$;

commit;
