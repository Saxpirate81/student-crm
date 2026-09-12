begin;

set local statement_timeout = '30s';

with current_org as (
  select id as organization_id
  from app_core.organizations
  where slug = 'real-school'
),
latest_attendance as (
  select *
  from public.master_attendance_data
  order by id desc
  limit 25
),
raw_attendance as (
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
    ) as source_record_key,
    m.*
  from latest_attendance m
  cross join current_org o
),
deduped_attendance as (
  select distinct on (organization_id, source_record_key)
    *
  from raw_attendance
  order by organization_id, source_record_key, date desc nulls last, id desc
)
insert into app_private.master_attendance_stage (
  organization_id,
  source_record_key,
  source_payload,
  legacy_id,
  service_date,
  banked_dates_raw,
  week_day,
  student_name,
  student_norm_name,
  student_email,
  student_norm_email,
  student_phone,
  student_norm_phone,
  primary_name,
  primary_norm_name,
  primary_email,
  primary_norm_email,
  instructor_name,
  instructor_norm_name,
  birthday_raw,
  birth_month,
  birth_year,
  start_raw,
  end_raw,
  start_time,
  end_time,
  lesson_notes,
  location,
  room,
  status,
  description,
  category,
  product,
  revenue_per_visit_raw,
  revenue_per_visit_numeric
)
select
  m.organization_id,
  m.source_record_key,
  jsonb_strip_nulls(
    to_jsonb(m)
    || jsonb_build_object(
      'legacy_daily_row_id', m.id,
      'stable_source_record_key', m.source_record_key,
      'source_record_key_strategy', 'date_student_time_instructor_location_v1',
      'pilot_batch', 'stage_25'
    )
  ),
  m.id,
  m.date,
  nullif(trim(m.banked_dates), ''),
  nullif(trim(m.week_day), ''),
  nullif(trim(m.student_name), ''),
  app_private.norm_name(m.student_name),
  nullif(trim(m.student_email), ''),
  app_private.norm_email(m.student_email),
  nullif(trim(m.phone_numbers), ''),
  app_private.norm_phone(m.phone_numbers),
  nullif(trim(m.primary_name), ''),
  app_private.norm_name(m.primary_name),
  nullif(trim(m.primary_email), ''),
  app_private.norm_email(m.primary_email),
  nullif(trim(m.instructor_name), ''),
  app_private.norm_name(m.instructor_name),
  nullif(trim(m.birthday), ''),
  case
    when m.birthday ~ '^\d{1,2}/\d{4}$'
     and split_part(m.birthday, '/', 1)::int between 1 and 12
    then split_part(m.birthday, '/', 1)::int
  end,
  case
    when m.birthday ~ '^\d{1,2}/\d{4}$'
     and split_part(m.birthday, '/', 2)::int between 1900 and 2100
    then split_part(m.birthday, '/', 2)::int
  end,
  nullif(trim(m.start), ''),
  nullif(trim(m."end"), ''),
  case
    when lower(trim(m.start)) ~ '^\d{1,2}:\d{2}\s*(am|pm)$'
    then to_timestamp(lower(trim(m.start)), 'HH12:MIPM')::time
  end,
  case
    when lower(trim(m."end")) ~ '^\d{1,2}:\d{2}\s*(am|pm)$'
    then to_timestamp(lower(trim(m."end")), 'HH12:MIPM')::time
  end,
  nullif(trim(m.lesson_notes), ''),
  nullif(trim(m.location), ''),
  nullif(trim(m.room), ''),
  nullif(trim(m.status), ''),
  nullif(trim(m.description), ''),
  nullif(trim(m.category), ''),
  nullif(trim(m.product), ''),
  nullif(trim(m.revenue_per_visit), ''),
  case
    when nullif(regexp_replace(coalesce(m.revenue_per_visit, ''), '[^0-9.]', '', 'g'), '') ~ '^\d+(\.\d+)?$'
    then nullif(regexp_replace(coalesce(m.revenue_per_visit, ''), '[^0-9.]', '', 'g'), '')::numeric
  end
from deduped_attendance m
on conflict (organization_id, source_record_key)
do update set
  source_payload = excluded.source_payload,
  service_date = excluded.service_date,
  banked_dates_raw = excluded.banked_dates_raw,
  week_day = excluded.week_day,
  student_name = excluded.student_name,
  student_norm_name = excluded.student_norm_name,
  student_email = excluded.student_email,
  student_norm_email = excluded.student_norm_email,
  student_phone = excluded.student_phone,
  student_norm_phone = excluded.student_norm_phone,
  primary_name = excluded.primary_name,
  primary_norm_name = excluded.primary_norm_name,
  primary_email = excluded.primary_email,
  primary_norm_email = excluded.primary_norm_email,
  instructor_name = excluded.instructor_name,
  instructor_norm_name = excluded.instructor_norm_name,
  birthday_raw = excluded.birthday_raw,
  birth_month = excluded.birth_month,
  birth_year = excluded.birth_year,
  start_raw = excluded.start_raw,
  end_raw = excluded.end_raw,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  lesson_notes = excluded.lesson_notes,
  location = excluded.location,
  room = excluded.room,
  status = excluded.status,
  description = excluded.description,
  category = excluded.category,
  product = excluded.product,
  revenue_per_visit_raw = excluded.revenue_per_visit_raw,
  revenue_per_visit_numeric = excluded.revenue_per_visit_numeric,
  staged_at = now();

do $$
declare
  v_pilot_rows int;
begin
  select count(*)
    into v_pilot_rows
  from app_private.master_attendance_stage
  where source_payload->>'pilot_batch' = 'stage_25';

  raise notice 'master_attendance stage pilot complete: % staged pilot rows.', v_pilot_rows;
end;
$$;

commit;
