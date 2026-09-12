-- Cadenza / Real School legacy attendance backfill
-- Date: 2026-04-30
-- Source: public.master_attendance_data
-- Target organization: app_core.organizations.slug = 'real-school'
--
-- This job is idempotent and safe to rerun. It preserves raw source payloads,
-- stages normalized values, creates source lineage, links exact email matches,
-- creates canonical source-backed people, builds imported household links from
-- primary/student pairs, and routes uncertain imported identities to review.
--
-- Important source behavior: public.master_attendance_data is cleared and
-- reuploaded daily. This script never uses its daily row id as the durable
-- source record key. It builds a stable natural key from lesson fields instead.

begin;

set local statement_timeout = '2h';

with current_org as (
  select id as organization_id
  from app_core.organizations
  where slug = 'real-school'
),
cleared_stage as (
  delete from app_private.master_attendance_stage st
  using current_org o
  where st.organization_id = o.organization_id
  returning st.source_record_key
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
      m.end,
      m.instructor_name,
      m.location,
      m.room,
      m.product,
      m.category
    ) as source_record_key,
    m.*
  from public.master_attendance_data m
  cross join current_org o
  cross join (select count(*) as cleared_count from cleared_stage) clear_guard
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
      'source_record_key_strategy', 'date_student_time_instructor_location_v1'
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
  nullif(trim(m.end), ''),
  case
    when lower(trim(m.start)) ~ '^\d{1,2}:\d{2}\s*(am|pm)$'
    then to_timestamp(lower(trim(m.start)), 'HH12:MIPM')::time
  end,
  case
    when lower(trim(m.end)) ~ '^\d{1,2}:\d{2}\s*(am|pm)$'
    then to_timestamp(lower(trim(m.end)), 'HH12:MIPM')::time
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
on conflict (organization_id, source_type, source_record_key)
do update set
  source_payload = excluded.source_payload,
  imported_at = now();

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
    jsonb_build_object('role_in_source', 'student') as source_payload,
    service_date,
    legacy_id
  from app_private.master_attendance_stage
  where coalesce(student_norm_email, student_norm_name) is not null
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
    jsonb_build_object('role_in_source', 'primary') as source_payload,
    service_date,
    legacy_id
  from app_private.master_attendance_stage
  where coalesce(primary_norm_email, primary_norm_name) is not null
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
    jsonb_build_object('role_in_source', 'instructor') as source_payload,
    service_date,
    legacy_id
  from app_private.master_attendance_stage
  where instructor_norm_name is not null
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
on conflict do nothing;

with source_people as (
  select
    si.organization_id,
    si.id as source_identity_id,
    si.source_identity_type,
    si.source_display_name,
    si.source_email,
    si.source_phone,
    si.normalized_name,
    si.normalized_email,
    si.normalized_phone,
    max(st.birth_month) filter (where si.source_identity_type = 'student') as birth_month,
    max(st.birth_year) filter (where si.source_identity_type = 'student') as birth_year,
    max(st.birthday_raw) filter (where si.source_identity_type = 'student') as birthday_raw
  from app_core.source_identities si
  left join app_private.master_attendance_stage st
    on st.organization_id = si.organization_id
   and st.student_norm_email = si.normalized_email
  where si.source_type = 'master_attendance_data'
    and si.person_id is null
    and si.normalized_email is not null
    and si.source_identity_type in ('student', 'parent')
  group by si.organization_id, si.id, si.source_identity_type, si.source_display_name, si.source_email, si.source_phone, si.normalized_name, si.normalized_email, si.normalized_phone
),
email_counts as (
  select organization_id, normalized_email, count(*) as source_count
  from source_people
  group by organization_id, normalized_email
),
safe_new_people as (
  select sp.*
  from source_people sp
  join email_counts ec
    on ec.organization_id = sp.organization_id
   and ec.normalized_email = sp.normalized_email
   and ec.source_count = 1
  where not exists (
    select 1
    from app_core.persons p
    where p.organization_id = sp.organization_id
      and p.normalized_email = sp.normalized_email
  )
)
insert into app_core.persons (
  organization_id,
  display_name,
  normalized_name,
  email,
  normalized_email,
  phone,
  normalized_phone,
  birth_month,
  birth_year,
  raw_birthday_text,
  metadata
)
select
  organization_id,
  source_display_name,
  normalized_name,
  source_email,
  normalized_email,
  source_phone,
  normalized_phone,
  birth_month,
  birth_year,
  birthday_raw,
  jsonb_build_object('created_from_source', 'master_attendance_data', 'source_identity_type', source_identity_type)
from safe_new_people;

with unique_email_people as (
  select organization_id, normalized_email, min(id) as person_id, count(*) as person_count
  from app_core.persons
  where normalized_email is not null
  group by organization_id, normalized_email
)
update app_core.source_identities si
set person_id = uep.person_id,
    confidence = 1,
    updated_at = now()
from unique_email_people uep
where si.organization_id = uep.organization_id
  and si.normalized_email = uep.normalized_email
  and si.normalized_email is not null
  and si.person_id is null
  and uep.person_count = 1;

with source_backed_identity_people as (
  select
    si.organization_id,
    si.id as source_identity_id,
    si.source_identity_type,
    si.source_identity_key,
    si.source_display_name,
    si.source_email,
    si.source_phone,
    si.normalized_name,
    si.normalized_email,
    si.normalized_phone,
    max(st.birth_month) filter (where si.source_identity_type = 'student') as birth_month,
    max(st.birth_year) filter (where si.source_identity_type = 'student') as birth_year,
    max(st.birthday_raw) filter (where si.source_identity_type = 'student') as birthday_raw
  from app_core.source_identities si
  left join app_private.master_attendance_stage st
    on st.organization_id = si.organization_id
   and si.source_identity_type = 'student'
   and si.source_identity_key = coalesce(
     st.student_norm_email,
     concat_ws(':', 'name_only', st.student_norm_name, coalesce(st.birth_month::text, 'unknown_month'), coalesce(st.birth_year::text, 'unknown_year'), coalesce(st.student_norm_phone, 'no_phone'))
   )
  where si.source_type = 'master_attendance_data'
    and si.person_id is null
    and si.normalized_name is not null
    and si.source_identity_type in ('student', 'parent', 'instructor')
  group by
    si.organization_id,
    si.id,
    si.source_identity_type,
    si.source_identity_key,
    si.source_display_name,
    si.source_email,
    si.source_phone,
    si.normalized_name,
    si.normalized_email,
    si.normalized_phone
)
insert into app_core.persons (
  organization_id,
  display_name,
  normalized_name,
  email,
  normalized_email,
  phone,
  normalized_phone,
  birth_month,
  birth_year,
  raw_birthday_text,
  is_curated,
  metadata
)
select
  organization_id,
  coalesce(nullif(trim(source_display_name), ''), normalized_name, 'Imported ' || source_identity_type),
  normalized_name,
  source_email,
  normalized_email,
  source_phone,
  normalized_phone,
  birth_month,
  birth_year,
  birthday_raw,
  false,
  jsonb_build_object(
    'created_from_source', 'master_attendance_data',
    'source_identity_type', source_identity_type,
    'source_identity_id', source_identity_id,
    'source_identity_key', source_identity_key,
    'source_backed_name_only', normalized_email is null,
    'source_backed_unverified_identity', true
  )
from source_backed_identity_people sp
where not exists (
  select 1
  from app_core.persons p
  where p.organization_id = sp.organization_id
    and p.metadata->>'source_identity_id' = sp.source_identity_id::text
);

update app_core.source_identities si
set person_id = p.id,
    confidence = case
      when si.source_identity_type = 'student' and p.birth_year is not null then 0.8500
      when si.source_identity_type = 'instructor' then 0.8000
      else 0.7000
    end,
    updated_at = now()
from app_core.persons p
where si.organization_id = p.organization_id
  and p.metadata->>'source_identity_id' = si.id::text
  and si.source_type = 'master_attendance_data'
  and si.person_id is null;

insert into app_core.person_contact_points (
  organization_id,
  person_id,
  contact_type,
  raw_value,
  normalized_value,
  is_primary,
  source_identity_id
)
select organization_id, person_id, 'email', source_email::text, normalized_email, true, id
from app_core.source_identities
where person_id is not null
  and normalized_email is not null
on conflict do nothing;

insert into app_core.person_contact_points (
  organization_id,
  person_id,
  contact_type,
  raw_value,
  normalized_value,
  is_primary,
  source_identity_id
)
select organization_id, person_id, 'phone', source_phone, normalized_phone, false, id
from app_core.source_identities
where person_id is not null
  and normalized_phone is not null
on conflict do nothing;

insert into app_core.person_roles (organization_id, person_id, role_id, metadata)
select distinct si.organization_id, si.person_id, r.id, jsonb_build_object('source_type', si.source_type)
from app_core.source_identities si
join app_core.roles r
  on r.key = case
    when si.source_identity_type = 'parent' then 'parent'
    when si.source_identity_type = 'student' then 'student'
    when si.source_identity_type = 'instructor' then 'instructor'
    else 'employee'
  end
where si.person_id is not null
on conflict do nothing;

with family_links as (
  select distinct
    st.organization_id,
    coalesce(st.primary_norm_email, st.primary_norm_name, 'student:' || student_si.source_identity_key) as household_key,
    coalesce(nullif(trim(st.primary_name), ''), nullif(trim(st.student_name), '') || ' Household', 'Imported Household') as household_name,
    app_private.norm_name(coalesce(nullif(trim(st.primary_name), ''), nullif(trim(st.student_name), '') || ' Household', 'Imported Household')) as normalized_household_name,
    parent_si.person_id as parent_person_id,
    student_si.person_id as student_person_id,
    st.primary_name,
    st.primary_email,
    st.student_name,
    st.student_email
  from app_private.master_attendance_stage st
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
    'primary_email', primary_email
  )
from family_links fl
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
  from app_private.master_attendance_stage st
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
  from app_private.master_attendance_stage st
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

with unresolved as (
  select
    si.organization_id,
    si.id as source_identity_id,
    p.id as candidate_person_id,
    case when p.id is null then 'needs_person' else 'possible_duplicate' end as candidate_kind,
    case when p.id is null then 0.25 else 0.65 end as confidence,
    case when p.id is null
      then 'No safe email match; manual person creation or link required.'
      else 'Name matched but email was absent, shared, or different; manual review required.'
    end as reason
  from app_core.source_identities si
  left join app_core.persons p
    on p.organization_id = si.organization_id
   and p.normalized_name = si.normalized_name
   and p.profile_status = 'active'
  where si.source_type = 'master_attendance_data'
    and si.person_id is null
    and si.normalized_name is not null
)
insert into app_core.match_candidates (
  organization_id,
  source_identity_id,
  candidate_person_id,
  candidate_kind,
  confidence,
  reason
)
select organization_id, source_identity_id, candidate_person_id, candidate_kind, confidence, reason
from unresolved u
where not exists (
  select 1
  from app_core.match_candidates mc
  where mc.organization_id = u.organization_id
    and mc.source_identity_id = u.source_identity_id
    and mc.candidate_kind = u.candidate_kind
    and coalesce(mc.candidate_person_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(u.candidate_person_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and mc.status = 'open'
);

with review_needed as (
  select
    si.organization_id,
    si.id as source_identity_id,
    si.person_id as candidate_person_id,
    case
      when si.source_identity_type = 'student' and p.birth_year is not null then 0.8500
      when si.source_identity_type = 'instructor' then 0.8000
      else 0.7000
    end as confidence,
    'Source-backed unverified person was created for app continuity; verify or merge when better identity data is available.' as reason
  from app_core.source_identities si
  join app_core.persons p
    on p.organization_id = si.organization_id
   and p.id = si.person_id
  where si.source_type = 'master_attendance_data'
    and si.person_id is not null
    and p.metadata->>'source_backed_unverified_identity' = 'true'
)
insert into app_core.match_candidates (
  organization_id,
  source_identity_id,
  candidate_person_id,
  candidate_kind,
  confidence,
  reason
)
select
  organization_id,
  source_identity_id,
  candidate_person_id,
  'merge_review',
  confidence,
  reason
from review_needed rn
where not exists (
  select 1
  from app_core.match_candidates mc
  where mc.organization_id = rn.organization_id
    and mc.source_identity_id = rn.source_identity_id
    and mc.candidate_kind = 'merge_review'
    and mc.candidate_person_id = rn.candidate_person_id
    and mc.status = 'open'
);

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
select
  st.organization_id,
  student_si.person_id,
  instructor_si.person_id,
  st.service_date,
  coalesce(nullif(trim(st.description), ''), concat_ws(' - ', nullif(st.product, ''), nullif(st.category, '')), 'Imported lesson'),
  nullif(st.product, ''),
  'private',
  case
    when lower(coalesce(st.status, '')) like '%cancel%' then 'cancelled'
    when lower(coalesce(st.status, '')) like '%bank%' then 'banked'
    else 'completed'
  end,
  st.lesson_notes,
  sr.id,
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
    'revenue_per_visit_numeric', st.revenue_per_visit_numeric
  )
from app_private.master_attendance_stage st
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
  and not exists (
    select 1
    from app_core.lessons existing
    where existing.organization_id = st.organization_id
      and existing.source_record_id = sr.id
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
  jsonb_build_object('source_type', 'master_attendance_data')
from app_core.lessons l
where l.instructor_person_id is not null
on conflict do nothing;

commit;
