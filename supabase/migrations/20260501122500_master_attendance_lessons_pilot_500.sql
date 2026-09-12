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
  limit 500
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

insert into app_core.lessons (
  organization_id,
  student_person_id,
  instructor_person_id,
  lesson_date,
  title,
  instrument,
  lesson_type,
  status,
  lesson_notes,
  source_record_id,
  metadata
)
with lesson_rows as (
  select distinct on (st.organization_id, sr.id)
    st.organization_id,
    student_si.person_id as student_person_id,
    instructor_si.person_id as instructor_person_id,
    st.service_date,
    coalesce(nullif(trim(st.description), ''), concat_ws(' - ', nullif(st.product, ''), nullif(st.category, '')), 'Imported lesson') as title,
    nullif(st.product, '') as instrument,
    case
      when lower(coalesce(st.status, '')) like '%cancel%' then 'cancelled'
      when lower(coalesce(st.status, '')) like '%bank%' then 'banked'
      else 'completed'
    end as status,
    st.lesson_notes,
    sr.id as source_record_id,
    jsonb_build_object(
      'source_type', 'master_attendance_data',
      'legacy_daily_row_id', st.legacy_id,
      'source_record_key_strategy', 'date_student_time_instructor_location_v1',
      'start_raw', st.start_raw,
      'end_raw', st.end_raw,
      'location', st.location,
      'room', st.room,
      'category', st.category,
      'revenue_per_visit_raw', st.revenue_per_visit_raw,
      'revenue_per_visit_numeric', st.revenue_per_visit_numeric,
      'pilot_batch', 'stage_500'
    ) as metadata
  from tmp_master_attendance_pilot_stage st
  join app_core.source_records sr
    on sr.organization_id = st.organization_id
   and sr.source_type = 'master_attendance_data'
   and sr.source_record_key = st.source_record_key
  join app_core.source_identities student_si
    on student_si.organization_id = st.organization_id
   and student_si.source_type = 'master_attendance_data'
   and student_si.source_identity_type = 'student'
   and student_si.source_identity_key = coalesce(
     st.student_norm_email,
     concat_ws(':', 'name_only', st.student_norm_name, coalesce(st.birth_month::text, 'unknown_month'), coalesce(st.birth_year::text, 'unknown_year'), coalesce(st.student_norm_phone, 'no_phone'))
   )
  left join app_core.source_identities instructor_si
    on instructor_si.organization_id = st.organization_id
   and instructor_si.source_type = 'master_attendance_data'
   and instructor_si.source_identity_type = 'instructor'
   and instructor_si.source_identity_key = concat_ws(':', 'name_only', st.instructor_norm_name)
  where student_si.person_id is not null
    and st.service_date is not null
  order by st.organization_id, sr.id, st.service_date desc nulls last, st.legacy_id desc nulls last
)
select
  lr.organization_id,
  lr.student_person_id,
  lr.instructor_person_id,
  lr.service_date,
  lr.title,
  lr.instrument,
  'private',
  lr.status,
  lr.lesson_notes,
  lr.source_record_id,
  lr.metadata
from lesson_rows lr
where not exists (
    select 1
    from app_core.lessons existing
    where existing.organization_id = lr.organization_id
      and existing.source_record_id = lr.source_record_id
  );

insert into app_core.instructor_student_assignments (
  organization_id,
  instructor_person_id,
  student_person_id,
  effective_start,
  metadata
)
select distinct
  l.organization_id,
  l.instructor_person_id,
  l.student_person_id,
  min(l.lesson_date) over (partition by l.organization_id, l.instructor_person_id, l.student_person_id),
  jsonb_build_object('source_type', 'master_attendance_data', 'pilot_batch', 'stage_500')
from app_core.lessons l
join tmp_master_attendance_pilot_stage st
  on st.organization_id = l.organization_id
join app_core.source_records sr
  on sr.organization_id = st.organization_id
 and sr.source_type = 'master_attendance_data'
 and sr.source_record_key = st.source_record_key
 and sr.id = l.source_record_id
where l.instructor_person_id is not null
on conflict do nothing;

do $$
declare
  v_lessons int;
  v_assignments int;
begin
  select count(*)
    into v_lessons
  from app_core.lessons l
  join tmp_master_attendance_pilot_stage st
    on st.organization_id = l.organization_id
  join app_core.source_records sr
    on sr.organization_id = st.organization_id
   and sr.source_type = 'master_attendance_data'
   and sr.source_record_key = st.source_record_key
   and sr.id = l.source_record_id;

  select count(distinct isa.id)
    into v_assignments
  from app_core.instructor_student_assignments isa
  join app_core.lessons l
    on l.organization_id = isa.organization_id
   and l.instructor_person_id = isa.instructor_person_id
   and l.student_person_id = isa.student_person_id
  join tmp_master_attendance_pilot_stage st
    on st.organization_id = l.organization_id
  join app_core.source_records sr
    on sr.organization_id = st.organization_id
   and sr.source_type = 'master_attendance_data'
   and sr.source_record_key = st.source_record_key
   and sr.id = l.source_record_id;

  raise notice 'master_attendance lessons pilot complete: % lessons, % instructor-student assignments.',
    v_lessons,
    v_assignments;
end;
$$;

commit;
