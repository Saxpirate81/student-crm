-- Cadenza / Real School security definer, RLS, policies, and grants
-- Date: 2026-04-30
-- Purpose: focused appendix containing all SECURITY DEFINER functions, RLS enablement, policies, revoke/grant statements, and final commit.
-- Run after base schemas/tables exist. The full all-in-one migration already includes this content.

begin;

-- ============================================================================
-- SECURITY DEFINER FUNCTIONS
-- ============================================================================

create or replace function app_core.is_org_member(p_org uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, app_core
stable
as $$
  select exists (
    select 1
    from app_core.organization_memberships om
    where om.organization_id = p_org
      and om.user_id = auth.uid()
      and om.status = 'active'
  );
$$;

create or replace function app_core.is_org_owner(p_org uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, app_core
stable
as $$
  select exists (
    select 1
    from app_core.organization_memberships om
    where om.organization_id = p_org
      and om.user_id = auth.uid()
      and om.status = 'active'
      and om.org_role = 'owner'
  );
$$;

create or replace function app_core.is_org_admin(p_org uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, app_core
stable
as $$
  select exists (
    select 1
    from app_core.organization_memberships om
    where om.organization_id = p_org
      and om.user_id = auth.uid()
      and om.status = 'active'
      and om.org_role in ('owner', 'admin', 'manager')
  );
$$;

create or replace function app_core.is_org_owner_or_admin(p_org uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, app_core
stable
as $$
  select exists (
    select 1
    from app_core.organization_memberships om
    where om.organization_id = p_org
      and om.user_id = auth.uid()
      and om.status = 'active'
      and om.org_role in ('owner', 'admin')
  );
$$;

create or replace function app_core.current_person_id(p_org uuid)
returns uuid
language sql
security definer
set search_path = pg_catalog, app_core
stable
as $$
  select pai.person_id
  from app_core.person_auth_identities pai
  where pai.organization_id = p_org
    and pai.user_id = auth.uid()
    and pai.identity_status = 'active'
  limit 1;
$$;

create or replace function app_core.current_person_has_role(p_org uuid, p_role text)
returns boolean
language sql
security definer
set search_path = pg_catalog, app_core
stable
as $$
  select exists (
    select 1
    from app_core.person_roles pr
    join app_core.roles r on r.id = pr.role_id
    where pr.organization_id = p_org
      and pr.person_id = app_core.current_person_id(p_org)
      and pr.active = true
      and (pr.effective_end is null or pr.effective_end >= current_date)
      and r.key = p_role
  );
$$;

create or replace function app_core.can_access_person(p_org uuid, p_person uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, app_core
stable
as $$
  select
    app_core.is_org_admin(p_org)
    or app_core.current_person_id(p_org) = p_person
    or exists (
      select 1
      from app_core.household_members hm_self
      join app_core.household_members hm_other
        on hm_other.household_id = hm_self.household_id
       and hm_other.organization_id = hm_self.organization_id
      where hm_self.organization_id = p_org
        and hm_self.person_id = app_core.current_person_id(p_org)
        and hm_self.active = true
        and hm_self.relationship in ('parent', 'guardian', 'adult_student')
        and hm_other.person_id = p_person
        and hm_other.active = true
    )
    or exists (
      select 1
      from app_core.instructor_student_assignments isa
      where isa.organization_id = p_org
        and isa.instructor_person_id = app_core.current_person_id(p_org)
        and isa.student_person_id = p_person
        and isa.active = true
        and (isa.effective_end is null or isa.effective_end >= current_date)
    );
$$;

create or replace function app_core.can_access_lesson(p_org uuid, p_lesson uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, app_core
stable
as $$
  select exists (
    select 1
    from app_core.lessons l
    where l.organization_id = p_org
      and l.id = p_lesson
      and (
        app_core.is_org_admin(p_org)
        or app_core.can_access_person(p_org, l.student_person_id)
        or l.instructor_person_id = app_core.current_person_id(p_org)
      )
  );
$$;

create or replace function app_core.can_access_assignment(p_org uuid, p_assignment uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, app_core
stable
as $$
  select exists (
    select 1
    from app_core.assignments a
    where a.organization_id = p_org
      and a.id = p_assignment
      and (
        app_core.is_org_admin(p_org)
        or app_core.can_access_person(p_org, a.student_person_id)
        or a.instructor_person_id = app_core.current_person_id(p_org)
      )
  );
$$;

create or replace function app_core.can_read_communication(p_org uuid, p_comm uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, app_core
stable
as $$
  select exists (
    select 1
    from app_core.communications c
    where c.organization_id = p_org
      and c.id = p_comm
      and c.published_at <= now()
      and (c.expires_at is null or c.expires_at > now())
      and (
        app_core.is_org_admin(p_org)
        or c.audience_scope = 'organization'
        or (c.audience_scope = 'role' and c.audience_role is not null and app_core.current_person_has_role(p_org, c.audience_role))
        or (c.audience_scope = 'person' and c.recipient_person_id = app_core.current_person_id(p_org))
        or (c.audience_scope = 'household' and exists (
          select 1 from app_core.household_members hm
          where hm.organization_id = p_org
            and hm.household_id = c.household_id
            and hm.person_id = app_core.current_person_id(p_org)
            and hm.active = true
        ))
        or (c.audience_scope = 'lesson' and c.lesson_id is not null and app_core.can_access_lesson(p_org, c.lesson_id))
        or (c.audience_scope = 'assignment' and c.assignment_id is not null and app_core.can_access_assignment(p_org, c.assignment_id))
      )
  );
$$;

create or replace function app_core.create_person_manual(
  p_organization_id uuid,
  p_display_name text,
  p_email text default null,
  p_phone text default null,
  p_birth_month int default null,
  p_birth_year int default null,
  p_metadata jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, app_core, app_private
as $$
declare
  v_person_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not app_core.is_org_admin(p_organization_id) then raise exception 'not authorized'; end if;
  if nullif(trim(p_display_name), '') is null then raise exception 'display_name required'; end if;

  insert into app_core.persons (
    organization_id, display_name, normalized_name, email, normalized_email,
    phone, normalized_phone, birth_month, birth_year, is_curated, metadata,
    created_by, updated_by
  )
  values (
    p_organization_id,
    trim(p_display_name),
    app_private.norm_name(p_display_name),
    nullif(trim(coalesce(p_email, '')), ''),
    app_private.norm_email(p_email),
    nullif(trim(coalesce(p_phone, '')), ''),
    app_private.norm_phone(p_phone),
    p_birth_month,
    p_birth_year,
    true,
    coalesce(p_metadata, '{}'),
    auth.uid(),
    auth.uid()
  )
  returning id into v_person_id;

  if app_private.norm_email(p_email) is not null then
    insert into app_core.person_contact_points (
      organization_id, person_id, contact_type, raw_value, normalized_value, is_primary, created_by, updated_by
    )
    values (p_organization_id, v_person_id, 'email', trim(p_email), app_private.norm_email(p_email), true, auth.uid(), auth.uid())
    on conflict do nothing;
  end if;

  if app_private.norm_phone(p_phone) is not null then
    insert into app_core.person_contact_points (
      organization_id, person_id, contact_type, raw_value, normalized_value, is_primary, created_by, updated_by
    )
    values (p_organization_id, v_person_id, 'phone', trim(p_phone), app_private.norm_phone(p_phone), true, auth.uid(), auth.uid())
    on conflict do nothing;
  end if;

  return v_person_id;
end;
$$;

create or replace function app_core.link_auth_user_to_person(
  p_organization_id uuid,
  p_person_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, app_core
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not app_core.is_org_admin(p_organization_id) then raise exception 'not authorized'; end if;
  if not exists (select 1 from app_core.persons where organization_id = p_organization_id and id = p_person_id) then
    raise exception 'person not found in organization';
  end if;

  insert into app_core.person_auth_identities (organization_id, person_id, user_id, created_by, updated_by)
  values (p_organization_id, p_person_id, p_user_id, auth.uid(), auth.uid())
  on conflict (organization_id, user_id)
  do update set
    person_id = excluded.person_id,
    identity_status = 'active',
    updated_by = auth.uid(),
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function app_core.bootstrap_current_user_as_real_school_owner()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, app_core
as $$
declare
  v_org uuid;
  v_membership uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select id into v_org
  from app_core.organizations
  where slug = 'real-school';

  if v_org is null then
    raise exception 'real-school organization not found';
  end if;

  if exists (
    select 1
    from app_core.organization_memberships
    where organization_id = v_org
      and status = 'active'
  ) and not app_core.is_org_owner(v_org) then
    raise exception 'owner already exists';
  end if;

  insert into app_core.organization_memberships (
    organization_id,
    user_id,
    org_role,
    status,
    joined_at,
    created_by,
    updated_by
  )
  values (
    v_org,
    auth.uid(),
    'owner',
    'active',
    now(),
    auth.uid(),
    auth.uid()
  )
  on conflict (organization_id, user_id)
  do update set
    org_role = case
      when not exists (
        select 1
        from app_core.organization_memberships existing
        where existing.organization_id = v_org
          and existing.status = 'active'
          and existing.org_role = 'owner'
          and existing.user_id <> auth.uid()
      ) then 'owner'
      else app_core.organization_memberships.org_role
    end,
    status = 'active',
    joined_at = coalesce(app_core.organization_memberships.joined_at, now()),
    updated_by = auth.uid(),
    updated_at = now()
  returning id into v_membership;

  return v_membership;
end;
$$;

create or replace function app_core.assign_role(
  p_organization_id uuid,
  p_person_id uuid,
  p_role_key text,
  p_effective_start date default current_date,
  p_effective_end date default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, app_core
as $$
declare
  v_role_id uuid;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not app_core.is_org_admin(p_organization_id) then raise exception 'not authorized'; end if;
  if not exists (select 1 from app_core.persons where organization_id = p_organization_id and id = p_person_id) then
    raise exception 'person not found in organization';
  end if;

  select id into v_role_id from app_core.roles where key = p_role_key;
  if v_role_id is null then raise exception 'unknown role'; end if;

  select pr.id into v_id
  from app_core.person_roles pr
  where pr.organization_id = p_organization_id
    and pr.person_id = p_person_id
    and pr.role_id = v_role_id
    and pr.active = true
  limit 1;

  if v_id is null then
    insert into app_core.person_roles (
      organization_id, person_id, role_id, effective_start, effective_end, active, created_by, updated_by
    )
    values (p_organization_id, p_person_id, v_role_id, coalesce(p_effective_start, current_date), p_effective_end, true, auth.uid(), auth.uid())
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

create or replace function app_core.remove_role(
  p_organization_id uuid,
  p_person_id uuid,
  p_role_key text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, app_core
as $$
declare
  v_role_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not app_core.is_org_admin(p_organization_id) then raise exception 'not authorized'; end if;

  select id into v_role_id from app_core.roles where key = p_role_key;
  if v_role_id is null then raise exception 'unknown role'; end if;

  update app_core.person_roles
  set active = false,
      effective_end = coalesce(effective_end, current_date),
      updated_by = auth.uid(),
      updated_at = now()
  where organization_id = p_organization_id
    and person_id = p_person_id
    and role_id = v_role_id
    and active = true;
end;
$$;

create or replace function app_core.link_parent_child(
  p_organization_id uuid,
  p_parent_person_id uuid,
  p_child_person_id uuid,
  p_household_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, app_core, app_private
as $$
declare
  v_household_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not app_core.is_org_admin(p_organization_id) then raise exception 'not authorized'; end if;

  if not exists (select 1 from app_core.persons where organization_id = p_organization_id and id = p_parent_person_id) then
    raise exception 'parent person not found in organization';
  end if;
  if not exists (select 1 from app_core.persons where organization_id = p_organization_id and id = p_child_person_id) then
    raise exception 'child person not found in organization';
  end if;

  select hm.household_id into v_household_id
  from app_core.household_members hm
  where hm.organization_id = p_organization_id
    and hm.person_id in (p_parent_person_id, p_child_person_id)
    and hm.active = true
  group by hm.household_id
  having count(distinct hm.person_id) = 2
  limit 1;

  if v_household_id is null then
    insert into app_core.households (
      organization_id, name, normalized_name, primary_contact_person_id, created_by, updated_by
    )
    values (
      p_organization_id,
      coalesce(nullif(trim(p_household_name), ''), 'Household'),
      app_private.norm_name(coalesce(nullif(trim(p_household_name), ''), 'Household')),
      p_parent_person_id,
      auth.uid(),
      auth.uid()
    )
    returning id into v_household_id;
  end if;

  insert into app_core.household_members (
    organization_id, household_id, person_id, relationship, is_primary, created_by, updated_by
  )
  values
    (p_organization_id, v_household_id, p_parent_person_id, 'parent', true, auth.uid(), auth.uid()),
    (p_organization_id, v_household_id, p_child_person_id, 'student', false, auth.uid(), auth.uid())
  on conflict do nothing;

  return v_household_id;
end;
$$;

create or replace function app_core.resolve_match_candidate(
  p_candidate_id uuid,
  p_resolution text,
  p_person_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, app_core
as $$
declare
  v_org uuid;
  v_source_identity uuid;
  v_previous_person uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_resolution not in ('link_to_person', 'create_new_person', 'reject', 'ignore') then
    raise exception 'invalid resolution';
  end if;

  select mc.organization_id, mc.source_identity_id, si.person_id
  into v_org, v_source_identity, v_previous_person
  from app_core.match_candidates mc
  join app_core.source_identities si
    on si.organization_id = mc.organization_id
   and si.id = mc.source_identity_id
  where mc.id = p_candidate_id;

  if v_org is null then raise exception 'candidate not found'; end if;
  if not app_core.is_org_owner_or_admin(v_org) then raise exception 'not authorized'; end if;

  if p_resolution = 'link_to_person' and p_person_id is null then
    raise exception 'person required for link_to_person';
  end if;

  if p_person_id is not null and not exists (
    select 1 from app_core.persons where organization_id = v_org and id = p_person_id
  ) then
    raise exception 'person not found in organization';
  end if;

  update app_core.match_candidates
  set status = case when p_resolution in ('reject', 'ignore') then 'rejected' else 'resolved' end,
      resolution = p_resolution,
      candidate_person_id = coalesce(p_person_id, candidate_person_id),
      resolved_by = auth.uid(),
      resolved_at = now(),
      updated_at = now()
  where id = p_candidate_id;

  if p_resolution = 'link_to_person' and p_person_id is not null then
    insert into app_core.source_identity_link_events (
      organization_id, source_identity_id, previous_person_id, new_person_id, action, reason, created_by
    )
    values (
      v_org,
      v_source_identity,
      v_previous_person,
      p_person_id,
      case when v_previous_person is null then 'linked' else 'relinked' end,
      p_resolution,
      auth.uid()
    );

    update app_core.source_identities
    set person_id = p_person_id,
        confidence = 1,
        updated_at = now()
    where organization_id = v_org
      and id = v_source_identity;
  end if;
end;
$$;

create or replace function app_core.mark_communication_read(
  p_organization_id uuid,
  p_communication_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, app_core
as $$
declare
  v_person uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  v_person := app_core.current_person_id(p_organization_id);
  if v_person is null then raise exception 'person identity not linked'; end if;
  if not app_core.can_read_communication(p_organization_id, p_communication_id) then
    raise exception 'not authorized';
  end if;

  insert into app_core.communication_reads (organization_id, communication_id, person_id)
  values (p_organization_id, p_communication_id, v_person)
  on conflict (organization_id, communication_id, person_id)
  do update set read_at = now();
end;
$$;

create or replace function app_core.log_practice_session(
  p_organization_id uuid,
  p_student_person_id uuid,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_active_seconds int,
  p_detected_seconds int default 0,
  p_lesson_id uuid default null,
  p_assignment_id uuid default null,
  p_student_notes text default null,
  p_rating int default null,
  p_detection_mode text default 'audio_activity'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, app_core
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not (app_core.is_org_admin(p_organization_id) or p_student_person_id = app_core.current_person_id(p_organization_id)) then
    raise exception 'not authorized';
  end if;
  if p_active_seconds < 0 or p_detected_seconds < 0 then raise exception 'seconds must be non-negative'; end if;

  insert into app_core.practice_sessions (
    organization_id, student_person_id, lesson_id, assignment_id, started_at, ended_at,
    active_seconds, detected_seconds, detection_mode, student_notes, rating, xp_awarded,
    status, created_by, updated_by
  )
  values (
    p_organization_id, p_student_person_id, p_lesson_id, p_assignment_id, p_started_at, p_ended_at,
    p_active_seconds, p_detected_seconds, p_detection_mode, p_student_notes, p_rating,
    greatest(0, floor(p_active_seconds / 60.0 * 2)::int),
    'saved', auth.uid(), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function app_core.log_listening_session(
  p_organization_id uuid,
  p_student_person_id uuid,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_listened_seconds int,
  p_track_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, app_core
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not (app_core.is_org_admin(p_organization_id) or p_student_person_id = app_core.current_person_id(p_organization_id)) then
    raise exception 'not authorized';
  end if;
  if p_listened_seconds < 0 then raise exception 'seconds must be non-negative'; end if;

  insert into app_core.listening_sessions (
    organization_id, student_person_id, track_id, started_at, ended_at,
    listened_seconds, xp_awarded, created_by, updated_by
  )
  values (
    p_organization_id, p_student_person_id, p_track_id, p_started_at, p_ended_at,
    p_listened_seconds, greatest(0, floor(p_listened_seconds / 60.0)::int),
    auth.uid(), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ============================================================================
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY
-- ============================================================================

alter table app_core.organizations enable row level security;
alter table app_core.organization_memberships enable row level security;
alter table app_core.roles enable row level security;
alter table app_core.persons enable row level security;
alter table app_core.person_auth_identities enable row level security;
alter table app_core.person_roles enable row level security;
alter table app_core.households enable row level security;
alter table app_core.household_members enable row level security;
alter table app_core.instructor_student_assignments enable row level security;
alter table app_core.source_records enable row level security;
alter table app_core.source_identities enable row level security;
alter table app_core.source_record_identities enable row level security;
alter table app_core.match_candidates enable row level security;
alter table app_core.person_contact_points enable row level security;
alter table app_core.source_identity_link_events enable row level security;
alter table app_core.person_merge_events enable row level security;
alter table app_core.lessons enable row level security;
alter table app_core.assignments enable row level security;
alter table app_core.student_submissions enable row level security;
alter table app_core.media_assets enable row level security;
alter table app_core.media_links enable row level security;
alter table app_core.practice_sessions enable row level security;
alter table app_core.listening_playlists enable row level security;
alter table app_core.listening_tracks enable row level security;
alter table app_core.listening_sessions enable row level security;
alter table app_core.communications enable row level security;
alter table app_core.communication_reads enable row level security;
alter table app_core.reward_badges enable row level security;
alter table app_core.person_reward_badges enable row level security;

-- ============================================================================
-- POLICY RESET FOR RERUN SAFETY
-- ============================================================================

do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'app_core'
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end;
$$;

-- ============================================================================
-- CREATE POLICY STATEMENTS
-- ============================================================================

create policy orgs_read_member on app_core.organizations
for select to authenticated using (app_core.is_org_member(id));

create policy orgs_owner_admin_update on app_core.organizations
for update to authenticated using (app_core.is_org_owner_or_admin(id)) with check (app_core.is_org_owner_or_admin(id));

create policy memberships_read_self_or_admin on app_core.organization_memberships
for select to authenticated using (user_id = auth.uid() or app_core.is_org_admin(organization_id));

create policy memberships_owner_write on app_core.organization_memberships
for all to authenticated using (app_core.is_org_owner(organization_id)) with check (app_core.is_org_owner(organization_id));

create policy roles_read_authenticated on app_core.roles
for select to authenticated using (auth.uid() is not null);

create policy persons_read_authorized on app_core.persons
for select to authenticated using (app_core.can_access_person(organization_id, id));

create policy persons_write_admin on app_core.persons
for all to authenticated using (app_core.is_org_admin(organization_id)) with check (app_core.is_org_admin(organization_id));

create policy person_auth_read_self_or_admin on app_core.person_auth_identities
for select to authenticated using (user_id = auth.uid() or app_core.is_org_admin(organization_id));

create policy person_roles_read_accessible on app_core.person_roles
for select to authenticated using (app_core.is_org_admin(organization_id) or app_core.can_access_person(organization_id, person_id));

create policy person_roles_write_admin on app_core.person_roles
for all to authenticated using (app_core.is_org_admin(organization_id)) with check (app_core.is_org_admin(organization_id));

create policy households_read_accessible on app_core.households
for select to authenticated using (
  app_core.is_org_admin(organization_id)
  or exists (
    select 1 from app_core.household_members hm
    where hm.organization_id = households.organization_id
      and hm.household_id = households.id
      and hm.active = true
      and app_core.can_access_person(hm.organization_id, hm.person_id)
  )
);

create policy households_write_admin on app_core.households
for all to authenticated using (app_core.is_org_admin(organization_id)) with check (app_core.is_org_admin(organization_id));

create policy household_members_read_accessible on app_core.household_members
for select to authenticated using (app_core.is_org_admin(organization_id) or app_core.can_access_person(organization_id, person_id));

create policy household_members_write_admin on app_core.household_members
for all to authenticated using (app_core.is_org_admin(organization_id)) with check (app_core.is_org_admin(organization_id));

create policy instructor_assignments_read_access on app_core.instructor_student_assignments
for select to authenticated using (
  app_core.is_org_admin(organization_id)
  or instructor_person_id = app_core.current_person_id(organization_id)
  or app_core.can_access_person(organization_id, student_person_id)
);

create policy instructor_assignments_write_admin on app_core.instructor_student_assignments
for all to authenticated using (app_core.is_org_admin(organization_id)) with check (app_core.is_org_admin(organization_id));

create policy source_records_owner_admin_only on app_core.source_records
for all to authenticated using (app_core.is_org_owner_or_admin(organization_id)) with check (app_core.is_org_owner_or_admin(organization_id));

create policy source_identities_owner_admin_only on app_core.source_identities
for all to authenticated using (app_core.is_org_owner_or_admin(organization_id)) with check (app_core.is_org_owner_or_admin(organization_id));

create policy source_record_identities_owner_admin_only on app_core.source_record_identities
for all to authenticated using (app_core.is_org_owner_or_admin(organization_id)) with check (app_core.is_org_owner_or_admin(organization_id));

create policy match_candidates_owner_admin_only on app_core.match_candidates
for all to authenticated using (app_core.is_org_owner_or_admin(organization_id)) with check (app_core.is_org_owner_or_admin(organization_id));

create policy source_link_events_owner_admin_only on app_core.source_identity_link_events
for all to authenticated using (app_core.is_org_owner_or_admin(organization_id)) with check (app_core.is_org_owner_or_admin(organization_id));

create policy merge_events_owner_admin_only on app_core.person_merge_events
for all to authenticated using (app_core.is_org_owner_or_admin(organization_id)) with check (app_core.is_org_owner_or_admin(organization_id));

create policy contact_points_read_accessible on app_core.person_contact_points
for select to authenticated using (app_core.is_org_admin(organization_id) or app_core.can_access_person(organization_id, person_id));

create policy contact_points_write_admin on app_core.person_contact_points
for all to authenticated using (app_core.is_org_admin(organization_id)) with check (app_core.is_org_admin(organization_id));

create policy lessons_read_accessible on app_core.lessons
for select to authenticated using (app_core.can_access_lesson(organization_id, id));

create policy lessons_instructor_admin_write on app_core.lessons
for all to authenticated using (
  app_core.is_org_admin(organization_id) or instructor_person_id = app_core.current_person_id(organization_id)
) with check (
  app_core.is_org_admin(organization_id) or instructor_person_id = app_core.current_person_id(organization_id)
);

create policy assignments_read_accessible on app_core.assignments
for select to authenticated using (app_core.can_access_assignment(organization_id, id));

create policy assignments_instructor_admin_write on app_core.assignments
for all to authenticated using (
  app_core.is_org_admin(organization_id) or instructor_person_id = app_core.current_person_id(organization_id)
) with check (
  app_core.is_org_admin(organization_id) or instructor_person_id = app_core.current_person_id(organization_id)
);

create policy submissions_read_accessible on app_core.student_submissions
for select to authenticated using (
  app_core.is_org_admin(organization_id)
  or app_core.can_access_assignment(organization_id, assignment_id)
  or app_core.can_access_person(organization_id, student_person_id)
);

create policy submissions_student_insert on app_core.student_submissions
for insert to authenticated with check (
  student_person_id = app_core.current_person_id(organization_id)
  or app_core.is_org_admin(organization_id)
);

create policy submissions_instructor_admin_update on app_core.student_submissions
for update to authenticated using (
  app_core.is_org_admin(organization_id)
  or app_core.can_access_assignment(organization_id, assignment_id)
) with check (
  app_core.is_org_admin(organization_id)
  or app_core.can_access_assignment(organization_id, assignment_id)
);

create policy media_read_accessible on app_core.media_assets
for select to authenticated using (
  app_core.is_org_admin(organization_id)
  or owner_person_id = app_core.current_person_id(organization_id)
  or visibility = 'organization'
  or exists (
    select 1 from app_core.media_links ml
    where ml.organization_id = media_assets.organization_id
      and ml.media_asset_id = media_assets.id
      and (
        (ml.lesson_id is not null and app_core.can_access_lesson(ml.organization_id, ml.lesson_id))
        or (ml.assignment_id is not null and app_core.can_access_assignment(ml.organization_id, ml.assignment_id))
        or (ml.student_person_id is not null and app_core.can_access_person(ml.organization_id, ml.student_person_id))
      )
  )
);

create policy media_write_member on app_core.media_assets
for all to authenticated using (
  app_core.is_org_admin(organization_id) or owner_person_id = app_core.current_person_id(organization_id)
) with check (
  app_core.is_org_admin(organization_id) or owner_person_id = app_core.current_person_id(organization_id)
);

create policy media_links_read_accessible on app_core.media_links
for select to authenticated using (
  app_core.is_org_admin(organization_id)
  or (lesson_id is not null and app_core.can_access_lesson(organization_id, lesson_id))
  or (assignment_id is not null and app_core.can_access_assignment(organization_id, assignment_id))
  or (student_person_id is not null and app_core.can_access_person(organization_id, student_person_id))
);

create policy media_links_write_admin_instructor on app_core.media_links
for all to authenticated using (
  app_core.is_org_admin(organization_id)
  or linked_by_person_id = app_core.current_person_id(organization_id)
) with check (
  app_core.is_org_admin(organization_id)
  or linked_by_person_id = app_core.current_person_id(organization_id)
);

create policy practice_sessions_read_accessible on app_core.practice_sessions
for select to authenticated using (app_core.can_access_person(organization_id, student_person_id));

create policy practice_sessions_student_insert on app_core.practice_sessions
for insert to authenticated with check (
  app_core.is_org_admin(organization_id) or student_person_id = app_core.current_person_id(organization_id)
);

create policy practice_sessions_student_update_own on app_core.practice_sessions
for update to authenticated using (
  app_core.is_org_admin(organization_id) or student_person_id = app_core.current_person_id(organization_id)
) with check (
  app_core.is_org_admin(organization_id) or student_person_id = app_core.current_person_id(organization_id)
);

create policy playlists_read_accessible on app_core.listening_playlists
for select to authenticated using (
  app_core.is_org_admin(organization_id)
  or owner_person_id = app_core.current_person_id(organization_id)
  or visibility = 'organization'
);

create policy playlists_write_member on app_core.listening_playlists
for all to authenticated using (
  app_core.is_org_admin(organization_id) or owner_person_id = app_core.current_person_id(organization_id)
) with check (
  app_core.is_org_admin(organization_id) or owner_person_id = app_core.current_person_id(organization_id)
);

create policy tracks_read_accessible on app_core.listening_tracks
for select to authenticated using (
  app_core.is_org_admin(organization_id)
  or added_by_person_id = app_core.current_person_id(organization_id)
  or (lesson_id is not null and app_core.can_access_lesson(organization_id, lesson_id))
  or (assignment_id is not null and app_core.can_access_assignment(organization_id, assignment_id))
  or exists (
    select 1 from app_core.listening_playlists lp
    where lp.organization_id = listening_tracks.organization_id
      and lp.id = listening_tracks.playlist_id
      and (lp.visibility = 'organization' or lp.owner_person_id = app_core.current_person_id(lp.organization_id))
  )
);

create policy tracks_write_member on app_core.listening_tracks
for all to authenticated using (
  app_core.is_org_admin(organization_id) or added_by_person_id = app_core.current_person_id(organization_id)
) with check (
  app_core.is_org_admin(organization_id) or added_by_person_id = app_core.current_person_id(organization_id)
);

create policy listening_sessions_read_accessible on app_core.listening_sessions
for select to authenticated using (app_core.can_access_person(organization_id, student_person_id));

create policy listening_sessions_student_write on app_core.listening_sessions
for all to authenticated using (
  app_core.is_org_admin(organization_id) or student_person_id = app_core.current_person_id(organization_id)
) with check (
  app_core.is_org_admin(organization_id) or student_person_id = app_core.current_person_id(organization_id)
);

create policy communications_read_audience on app_core.communications
for select to authenticated using (app_core.can_read_communication(organization_id, id));

create policy communications_write_admin_instructor on app_core.communications
for all to authenticated using (
  app_core.is_org_admin(organization_id)
  or sender_person_id = app_core.current_person_id(organization_id)
) with check (
  app_core.is_org_admin(organization_id)
  or sender_person_id = app_core.current_person_id(organization_id)
);

create policy communication_reads_read_own_or_admin on app_core.communication_reads
for select to authenticated using (
  app_core.is_org_admin(organization_id) or person_id = app_core.current_person_id(organization_id)
);

create policy communication_reads_insert_own on app_core.communication_reads
for insert to authenticated with check (
  person_id = app_core.current_person_id(organization_id)
  and app_core.can_read_communication(organization_id, communication_id)
);

create policy communication_reads_delete_own_or_admin on app_core.communication_reads
for delete to authenticated using (
  app_core.is_org_admin(organization_id) or person_id = app_core.current_person_id(organization_id)
);

create policy reward_badges_read_member on app_core.reward_badges
for select to authenticated using (app_core.is_org_member(organization_id));

create policy reward_badges_write_admin on app_core.reward_badges
for all to authenticated using (app_core.is_org_admin(organization_id)) with check (app_core.is_org_admin(organization_id));

create policy person_reward_badges_read_accessible on app_core.person_reward_badges
for select to authenticated using (app_core.can_access_person(organization_id, person_id));

create policy person_reward_badges_write_admin on app_core.person_reward_badges
for all to authenticated using (app_core.is_org_admin(organization_id)) with check (app_core.is_org_admin(organization_id));

-- ============================================================================
-- REVOKE / GRANT STATEMENTS
-- ============================================================================

revoke all on function app_core.is_org_member(uuid) from public;
revoke all on function app_core.is_org_owner(uuid) from public;
revoke all on function app_core.is_org_admin(uuid) from public;
revoke all on function app_core.is_org_owner_or_admin(uuid) from public;
revoke all on function app_core.current_person_id(uuid) from public;
revoke all on function app_core.current_person_has_role(uuid, text) from public;
revoke all on function app_core.can_access_person(uuid, uuid) from public;
revoke all on function app_core.can_access_lesson(uuid, uuid) from public;
revoke all on function app_core.can_access_assignment(uuid, uuid) from public;
revoke all on function app_core.can_read_communication(uuid, uuid) from public;
grant execute on function app_core.is_org_member(uuid) to authenticated;
grant execute on function app_core.is_org_owner(uuid) to authenticated;
grant execute on function app_core.is_org_admin(uuid) to authenticated;
grant execute on function app_core.is_org_owner_or_admin(uuid) to authenticated;
grant execute on function app_core.current_person_id(uuid) to authenticated;
grant execute on function app_core.current_person_has_role(uuid, text) to authenticated;
grant execute on function app_core.can_access_person(uuid, uuid) to authenticated;
grant execute on function app_core.can_access_lesson(uuid, uuid) to authenticated;
grant execute on function app_core.can_access_assignment(uuid, uuid) to authenticated;
grant execute on function app_core.can_read_communication(uuid, uuid) to authenticated;
revoke all on function app_core.create_person_manual(uuid, text, text, text, int, int, jsonb) from public;
revoke all on function app_core.link_auth_user_to_person(uuid, uuid, uuid) from public;
revoke all on function app_core.bootstrap_current_user_as_real_school_owner() from public;
revoke all on function app_core.assign_role(uuid, uuid, text, date, date) from public;
revoke all on function app_core.remove_role(uuid, uuid, text) from public;
revoke all on function app_core.link_parent_child(uuid, uuid, uuid, text) from public;
revoke all on function app_core.resolve_match_candidate(uuid, text, uuid) from public;
revoke all on function app_core.mark_communication_read(uuid, uuid) from public;
revoke all on function app_core.log_practice_session(uuid, uuid, timestamptz, timestamptz, int, int, uuid, uuid, text, int, text) from public;
revoke all on function app_core.log_listening_session(uuid, uuid, timestamptz, timestamptz, int, uuid) from public;
grant execute on function app_core.create_person_manual(uuid, text, text, text, int, int, jsonb) to authenticated;
grant execute on function app_core.link_auth_user_to_person(uuid, uuid, uuid) to authenticated;
grant execute on function app_core.bootstrap_current_user_as_real_school_owner() to authenticated;
grant execute on function app_core.assign_role(uuid, uuid, text, date, date) to authenticated;
grant execute on function app_core.remove_role(uuid, uuid, text) to authenticated;
grant execute on function app_core.link_parent_child(uuid, uuid, uuid, text) to authenticated;
grant execute on function app_core.resolve_match_candidate(uuid, text, uuid) to authenticated;
grant execute on function app_core.mark_communication_read(uuid, uuid) to authenticated;
grant execute on function app_core.log_practice_session(uuid, uuid, timestamptz, timestamptz, int, int, uuid, uuid, text, int, text) to authenticated;
grant execute on function app_core.log_listening_session(uuid, uuid, timestamptz, timestamptz, int, uuid) to authenticated;
grant usage on schema app_core to authenticated;
grant select, insert, update, delete on all tables in schema app_core to authenticated;
alter default privileges in schema app_core grant select, insert, update, delete on tables to authenticated;

commit;
