-- Cadenza / Real School consolidated Supabase migration set
-- Date: 2026-04-30
-- Purpose: additive, production-safe app schema for multi-tenant identity, lesson workflows,
-- practice/listening gamification, communications, media, and legacy attendance import.
--
-- Run in Supabase SQL editor or migrations as a privileged database owner.
-- This migration does not alter or drop existing production tables.

begin;

create schema if not exists app_core;
create schema if not exists app_private;

create extension if not exists pgcrypto;
create extension if not exists citext;

comment on schema app_core is 'Canonical tenant-scoped application data for Cadenza / Real School.';
comment on schema app_private is 'Private helpers, staging tables, normalization, import, and privileged maintenance utilities.';

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function app_private.norm_name(p text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select nullif(lower(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g')), '');
$$;

create or replace function app_private.norm_email(p text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select nullif(lower(trim(coalesce(p, ''))), '');
$$;

create or replace function app_private.norm_phone(p text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '');
$$;

create or replace function app_private.master_attendance_stable_key(
  p_service_date date,
  p_student_name text,
  p_student_email text,
  p_birthday text,
  p_phone_numbers text,
  p_start text,
  p_end text,
  p_instructor_name text,
  p_location text,
  p_room text,
  p_product text,
  p_category text
)
returns text
language sql
immutable
set search_path = pg_catalog, app_private
as $$
  select 'master_attendance_data:lesson:' || md5(concat_ws('|',
    coalesce(p_service_date::text, 'no_date'),
    coalesce(
      app_private.norm_email(p_student_email),
      concat_ws(':',
        'name_only',
        coalesce(app_private.norm_name(p_student_name), 'no_student'),
        coalesce(nullif(lower(regexp_replace(trim(coalesce(p_birthday, '')), '\s+', '', 'g')), ''), 'no_birthday'),
        coalesce(app_private.norm_phone(p_phone_numbers), 'no_phone')
      )
    ),
    coalesce(nullif(lower(regexp_replace(trim(coalesce(p_start, '')), '\s+', '', 'g')), ''), 'no_start'),
    coalesce(nullif(lower(regexp_replace(trim(coalesce(p_end, '')), '\s+', '', 'g')), ''), 'no_end'),
    coalesce(app_private.norm_name(p_instructor_name), 'no_instructor'),
    coalesce(app_private.norm_name(p_location), 'no_location'),
    coalesce(app_private.norm_name(p_room), 'no_room'),
    coalesce(app_private.norm_name(p_product), 'no_product'),
    coalesce(app_private.norm_name(p_category), 'no_category')
  ));
$$;

comment on function app_private.master_attendance_stable_key(
  date, text, text, text, text, text, text, text, text, text, text, text
) is 'Builds a reload-safe natural source key for public.master_attendance_data rows. Does not use the daily identity row id.';

create or replace function app_private.safe_slug(p text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(
    nullif(regexp_replace(lower(trim(coalesce(p, ''))), '[^a-z0-9]+', '-', 'g'), ''),
    'untitled'
  );
$$;

create table if not exists app_core.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  name text not null check (nullif(trim(name), '') is not null),
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

drop trigger if exists trg_organizations_updated_at on app_core.organizations;
create trigger trg_organizations_updated_at
before update on app_core.organizations
for each row execute function app_private.set_updated_at();

insert into app_core.organizations (slug, name, metadata)
values ('real-school', 'Real School', jsonb_build_object('seeded_by', 'consolidated_migration'))
on conflict (slug) do update set
  name = excluded.name,
  metadata = app_core.organizations.metadata || excluded.metadata,
  updated_at = now();

create table if not exists app_core.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_role text not null default 'member' check (org_role in ('owner', 'admin', 'manager', 'employee', 'member')),
  status text not null default 'active' check (status in ('invited', 'active', 'suspended', 'removed')),
  invited_email citext,
  invited_at timestamptz,
  joined_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (organization_id, user_id)
);

drop trigger if exists trg_org_memberships_updated_at on app_core.organization_memberships;
create trigger trg_org_memberships_updated_at
before update on app_core.organization_memberships
for each row execute function app_private.set_updated_at();

create table if not exists app_core.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{1,48}$'),
  label text not null,
  description text,
  created_at timestamptz not null default now()
);

insert into app_core.roles (key, label, description) values
  ('student', 'Student', 'Learner profile'),
  ('parent', 'Parent / Guardian', 'Family member with household access'),
  ('instructor', 'Instructor', 'Teacher with assigned students'),
  ('admin', 'Admin', 'Organization administrator'),
  ('employee', 'Employee', 'Organization employee'),
  ('producer', 'Producer', 'Operational producer/admin support')
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description;

create table if not exists app_core.persons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  display_name text not null check (nullif(trim(display_name), '') is not null),
  first_name text,
  last_name text,
  normalized_name text,
  email citext,
  normalized_email text,
  phone text,
  normalized_phone text,
  birth_month int check (birth_month between 1 and 12),
  birth_year int check (birth_year between 1900 and 2100),
  raw_birthday_text text,
  profile_status text not null default 'active' check (profile_status in ('active', 'inactive', 'archived', 'merged')),
  merged_into_person_id uuid,
  is_curated boolean not null default false,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (organization_id, id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'persons_merged_into_same_org_fk'
      and conrelid = 'app_core.persons'::regclass
  ) then
    alter table app_core.persons
      add constraint persons_merged_into_same_org_fk
      foreign key (organization_id, merged_into_person_id)
      references app_core.persons(organization_id, id);
  end if;
end;
$$;

drop trigger if exists trg_persons_updated_at on app_core.persons;
create trigger trg_persons_updated_at
before update on app_core.persons
for each row execute function app_private.set_updated_at();

create table if not exists app_core.person_auth_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  person_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  identity_status text not null default 'active' check (identity_status in ('active', 'disabled', 'removed')),
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (organization_id, person_id, user_id),
  unique (organization_id, user_id),
  foreign key (organization_id, person_id) references app_core.persons(organization_id, id)
);

drop trigger if exists trg_person_auth_updated_at on app_core.person_auth_identities;
create trigger trg_person_auth_updated_at
before update on app_core.person_auth_identities
for each row execute function app_private.set_updated_at();

create table if not exists app_core.person_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  person_id uuid not null,
  role_id uuid not null references app_core.roles(id),
  effective_start date not null default current_date,
  effective_end date,
  active boolean not null default true,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint person_roles_dates_chk check (effective_end is null or effective_end >= effective_start),
  foreign key (organization_id, person_id) references app_core.persons(organization_id, id)
);

create unique index if not exists uq_active_person_role
on app_core.person_roles (organization_id, person_id, role_id)
where active = true;

drop trigger if exists trg_person_roles_updated_at on app_core.person_roles;
create trigger trg_person_roles_updated_at
before update on app_core.person_roles
for each row execute function app_private.set_updated_at();

create table if not exists app_core.households (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  name text not null check (nullif(trim(name), '') is not null),
  normalized_name text,
  primary_contact_person_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (organization_id, id),
  foreign key (organization_id, primary_contact_person_id) references app_core.persons(organization_id, id)
);

drop trigger if exists trg_households_updated_at on app_core.households;
create trigger trg_households_updated_at
before update on app_core.households
for each row execute function app_private.set_updated_at();

create table if not exists app_core.household_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  household_id uuid not null,
  person_id uuid not null,
  relationship text not null check (relationship in ('student', 'parent', 'guardian', 'adult_student', 'other')),
  is_primary boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (organization_id, household_id, person_id, relationship),
  foreign key (organization_id, household_id) references app_core.households(organization_id, id),
  foreign key (organization_id, person_id) references app_core.persons(organization_id, id)
);

drop trigger if exists trg_household_members_updated_at on app_core.household_members;
create trigger trg_household_members_updated_at
before update on app_core.household_members
for each row execute function app_private.set_updated_at();

create table if not exists app_core.instructor_student_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  instructor_person_id uuid not null,
  student_person_id uuid not null,
  active boolean not null default true,
  effective_start date not null default current_date,
  effective_end date,
  source_identity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint instructor_student_not_same_chk check (instructor_person_id <> student_person_id),
  constraint instructor_student_dates_chk check (effective_end is null or effective_end >= effective_start),
  foreign key (organization_id, instructor_person_id) references app_core.persons(organization_id, id),
  foreign key (organization_id, student_person_id) references app_core.persons(organization_id, id)
);

create unique index if not exists uq_active_instructor_student
on app_core.instructor_student_assignments (organization_id, instructor_person_id, student_person_id)
where active = true;

drop trigger if exists trg_instructor_student_updated_at on app_core.instructor_student_assignments;
create trigger trg_instructor_student_updated_at
before update on app_core.instructor_student_assignments
for each row execute function app_private.set_updated_at();

create table if not exists app_core.source_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  source_type text not null,
  source_record_key text not null,
  source_payload jsonb not null,
  imported_at timestamptz not null default now(),
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, source_type, source_record_key)
);

create table if not exists app_core.source_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  source_type text not null,
  source_identity_type text not null check (source_identity_type in ('student', 'parent', 'guardian', 'instructor', 'employee', 'other')),
  source_identity_key text not null,
  source_display_name text,
  source_email citext,
  source_phone text,
  normalized_name text,
  normalized_email text,
  normalized_phone text,
  person_id uuid,
  confidence numeric(5,4) not null default 0 check (confidence >= 0 and confidence <= 1),
  source_payload jsonb not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, source_type, source_identity_type, source_identity_key),
  foreign key (organization_id, person_id) references app_core.persons(organization_id, id)
);

drop trigger if exists trg_source_identities_updated_at on app_core.source_identities;
create trigger trg_source_identities_updated_at
before update on app_core.source_identities
for each row execute function app_private.set_updated_at();

create table if not exists app_core.source_record_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  source_record_id uuid not null,
  source_identity_id uuid not null,
  role_in_record text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, source_record_id, source_identity_id, role_in_record),
  foreign key (organization_id, source_record_id) references app_core.source_records(organization_id, id),
  foreign key (organization_id, source_identity_id) references app_core.source_identities(organization_id, id)
);

create table if not exists app_core.match_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  source_identity_id uuid not null,
  candidate_person_id uuid,
  candidate_kind text not null default 'possible_duplicate' check (candidate_kind in ('possible_duplicate', 'conflict', 'needs_person', 'merge_review')),
  confidence numeric(5,4) not null default 0 check (confidence >= 0 and confidence <= 1),
  reason text not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'rejected', 'ignored')),
  resolution text,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, source_identity_id) references app_core.source_identities(organization_id, id),
  foreign key (organization_id, candidate_person_id) references app_core.persons(organization_id, id)
);

drop trigger if exists trg_match_candidates_updated_at on app_core.match_candidates;
create trigger trg_match_candidates_updated_at
before update on app_core.match_candidates
for each row execute function app_private.set_updated_at();

create table if not exists app_core.person_contact_points (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  person_id uuid not null,
  contact_type text not null check (contact_type in ('email', 'phone')),
  raw_value text not null,
  normalized_value text not null,
  is_primary boolean not null default false,
  verified_at timestamptz,
  active boolean not null default true,
  source_identity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  foreign key (organization_id, person_id) references app_core.persons(organization_id, id),
  foreign key (organization_id, source_identity_id) references app_core.source_identities(organization_id, id)
);

create unique index if not exists uq_person_contact_value
on app_core.person_contact_points (organization_id, person_id, contact_type, normalized_value)
where active = true;

drop trigger if exists trg_contact_points_updated_at on app_core.person_contact_points;
create trigger trg_contact_points_updated_at
before update on app_core.person_contact_points
for each row execute function app_private.set_updated_at();

create table if not exists app_core.source_identity_link_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  source_identity_id uuid not null,
  previous_person_id uuid,
  new_person_id uuid,
  action text not null check (action in ('linked', 'unlinked', 'relinked', 'rejected')),
  reason text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  foreign key (organization_id, source_identity_id) references app_core.source_identities(organization_id, id),
  foreign key (organization_id, previous_person_id) references app_core.persons(organization_id, id),
  foreign key (organization_id, new_person_id) references app_core.persons(organization_id, id)
);

create table if not exists app_core.person_merge_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  losing_person_id uuid not null,
  winning_person_id uuid not null,
  reason text not null,
  source text not null default 'manual',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  constraint merge_not_self_chk check (losing_person_id <> winning_person_id),
  foreign key (organization_id, losing_person_id) references app_core.persons(organization_id, id),
  foreign key (organization_id, winning_person_id) references app_core.persons(organization_id, id)
);

create table if not exists app_core.lessons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  student_person_id uuid not null,
  instructor_person_id uuid,
  lesson_date date not null,
  title text not null,
  instrument text,
  lesson_type text not null default 'private' check (lesson_type in ('private', 'group', 'makeup', 'trial', 'workshop', 'other')),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled', 'banked', 'no_show')),
  lesson_notes text,
  student_recap text,
  today_practice_plan text,
  source_record_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (organization_id, id),
  foreign key (organization_id, student_person_id) references app_core.persons(organization_id, id),
  foreign key (organization_id, instructor_person_id) references app_core.persons(organization_id, id),
  foreign key (organization_id, source_record_id) references app_core.source_records(organization_id, id)
);

drop trigger if exists trg_lessons_updated_at on app_core.lessons;
create trigger trg_lessons_updated_at
before update on app_core.lessons
for each row execute function app_private.set_updated_at();

create table if not exists app_core.assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  lesson_id uuid not null,
  student_person_id uuid not null,
  instructor_person_id uuid,
  title text not null check (nullif(trim(title), '') is not null),
  description text,
  assignment_type text not null default 'practice' check (assignment_type in ('practice', 'theory', 'performance', 'listening', 'recording', 'other')),
  status text not null default 'assigned' check (status in ('assigned', 'in_progress', 'submitted', 'reviewed', 'completed', 'archived')),
  due_date date,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  xp_reward int not null default 50 check (xp_reward >= 0 and xp_reward <= 10000),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (organization_id, id),
  foreign key (organization_id, lesson_id) references app_core.lessons(organization_id, id),
  foreign key (organization_id, student_person_id) references app_core.persons(organization_id, id),
  foreign key (organization_id, instructor_person_id) references app_core.persons(organization_id, id)
);

drop trigger if exists trg_assignments_updated_at on app_core.assignments;
create trigger trg_assignments_updated_at
before update on app_core.assignments
for each row execute function app_private.set_updated_at();

create table if not exists app_core.student_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  assignment_id uuid not null,
  student_person_id uuid not null,
  submission_type text not null default 'note' check (submission_type in ('note', 'video', 'audio', 'file', 'link')),
  title text,
  body text,
  media_asset_id uuid,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_person_id uuid,
  review_notes text,
  status text not null default 'submitted' check (status in ('submitted', 'reviewed', 'returned', 'archived')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, assignment_id) references app_core.assignments(organization_id, id),
  foreign key (organization_id, student_person_id) references app_core.persons(organization_id, id),
  foreign key (organization_id, reviewed_by_person_id) references app_core.persons(organization_id, id)
);

drop trigger if exists trg_student_submissions_updated_at on app_core.student_submissions;
create trigger trg_student_submissions_updated_at
before update on app_core.student_submissions
for each row execute function app_private.set_updated_at();

create table if not exists app_core.media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  owner_person_id uuid,
  title text not null check (nullif(trim(title), '') is not null),
  description text,
  media_kind text not null check (media_kind in ('video', 'audio', 'image', 'document', 'link')),
  source_kind text not null check (source_kind in ('device_recording', 'local_upload', 'external_url', 'library')),
  external_url text,
  storage_bucket text,
  storage_path text,
  thumbnail_url text,
  duration_seconds int check (duration_seconds is null or duration_seconds >= 0),
  compression_status text not null default 'not_required' check (compression_status in ('not_required', 'queued', 'processing', 'complete', 'failed')),
  visibility text not null default 'private' check (visibility in ('private', 'household', 'assigned_students', 'organization')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (organization_id, id),
  foreign key (organization_id, owner_person_id) references app_core.persons(organization_id, id),
  constraint media_location_chk check (
    external_url is not null or (storage_bucket is not null and storage_path is not null)
  )
);

drop trigger if exists trg_media_assets_updated_at on app_core.media_assets;
create trigger trg_media_assets_updated_at
before update on app_core.media_assets
for each row execute function app_private.set_updated_at();

alter table app_core.student_submissions
  drop constraint if exists student_submissions_media_asset_fk;
alter table app_core.student_submissions
  add constraint student_submissions_media_asset_fk
  foreign key (organization_id, media_asset_id) references app_core.media_assets(organization_id, id);

create table if not exists app_core.media_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  media_asset_id uuid not null,
  lesson_id uuid,
  assignment_id uuid,
  student_person_id uuid,
  linked_by_person_id uuid,
  link_context text not null default 'lesson' check (link_context in ('lesson', 'assignment', 'submission', 'library', 'listening')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  foreign key (organization_id, media_asset_id) references app_core.media_assets(organization_id, id),
  foreign key (organization_id, lesson_id) references app_core.lessons(organization_id, id),
  foreign key (organization_id, assignment_id) references app_core.assignments(organization_id, id),
  foreign key (organization_id, student_person_id) references app_core.persons(organization_id, id),
  foreign key (organization_id, linked_by_person_id) references app_core.persons(organization_id, id)
);

create table if not exists app_core.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  student_person_id uuid not null,
  lesson_id uuid,
  assignment_id uuid,
  started_at timestamptz not null,
  ended_at timestamptz,
  active_seconds int not null default 0 check (active_seconds >= 0),
  detected_seconds int not null default 0 check (detected_seconds >= 0),
  detection_mode text not null default 'audio_activity' check (detection_mode in ('manual', 'audio_activity', 'music_detection')),
  detection_summary jsonb not null default '{}',
  student_notes text,
  rating int check (rating between 1 and 5),
  xp_awarded int not null default 0 check (xp_awarded >= 0),
  status text not null default 'open' check (status in ('open', 'saved', 'discarded', 'reviewed')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (organization_id, id),
  foreign key (organization_id, student_person_id) references app_core.persons(organization_id, id),
  foreign key (organization_id, lesson_id) references app_core.lessons(organization_id, id),
  foreign key (organization_id, assignment_id) references app_core.assignments(organization_id, id)
);

drop trigger if exists trg_practice_sessions_updated_at on app_core.practice_sessions;
create trigger trg_practice_sessions_updated_at
before update on app_core.practice_sessions
for each row execute function app_private.set_updated_at();

create table if not exists app_core.listening_playlists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  owner_person_id uuid,
  title text not null check (nullif(trim(title), '') is not null),
  description text,
  visibility text not null default 'private' check (visibility in ('private', 'household', 'assigned_students', 'organization')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (organization_id, id),
  foreign key (organization_id, owner_person_id) references app_core.persons(organization_id, id)
);

drop trigger if exists trg_listening_playlists_updated_at on app_core.listening_playlists;
create trigger trg_listening_playlists_updated_at
before update on app_core.listening_playlists
for each row execute function app_private.set_updated_at();

create table if not exists app_core.listening_tracks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  playlist_id uuid,
  added_by_person_id uuid,
  lesson_id uuid,
  assignment_id uuid,
  title text not null check (nullif(trim(title), '') is not null),
  artist text,
  external_url text not null,
  provider text not null default 'url' check (provider in ('youtube', 'spotify', 'apple_music', 'soundcloud', 'url', 'other')),
  thumbnail_url text,
  duration_seconds int check (duration_seconds is null or duration_seconds >= 0),
  is_recent boolean not null default true,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (organization_id, id),
  foreign key (organization_id, playlist_id) references app_core.listening_playlists(organization_id, id),
  foreign key (organization_id, added_by_person_id) references app_core.persons(organization_id, id),
  foreign key (organization_id, lesson_id) references app_core.lessons(organization_id, id),
  foreign key (organization_id, assignment_id) references app_core.assignments(organization_id, id)
);

drop trigger if exists trg_listening_tracks_updated_at on app_core.listening_tracks;
create trigger trg_listening_tracks_updated_at
before update on app_core.listening_tracks
for each row execute function app_private.set_updated_at();

create table if not exists app_core.listening_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  student_person_id uuid not null,
  track_id uuid,
  started_at timestamptz not null,
  ended_at timestamptz,
  listened_seconds int not null default 0 check (listened_seconds >= 0),
  xp_awarded int not null default 0 check (xp_awarded >= 0),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (organization_id, id),
  foreign key (organization_id, student_person_id) references app_core.persons(organization_id, id),
  foreign key (organization_id, track_id) references app_core.listening_tracks(organization_id, id)
);

drop trigger if exists trg_listening_sessions_updated_at on app_core.listening_sessions;
create trigger trg_listening_sessions_updated_at
before update on app_core.listening_sessions
for each row execute function app_private.set_updated_at();

create table if not exists app_core.communications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  sender_person_id uuid,
  audience_scope text not null check (audience_scope in ('organization', 'role', 'household', 'person', 'lesson', 'assignment')),
  audience_role text,
  household_id uuid,
  recipient_person_id uuid,
  lesson_id uuid,
  assignment_id uuid,
  channel text not null default 'in_app' check (channel in ('in_app', 'email', 'sms', 'push')),
  message_type text not null default 'instructor' check (message_type in ('internal', 'external', 'instructor', 'school', 'app_update')),
  title text not null check (nullif(trim(title), '') is not null),
  body text not null check (nullif(trim(body), '') is not null),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (organization_id, id),
  foreign key (organization_id, sender_person_id) references app_core.persons(organization_id, id),
  foreign key (organization_id, household_id) references app_core.households(organization_id, id),
  foreign key (organization_id, recipient_person_id) references app_core.persons(organization_id, id),
  foreign key (organization_id, lesson_id) references app_core.lessons(organization_id, id),
  foreign key (organization_id, assignment_id) references app_core.assignments(organization_id, id)
);

drop trigger if exists trg_communications_updated_at on app_core.communications;
create trigger trg_communications_updated_at
before update on app_core.communications
for each row execute function app_private.set_updated_at();

create table if not exists app_core.communication_reads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  communication_id uuid not null,
  person_id uuid not null,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, communication_id, person_id),
  foreign key (organization_id, communication_id) references app_core.communications(organization_id, id),
  foreign key (organization_id, person_id) references app_core.persons(organization_id, id)
);

create table if not exists app_core.reward_badges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  badge_key text not null,
  label text not null,
  description text,
  badge_type text not null check (badge_type in ('practice', 'listening', 'streak', 'assignment', 'lesson', 'custom')),
  icon text,
  xp_value int not null default 0 check (xp_value >= 0),
  criteria jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (organization_id, id),
  unique (organization_id, badge_key)
);

drop trigger if exists trg_reward_badges_updated_at on app_core.reward_badges;
create trigger trg_reward_badges_updated_at
before update on app_core.reward_badges
for each row execute function app_private.set_updated_at();

create table if not exists app_core.person_reward_badges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  person_id uuid not null,
  badge_id uuid not null,
  awarded_at timestamptz not null default now(),
  awarded_by uuid references auth.users(id),
  metadata jsonb not null default '{}',
  unique (organization_id, person_id, badge_id),
  foreign key (organization_id, person_id) references app_core.persons(organization_id, id),
  foreign key (organization_id, badge_id) references app_core.reward_badges(organization_id, id)
);

create table if not exists app_private.master_attendance_stage (
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  source_record_key text not null,
  source_payload jsonb not null,
  legacy_id bigint,
  service_date date,
  banked_dates_raw text,
  week_day text,
  student_name text,
  student_norm_name text,
  student_email text,
  student_norm_email text,
  student_phone text,
  student_norm_phone text,
  primary_name text,
  primary_norm_name text,
  primary_email text,
  primary_norm_email text,
  instructor_name text,
  instructor_norm_name text,
  birthday_raw text,
  birth_month int,
  birth_year int,
  start_raw text,
  end_raw text,
  start_time time,
  end_time time,
  lesson_notes text,
  location text,
  room text,
  status text,
  description text,
  category text,
  product text,
  revenue_per_visit_raw text,
  revenue_per_visit_numeric numeric,
  staged_at timestamptz not null default now(),
  primary key (organization_id, source_record_key)
);

create index if not exists idx_org_memberships_user_status
on app_core.organization_memberships (user_id, status);
create index if not exists idx_org_memberships_org_user_status_role
on app_core.organization_memberships (organization_id, user_id, status, org_role);
create index if not exists idx_persons_org_name
on app_core.persons (organization_id, normalized_name);
create index if not exists idx_persons_org_email
on app_core.persons (organization_id, normalized_email);
create index if not exists idx_persons_org_phone
on app_core.persons (organization_id, normalized_phone);
create index if not exists idx_person_auth_org_user_active
on app_core.person_auth_identities (organization_id, user_id, identity_status);
create index if not exists idx_person_roles_active_person
on app_core.person_roles (organization_id, person_id, active, effective_end);
create index if not exists idx_household_members_person
on app_core.household_members (organization_id, person_id, active);
create index if not exists idx_household_members_household
on app_core.household_members (organization_id, household_id, active);
create index if not exists idx_isa_org_instructor_active
on app_core.instructor_student_assignments (organization_id, instructor_person_id, active, effective_end);
create index if not exists idx_isa_org_student_active
on app_core.instructor_student_assignments (organization_id, student_person_id, active, effective_end);
create index if not exists idx_source_records_import
on app_core.source_records (organization_id, source_type, imported_at desc);
create index if not exists idx_source_identities_person
on app_core.source_identities (organization_id, person_id);
create index if not exists idx_source_identities_match_email
on app_core.source_identities (organization_id, normalized_email) where normalized_email is not null;
create index if not exists idx_source_identities_match_name
on app_core.source_identities (organization_id, normalized_name) where normalized_name is not null;
create index if not exists idx_match_candidates_open
on app_core.match_candidates (organization_id, status, candidate_kind);
create unique index if not exists uq_open_match_candidates_dedupe
on app_core.match_candidates (
  organization_id,
  source_identity_id,
  coalesce(candidate_person_id, '00000000-0000-0000-0000-000000000000'::uuid),
  candidate_kind
)
where status = 'open';
create index if not exists idx_contact_points_lookup
on app_core.person_contact_points (organization_id, contact_type, normalized_value, active);
create index if not exists idx_lessons_student_date
on app_core.lessons (organization_id, student_person_id, lesson_date desc);
create index if not exists idx_lessons_instructor_date
on app_core.lessons (organization_id, instructor_person_id, lesson_date desc);
create unique index if not exists uq_lessons_source_record
on app_core.lessons (organization_id, source_record_id)
where source_record_id is not null;
create index if not exists idx_assignments_student_status
on app_core.assignments (organization_id, student_person_id, status, due_date);
create index if not exists idx_media_links_lesson
on app_core.media_links (organization_id, lesson_id);
create index if not exists idx_media_links_assignment
on app_core.media_links (organization_id, assignment_id);
create index if not exists idx_practice_sessions_student_started
on app_core.practice_sessions (organization_id, student_person_id, started_at desc);
create index if not exists idx_listening_sessions_student_started
on app_core.listening_sessions (organization_id, student_person_id, started_at desc);
create index if not exists idx_listening_tracks_recent
on app_core.listening_tracks (organization_id, created_at desc);
create index if not exists idx_communications_scope
on app_core.communications (organization_id, audience_scope, published_at desc);
create index if not exists idx_communication_reads_person
on app_core.communication_reads (organization_id, person_id, communication_id);
create index if not exists idx_reward_badges_type
on app_core.reward_badges (organization_id, badge_type, active);

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

-- Force RLS on all tenant-owned/sensitive app_core tables so table-owner access is still policy-aware.
-- Supabase service_role / BYPASSRLS roles still bypass RLS for controlled backend maintenance.
alter table app_core.organizations force row level security;
alter table app_core.organization_memberships force row level security;
alter table app_core.persons force row level security;
alter table app_core.person_auth_identities force row level security;
alter table app_core.person_roles force row level security;
alter table app_core.households force row level security;
alter table app_core.household_members force row level security;
alter table app_core.instructor_student_assignments force row level security;
alter table app_core.source_records force row level security;
alter table app_core.source_identities force row level security;
alter table app_core.source_record_identities force row level security;
alter table app_core.match_candidates force row level security;
alter table app_core.person_contact_points force row level security;
alter table app_core.source_identity_link_events force row level security;
alter table app_core.person_merge_events force row level security;
alter table app_core.lessons force row level security;
alter table app_core.assignments force row level security;
alter table app_core.student_submissions force row level security;
alter table app_core.media_assets force row level security;
alter table app_core.media_links force row level security;
alter table app_core.practice_sessions force row level security;
alter table app_core.listening_playlists force row level security;
alter table app_core.listening_tracks force row level security;
alter table app_core.listening_sessions force row level security;
alter table app_core.communications force row level security;
alter table app_core.communication_reads force row level security;
alter table app_core.reward_badges force row level security;
alter table app_core.person_reward_badges force row level security;

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
