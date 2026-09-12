-- Cadenza / Real School Supabase validation queries
-- Run after consolidated migration and after optional attendance backfill.
-- Queries should return zero rows unless a comment states otherwise.

-- 1. Every tenant-owned app_core table has organization_id.
select table_schema, table_name
from information_schema.tables t
where table_schema = 'app_core'
  and table_type = 'BASE TABLE'
  and table_name not in ('organizations', 'roles')
  and not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = t.table_schema
      and c.table_name = t.table_name
      and c.column_name = 'organization_id'
      and c.is_nullable = 'NO'
  )
order by table_name;

-- 2. RLS enabled on tenant-owned app_core tables.
select n.nspname as schema_name, c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'app_core'
  and c.relkind = 'r'
  and c.relname not in ('roles')
  and c.relrowsecurity = false
order by c.relname;

-- 3. Duplicate active person roles.
select organization_id, person_id, role_id, count(*)
from app_core.person_roles
where active = true
group by organization_id, person_id, role_id
having count(*) > 1;

-- 4. Duplicate source identities.
select organization_id, source_type, source_identity_type, source_identity_key, count(*)
from app_core.source_identities
group by organization_id, source_type, source_identity_type, source_identity_key
having count(*) > 1;

-- 5. Unlinked source identities by type. Non-zero means the import could not safely create/link a person.
select organization_id, source_type, source_identity_type, count(*) as unlinked_count
from app_core.source_identities
where person_id is null
group by organization_id, source_type, source_identity_type
order by source_type, source_identity_type;

-- 6. Open match candidate counts. Non-zero is expected until manual review is complete.
select organization_id, candidate_kind, count(*) as open_count
from app_core.match_candidates
where status = 'open'
group by organization_id, candidate_kind
order by candidate_kind;

-- 7. Orphan auth identity links.
select pai.*
from app_core.person_auth_identities pai
left join app_core.persons p
  on p.organization_id = pai.organization_id
 and p.id = pai.person_id
where p.id is null;

-- 8. Orphan household links.
select hm.*
from app_core.household_members hm
left join app_core.households h
  on h.organization_id = hm.organization_id
 and h.id = hm.household_id
left join app_core.persons p
  on p.organization_id = hm.organization_id
 and p.id = hm.person_id
where h.id is null or p.id is null;

-- 9. Orphan instructor/student assignments.
select isa.*
from app_core.instructor_student_assignments isa
left join app_core.persons instructor
  on instructor.organization_id = isa.organization_id
 and instructor.id = isa.instructor_person_id
left join app_core.persons student
  on student.organization_id = isa.organization_id
 and student.id = isa.student_person_id
where instructor.id is null or student.id is null;

-- 10. Lesson FK integrity.
select l.*
from app_core.lessons l
left join app_core.persons student
  on student.organization_id = l.organization_id
 and student.id = l.student_person_id
left join app_core.persons instructor
  on instructor.organization_id = l.organization_id
 and instructor.id = l.instructor_person_id
where student.id is null
   or (l.instructor_person_id is not null and instructor.id is null);

-- 11. Import reconciliation.
select
  (select count(*) from public.master_attendance_data) as legacy_rows,
  (select count(distinct app_private.master_attendance_stable_key(
    date,
    student_name,
    student_email,
    birthday,
    phone_numbers,
    start,
    "end",
    instructor_name,
    location,
    room,
    product,
    category
  )) from public.master_attendance_data) as current_stable_source_records,
  (select count(*) from app_private.master_attendance_stage) as staged_rows,
  (select count(*) from app_core.source_records where source_type = 'master_attendance_data') as source_records;

-- 12. Legacy rows missing source records.
select
  m.id as daily_row_id,
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
  ) as expected_source_record_key
from public.master_attendance_data m
left join app_core.source_records sr
  on sr.source_type = 'master_attendance_data'
 and sr.source_record_key = app_private.master_attendance_stable_key(
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
 )
where sr.id is null;

-- 13. Source records without linked identities.
select sr.*
from app_core.source_records sr
where sr.source_type = 'master_attendance_data'
  and not exists (
    select 1
    from app_core.source_record_identities sri
    where sri.organization_id = sr.organization_id
      and sri.source_record_id = sr.id
  );

-- 14. Lessons imported from the same source record more than once.
select organization_id, source_record_id, count(*)
from app_core.lessons
where source_record_id is not null
group by organization_id, source_record_id
having count(*) > 1;

-- 15. Cross-tenant FK leakage guard. Should return zero rows.
select 'lesson_student' as check_name, l.id
from app_core.lessons l
join app_core.persons p on p.id = l.student_person_id
where p.organization_id <> l.organization_id
union all
select 'assignment_lesson', a.id
from app_core.assignments a
join app_core.lessons l on l.id = a.lesson_id
where l.organization_id <> a.organization_id
union all
select 'media_link_asset', ml.id
from app_core.media_links ml
join app_core.media_assets ma on ma.id = ml.media_asset_id
where ma.organization_id <> ml.organization_id;

-- 16. Shared email/phone visibility candidates. These are not invalid, but should be reviewed before auto-linking auth.
select organization_id, normalized_email, count(*) as person_count
from app_core.persons
where normalized_email is not null
group by organization_id, normalized_email
having count(*) > 1
order by person_count desc;

select organization_id, contact_type, normalized_value, count(distinct person_id) as person_count
from app_core.person_contact_points
where active = true
group by organization_id, contact_type, normalized_value
having count(distinct person_id) > 1
order by person_count desc;

-- 17. Duplicate imported household keys. Should return zero rows.
select organization_id, metadata->>'import_household_key' as import_household_key, count(*) as household_count
from app_core.households
where metadata ? 'import_household_key'
group by organization_id, metadata->>'import_household_key'
having count(*) > 1;

-- 18. Imported student people without an active household link. Should return zero rows after attendance backfill.
select p.organization_id, p.id, p.display_name
from app_core.persons p
join app_core.person_roles pr
  on pr.organization_id = p.organization_id
 and pr.person_id = p.id
 and pr.active = true
join app_core.roles r
  on r.id = pr.role_id
 and r.key = 'student'
where p.metadata->>'created_from_source' = 'master_attendance_data'
  and not exists (
    select 1
    from app_core.household_members hm
    where hm.organization_id = p.organization_id
      and hm.person_id = p.id
      and hm.active = true
  );

-- 19. Source-backed unverified people by role. Non-zero is expected; these are the manual review queue.
select si.organization_id, si.source_identity_type, count(*) as unverified_count
from app_core.source_identities si
join app_core.persons p
  on p.organization_id = si.organization_id
 and p.id = si.person_id
where p.metadata->>'source_backed_unverified_identity' = 'true'
group by si.organization_id, si.source_identity_type
order by si.source_identity_type;
