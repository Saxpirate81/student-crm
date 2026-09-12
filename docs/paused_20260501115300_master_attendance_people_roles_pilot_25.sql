begin;

set local statement_timeout = '30s';

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
   and st.source_payload->>'pilot_batch' = 'stage_25'
  where si.source_type = 'master_attendance_data'
    and si.source_payload->>'pilot_batch' = 'stage_25'
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
  jsonb_build_object(
    'created_from_source', 'master_attendance_data',
    'source_identity_type', source_identity_type,
    'pilot_batch', 'stage_25'
  )
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
  and si.source_payload->>'pilot_batch' = 'stage_25'
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
   and st.source_payload->>'pilot_batch' = 'stage_25'
  where si.source_type = 'master_attendance_data'
    and si.source_payload->>'pilot_batch' = 'stage_25'
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
    'source_backed_unverified_identity', true,
    'pilot_batch', 'stage_25'
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
  and si.source_payload->>'pilot_batch' = 'stage_25'
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
where source_payload->>'pilot_batch' = 'stage_25'
  and person_id is not null
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
where source_payload->>'pilot_batch' = 'stage_25'
  and person_id is not null
  and normalized_phone is not null
on conflict do nothing;

insert into app_core.person_roles (organization_id, person_id, role_id, metadata)
select distinct si.organization_id, si.person_id, r.id, jsonb_build_object('source_type', si.source_type, 'pilot_batch', 'stage_25')
from app_core.source_identities si
join app_core.roles r
  on r.key = case
    when si.source_identity_type = 'parent' then 'parent'
    when si.source_identity_type = 'student' then 'student'
    when si.source_identity_type = 'instructor' then 'instructor'
    else 'employee'
  end
where si.source_payload->>'pilot_batch' = 'stage_25'
  and si.person_id is not null
on conflict do nothing;

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
  where si.source_payload->>'pilot_batch' = 'stage_25'
    and si.source_type = 'master_attendance_data'
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

do $$
declare
  v_linked_identities int;
  v_people int;
  v_roles int;
begin
  select count(*)
    into v_linked_identities
  from app_core.source_identities
  where source_payload->>'pilot_batch' = 'stage_25'
    and person_id is not null;

  select count(distinct p.id)
    into v_people
  from app_core.persons p
  join app_core.source_identities si
    on si.organization_id = p.organization_id
   and si.person_id = p.id
  where si.source_payload->>'pilot_batch' = 'stage_25';

  select count(*)
    into v_roles
  from app_core.person_roles pr
  join app_core.source_identities si
    on si.organization_id = pr.organization_id
   and si.person_id = pr.person_id
  where si.source_payload->>'pilot_batch' = 'stage_25'
    and pr.active = true;

  raise notice 'master_attendance people/roles pilot complete: % linked identities, % people, % active roles.',
    v_linked_identities,
    v_people,
    v_roles;
end;
$$;

commit;
