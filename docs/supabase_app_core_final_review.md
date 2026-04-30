# Cadenza / Real School Supabase App Core Blueprint

Status: final review draft  
Date: 2026-04-30  
Scope: additive Supabase/Postgres architecture for a new multi-tenant app layer using existing `public.master_attendance_data` as one legacy source adapter.

## Production Safety Principles

- Additive only. No `drop`, `alter type`, rename, or destructive change to legacy production tables.
- Legacy source table remains read-only for this app layer.
- All tenant-owned tables live in `app_core` and include `organization_id`.
- Import staging/helper logic lives in `app_private`.
- Raw source payloads and source identity mappings are admin-only because they contain broad PII.
- Automatic matching is conservative. Email matches may link; name-only matches go to review.
- Canonical person records are source-agnostic; attendance data is only one adapter.

---

## Migration 001: Schemas, Extension, Trigger Helpers

```sql
create schema if not exists app_core;
create schema if not exists app_private;

create extension if not exists pgcrypto;

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

comment on schema app_core is 'Canonical tenant-scoped application data for Cadenza / Real School.';
comment on schema app_private is 'Private helper, staging, normalization, and import utilities.';
```

---

## Migration 002: Core Tables

```sql
create table if not exists app_core.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create trigger trg_organizations_updated_at
before update on app_core.organizations
for each row execute function app_private.set_updated_at();

create table if not exists app_core.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_role text not null default 'member' check (org_role in ('owner','admin','manager','employee','member')),
  status text not null default 'active' check (status in ('invited','active','suspended','removed')),
  invited_email text,
  invited_at timestamptz,
  joined_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (organization_id, user_id)
);

create trigger trg_org_memberships_updated_at
before update on app_core.organization_memberships
for each row execute function app_private.set_updated_at();

create table if not exists app_core.persons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  display_name text not null,
  first_name text,
  last_name text,
  normalized_name text,
  email text,
  normalized_email text,
  phone text,
  normalized_phone text,
  birth_month int check (birth_month between 1 and 12),
  birth_year int check (birth_year between 1900 and 2100),
  raw_birthday_text text,
  profile_status text not null default 'active' check (profile_status in ('active','inactive','archived','merged')),
  merged_into_person_id uuid,
  is_curated boolean not null default false,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (organization_id, id),
  unique (organization_id, normalized_email),
  constraint persons_display_name_chk check (nullif(trim(display_name),'') is not null)
);

alter table app_core.persons
add constraint persons_merged_into_same_org_fk
foreign key (organization_id, merged_into_person_id)
references app_core.persons(organization_id, id);

create trigger trg_persons_updated_at
before update on app_core.persons
for each row execute function app_private.set_updated_at();

create table if not exists app_core.person_auth_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  person_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  identity_status text not null default 'active' check (identity_status in ('active','disabled','removed')),
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (organization_id, person_id, user_id),
  unique (organization_id, user_id),
  foreign key (organization_id, person_id) references app_core.persons(organization_id, id)
);

create trigger trg_person_auth_updated_at
before update on app_core.person_auth_identities
for each row execute function app_private.set_updated_at();

create table if not exists app_core.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  description text,
  created_at timestamptz not null default now()
);

insert into app_core.roles(key, label, description) values
  ('student','Student','Learner profile'),
  ('parent','Parent / Guardian','Family member with household access'),
  ('instructor','Instructor','Teacher with assigned students'),
  ('admin','Admin','Organization administrator'),
  ('employee','Employee','Organization employee'),
  ('producer','Producer','Operational producer/admin support')
on conflict (key) do nothing;

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
on app_core.person_roles(organization_id, person_id, role_id)
where active = true;

create trigger trg_person_roles_updated_at
before update on app_core.person_roles
for each row execute function app_private.set_updated_at();

create table if not exists app_core.households (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  name text not null,
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

create trigger trg_households_updated_at
before update on app_core.households
for each row execute function app_private.set_updated_at();

create table if not exists app_core.household_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  household_id uuid not null,
  person_id uuid not null,
  relationship text not null check (relationship in ('student','parent','guardian','adult_student','other')),
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
on app_core.instructor_student_assignments(organization_id, instructor_person_id, student_person_id)
where active = true;

create trigger trg_instructor_student_updated_at
before update on app_core.instructor_student_assignments
for each row execute function app_private.set_updated_at();
```

---

## Migration 003: Source Lineage, Matching, Contacts, Audit

```sql
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
  source_identity_type text not null check (source_identity_type in ('student','parent','guardian','instructor','employee','other')),
  source_identity_key text not null,
  source_display_name text,
  source_email text,
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
  candidate_kind text not null default 'possible_duplicate' check (candidate_kind in ('possible_duplicate','conflict','needs_person','merge_review')),
  confidence numeric(5,4) not null default 0 check (confidence >= 0 and confidence <= 1),
  reason text not null,
  status text not null default 'open' check (status in ('open','resolved','rejected','ignored')),
  resolution text,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, source_identity_id) references app_core.source_identities(organization_id, id),
  foreign key (organization_id, candidate_person_id) references app_core.persons(organization_id, id)
);

create trigger trg_match_candidates_updated_at
before update on app_core.match_candidates
for each row execute function app_private.set_updated_at();

create table if not exists app_core.person_contact_points (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  person_id uuid not null,
  contact_type text not null check (contact_type in ('email','phone')),
  raw_value text not null,
  normalized_value text not null,
  is_primary boolean not null default false,
  verified_at timestamptz,
  active boolean not null default true,
  source_identity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, person_id) references app_core.persons(organization_id, id),
  foreign key (organization_id, source_identity_id) references app_core.source_identities(organization_id, id)
);

create unique index if not exists uq_active_contact_per_org
on app_core.person_contact_points(organization_id, contact_type, normalized_value)
where active = true;

create trigger trg_contact_points_updated_at
before update on app_core.person_contact_points
for each row execute function app_private.set_updated_at();

create table if not exists app_core.source_identity_link_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  source_identity_id uuid not null,
  previous_person_id uuid,
  new_person_id uuid,
  action text not null check (action in ('linked','unlinked','relinked','rejected')),
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
```

---

## Migration 004: Indexes

```sql
create index if not exists idx_org_memberships_user_status
on app_core.organization_memberships(user_id, status);

create index if not exists idx_org_memberships_org_user_status_role
on app_core.organization_memberships(organization_id, user_id, status, org_role);

create index if not exists idx_persons_org_name
on app_core.persons(organization_id, normalized_name);

create index if not exists idx_persons_org_phone
on app_core.persons(organization_id, normalized_phone);

create index if not exists idx_persons_profile_status
on app_core.persons(organization_id, profile_status);

create index if not exists idx_person_auth_org_user_active
on app_core.person_auth_identities(organization_id, user_id, identity_status);

create index if not exists idx_person_roles_active_person
on app_core.person_roles(organization_id, person_id, active, effective_end);

create index if not exists idx_person_roles_role
on app_core.person_roles(organization_id, role_id, active);

create index if not exists idx_households_org_name
on app_core.households(organization_id, normalized_name);

create index if not exists idx_household_members_person
on app_core.household_members(organization_id, person_id, active);

create index if not exists idx_household_members_org_household_active
on app_core.household_members(organization_id, household_id, active);

create index if not exists idx_isa_org_instructor_active
on app_core.instructor_student_assignments(organization_id, instructor_person_id, active);

create index if not exists idx_isa_org_student_active
on app_core.instructor_student_assignments(organization_id, student_person_id, active);

create index if not exists idx_source_records_import
on app_core.source_records(organization_id, source_type, imported_at desc);

create index if not exists idx_source_identities_person
on app_core.source_identities(organization_id, person_id);

create index if not exists idx_source_identities_match_email
on app_core.source_identities(organization_id, normalized_email)
where normalized_email is not null;

create index if not exists idx_source_identities_match_name
on app_core.source_identities(organization_id, normalized_name)
where normalized_name is not null;

create index if not exists idx_source_identities_unlinked
on app_core.source_identities(organization_id, source_type, source_identity_type)
where person_id is null;

create index if not exists idx_match_candidates_open
on app_core.match_candidates(organization_id, status, candidate_kind);

create index if not exists idx_match_candidates_source
on app_core.match_candidates(organization_id, source_identity_id, status);

create index if not exists idx_contact_points_person
on app_core.person_contact_points(organization_id, person_id, active);
```

---

## Migration 005: RLS Helper Functions

```sql
create or replace function app_core.is_org_member(p_org uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, app_core, public
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

create or replace function app_core.is_org_admin(p_org uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, app_core, public
stable
as $$
  select exists (
    select 1
    from app_core.organization_memberships om
    where om.organization_id = p_org
      and om.user_id = auth.uid()
      and om.status = 'active'
      and om.org_role in ('owner','admin','manager')
  );
$$;

create or replace function app_core.is_org_owner_or_admin(p_org uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, app_core, public
stable
as $$
  select exists (
    select 1
    from app_core.organization_memberships om
    where om.organization_id = p_org
      and om.user_id = auth.uid()
      and om.status = 'active'
      and om.org_role in ('owner','admin')
  );
$$;

create or replace function app_core.current_person_id(p_org uuid)
returns uuid
language sql
security definer
set search_path = pg_catalog, app_core, public
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
set search_path = pg_catalog, app_core, public
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
set search_path = pg_catalog, app_core, public
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
        and hm_self.relationship in ('parent','guardian','adult_student')
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

revoke all on function app_core.is_org_member(uuid) from public;
revoke all on function app_core.is_org_admin(uuid) from public;
revoke all on function app_core.is_org_owner_or_admin(uuid) from public;
revoke all on function app_core.current_person_id(uuid) from public;
revoke all on function app_core.current_person_has_role(uuid, text) from public;
revoke all on function app_core.can_access_person(uuid, uuid) from public;

grant execute on function app_core.is_org_member(uuid) to authenticated;
grant execute on function app_core.is_org_admin(uuid) to authenticated;
grant execute on function app_core.is_org_owner_or_admin(uuid) to authenticated;
grant execute on function app_core.current_person_id(uuid) to authenticated;
grant execute on function app_core.current_person_has_role(uuid, text) to authenticated;
grant execute on function app_core.can_access_person(uuid, uuid) to authenticated;
```

---

## Migration 006: RLS Policies

```sql
alter table app_core.organizations enable row level security;
alter table app_core.organization_memberships enable row level security;
alter table app_core.persons enable row level security;
alter table app_core.person_auth_identities enable row level security;
alter table app_core.roles enable row level security;
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

create policy orgs_read_member
on app_core.organizations
for select
to authenticated
using (app_core.is_org_member(id));

create policy organizations_admin_update
on app_core.organizations
for update
to authenticated
using (app_core.is_org_admin(id))
with check (app_core.is_org_admin(id));

create policy memberships_read_self_or_admin
on app_core.organization_memberships
for select
to authenticated
using (user_id = auth.uid() or app_core.is_org_admin(organization_id));

create policy memberships_admin_write
on app_core.organization_memberships
for all
to authenticated
using (app_core.is_org_admin(organization_id))
with check (app_core.is_org_admin(organization_id));

create policy persons_read_authorized
on app_core.persons
for select
to authenticated
using (app_core.can_access_person(organization_id, id));

create policy persons_write_admin
on app_core.persons
for all
to authenticated
using (app_core.is_org_admin(organization_id))
with check (app_core.is_org_admin(organization_id));

create policy person_auth_read_self_or_admin
on app_core.person_auth_identities
for select
to authenticated
using (user_id = auth.uid() or app_core.is_org_admin(organization_id));

create policy roles_read_authenticated
on app_core.roles
for select
to authenticated
using (auth.uid() is not null);

create policy person_roles_read_accessible
on app_core.person_roles
for select
to authenticated
using (app_core.is_org_admin(organization_id) or app_core.can_access_person(organization_id, person_id));

create policy person_roles_write_admin
on app_core.person_roles
for all
to authenticated
using (app_core.is_org_admin(organization_id))
with check (app_core.is_org_admin(organization_id));

create policy households_read_member_access
on app_core.households
for select
to authenticated
using (
  app_core.is_org_admin(organization_id)
  or exists (
    select 1
    from app_core.household_members hm
    where hm.household_id = households.id
      and hm.organization_id = households.organization_id
      and app_core.can_access_person(hm.organization_id, hm.person_id)
  )
);

create policy household_members_read_access
on app_core.household_members
for select
to authenticated
using (app_core.is_org_admin(organization_id) or app_core.can_access_person(organization_id, person_id));

create policy household_members_write_admin
on app_core.household_members
for all
to authenticated
using (app_core.is_org_admin(organization_id))
with check (app_core.is_org_admin(organization_id));

create policy instructor_assignments_read_access
on app_core.instructor_student_assignments
for select
to authenticated
using (
  app_core.is_org_admin(organization_id)
  or instructor_person_id = app_core.current_person_id(organization_id)
  or app_core.can_access_person(organization_id, student_person_id)
);

create policy instructor_assignments_write_admin
on app_core.instructor_student_assignments
for all
to authenticated
using (app_core.is_org_admin(organization_id))
with check (app_core.is_org_admin(organization_id));

create policy contact_points_read_accessible
on app_core.person_contact_points
for select
to authenticated
using (app_core.is_org_admin(organization_id) or app_core.can_access_person(organization_id, person_id));

create policy contact_points_write_admin
on app_core.person_contact_points
for all
to authenticated
using (app_core.is_org_admin(organization_id))
with check (app_core.is_org_admin(organization_id));

create policy source_records_owner_admin_only
on app_core.source_records
for all
to authenticated
using (app_core.is_org_owner_or_admin(organization_id))
with check (app_core.is_org_owner_or_admin(organization_id));

create policy source_identities_owner_admin_only
on app_core.source_identities
for all
to authenticated
using (app_core.is_org_owner_or_admin(organization_id))
with check (app_core.is_org_owner_or_admin(organization_id));

create policy source_record_identities_owner_admin_only
on app_core.source_record_identities
for all
to authenticated
using (app_core.is_org_owner_or_admin(organization_id))
with check (app_core.is_org_owner_or_admin(organization_id));

create policy match_candidates_owner_admin_only
on app_core.match_candidates
for all
to authenticated
using (app_core.is_org_owner_or_admin(organization_id))
with check (app_core.is_org_owner_or_admin(organization_id));

create policy source_link_events_owner_admin_only
on app_core.source_identity_link_events
for all
to authenticated
using (app_core.is_org_owner_or_admin(organization_id))
with check (app_core.is_org_owner_or_admin(organization_id));

create policy merge_events_owner_admin_only
on app_core.person_merge_events
for all
to authenticated
using (app_core.is_org_owner_or_admin(organization_id))
with check (app_core.is_org_owner_or_admin(organization_id));
```

---

## Migration 007: Hardened RPCs

```sql
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
set search_path = pg_catalog, app_core, public
as $$
declare
  v_person_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not app_core.is_org_admin(p_organization_id) then raise exception 'not authorized'; end if;
  if nullif(trim(p_display_name),'') is null then raise exception 'display_name required'; end if;

  insert into app_core.persons (
    organization_id, display_name, normalized_name, email, normalized_email,
    phone, normalized_phone, birth_month, birth_year, is_curated, metadata,
    created_by, updated_by
  )
  values (
    p_organization_id,
    trim(p_display_name),
    lower(regexp_replace(trim(p_display_name), '\s+', ' ', 'g')),
    nullif(trim(coalesce(p_email,'')),''),
    lower(nullif(trim(coalesce(p_email,'')),'')),
    nullif(trim(coalesce(p_phone,'')),''),
    nullif(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'),''),
    p_birth_month,
    p_birth_year,
    true,
    coalesce(p_metadata, '{}'),
    auth.uid(),
    auth.uid()
  )
  returning id into v_person_id;

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
set search_path = pg_catalog, app_core, public
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
set search_path = pg_catalog, app_core, public
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

  if v_id is not null then return v_id; end if;

  insert into app_core.person_roles (
    organization_id, person_id, role_id, effective_start, effective_end, active, created_by, updated_by
  )
  values (
    p_organization_id, p_person_id, v_role_id, coalesce(p_effective_start,current_date), p_effective_end, true, auth.uid(), auth.uid()
  )
  returning id into v_id;

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
set search_path = pg_catalog, app_core, public
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
set search_path = pg_catalog, app_core, public
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

  insert into app_core.households (
    organization_id, name, normalized_name, primary_contact_person_id, created_by, updated_by
  )
  values (
    p_organization_id,
    coalesce(nullif(trim(p_household_name),''), 'Household'),
    lower(coalesce(nullif(trim(p_household_name),''), 'household')),
    p_parent_person_id,
    auth.uid(),
    auth.uid()
  )
  returning id into v_household_id;

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
set search_path = pg_catalog, app_core, public
as $$
declare
  v_org uuid;
  v_source_identity uuid;
  v_previous_person uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select mc.organization_id, mc.source_identity_id, si.person_id
  into v_org, v_source_identity, v_previous_person
  from app_core.match_candidates mc
  join app_core.source_identities si
    on si.organization_id = mc.organization_id
   and si.id = mc.source_identity_id
  where mc.id = p_candidate_id;

  if v_org is null then raise exception 'candidate not found'; end if;
  if not app_core.is_org_owner_or_admin(v_org) then raise exception 'not authorized'; end if;

  if p_person_id is not null and not exists (
    select 1 from app_core.persons where organization_id = v_org and id = p_person_id
  ) then
    raise exception 'person not found in organization';
  end if;

  update app_core.match_candidates
  set status = 'resolved',
      resolution = p_resolution,
      candidate_person_id = coalesce(p_person_id, candidate_person_id),
      resolved_by = auth.uid(),
      resolved_at = now(),
      updated_at = now()
  where id = p_candidate_id;

  if p_resolution in ('link_to_person','merge') and p_person_id is not null then
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

revoke all on function app_core.create_person_manual(uuid,text,text,text,int,int,jsonb) from public;
revoke all on function app_core.link_auth_user_to_person(uuid,uuid,uuid) from public;
revoke all on function app_core.assign_role(uuid,uuid,text,date,date) from public;
revoke all on function app_core.remove_role(uuid,uuid,text) from public;
revoke all on function app_core.link_parent_child(uuid,uuid,uuid,text) from public;
revoke all on function app_core.resolve_match_candidate(uuid,text,uuid) from public;

grant execute on function app_core.create_person_manual(uuid,text,text,text,int,int,jsonb) to authenticated;
grant execute on function app_core.link_auth_user_to_person(uuid,uuid,uuid) to authenticated;
grant execute on function app_core.assign_role(uuid,uuid,text,date,date) to authenticated;
grant execute on function app_core.remove_role(uuid,uuid,text) to authenticated;
grant execute on function app_core.link_parent_child(uuid,uuid,uuid,text) to authenticated;
grant execute on function app_core.resolve_match_candidate(uuid,text,uuid) to authenticated;
```

Example `supabase-js`:

```ts
await supabase.rpc("create_person_manual", {
  p_organization_id: orgId,
  p_display_name: "Alex Rivera",
  p_email: "alex@example.com",
  p_phone: "555-555-1212",
  p_birth_month: 4,
  p_birth_year: 2011,
  p_metadata: { source: "manual" },
});

await supabase.rpc("link_auth_user_to_person", {
  p_organization_id: orgId,
  p_person_id: personId,
  p_user_id: authUserId,
});

await supabase.rpc("assign_role", {
  p_organization_id: orgId,
  p_person_id: personId,
  p_role_key: "student",
});

await supabase.rpc("remove_role", {
  p_organization_id: orgId,
  p_person_id: personId,
  p_role_key: "student",
});

await supabase.rpc("link_parent_child", {
  p_organization_id: orgId,
  p_parent_person_id: parentPersonId,
  p_child_person_id: studentPersonId,
  p_household_name: "Rivera Household",
});

await supabase.rpc("resolve_match_candidate", {
  p_candidate_id: candidateId,
  p_resolution: "link_to_person",
  p_person_id: personId,
});
```

---

## Migration 008: Import Staging and Normalization

```sql
create or replace function app_private.norm_name(p text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select nullif(lower(regexp_replace(trim(coalesce(p,'')), '\s+', ' ', 'g')), '');
$$;

create or replace function app_private.norm_email(p text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select nullif(lower(trim(coalesce(p,''))), '';
$$;

create or replace function app_private.norm_phone(p text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select nullif(regexp_replace(coalesce(p,''), '\D', '', 'g'), '');
$$;

create table if not exists app_private.master_attendance_stage (
  organization_id uuid not null,
  source_record_key text not null,
  source_payload jsonb not null,
  legacy_id bigint,
  service_date date,
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
  revenue_per_visit_raw text,
  revenue_per_visit_numeric numeric,
  staged_at timestamptz not null default now(),
  primary key (organization_id, source_record_key)
);
```

---

## Backfill Job: `master_attendance_data`

Replace `real-school` with the production organization slug after seeding `app_core.organizations`.

```sql
with current_org as (
  select id as organization_id
  from app_core.organizations
  where slug = 'real-school'
)
insert into app_private.master_attendance_stage (
  organization_id, source_record_key, source_payload, legacy_id, service_date,
  student_name, student_norm_name, student_email, student_norm_email, student_phone, student_norm_phone,
  primary_name, primary_norm_name, primary_email, primary_norm_email,
  instructor_name, instructor_norm_name, birthday_raw, birth_month, birth_year,
  start_raw, end_raw, start_time, end_time, revenue_per_visit_raw, revenue_per_visit_numeric
)
select
  o.organization_id,
  'master_attendance_data:' || m.id::text,
  to_jsonb(m),
  m.id,
  m.date,
  nullif(trim(m.student_name),''),
  app_private.norm_name(m.student_name),
  nullif(trim(m.student_email),''),
  app_private.norm_email(m.student_email),
  nullif(trim(m.phone_numbers),''),
  app_private.norm_phone(m.phone_numbers),
  nullif(trim(m.primary_name),''),
  app_private.norm_name(m.primary_name),
  nullif(trim(m.primary_email),''),
  app_private.norm_email(m.primary_email),
  nullif(trim(m.instructor_name),''),
  app_private.norm_name(m.instructor_name),
  nullif(trim(m.birthday),''),
  case
    when m.birthday ~ '^\d{1,2}/\d{4}$'
     and split_part(m.birthday,'/',1)::int between 1 and 12
    then split_part(m.birthday,'/',1)::int
  end,
  case
    when m.birthday ~ '^\d{1,2}/\d{4}$'
    then split_part(m.birthday,'/',2)::int
  end,
  m.start,
  m.end,
  case when lower(trim(m.start)) ~ '^\d{1,2}:\d{2}\s*(am|pm)$'
    then to_timestamp(lower(trim(m.start)), 'HH12:MIPM')::time
  end,
  case when lower(trim(m.end)) ~ '^\d{1,2}:\d{2}\s*(am|pm)$'
    then to_timestamp(lower(trim(m.end)), 'HH12:MIPM')::time
  end,
  m.revenue_per_visit,
  case
    when nullif(regexp_replace(coalesce(m.revenue_per_visit,''), '[^0-9.]', '', 'g'), '') ~ '^\d+(\.\d+)?$'
    then nullif(regexp_replace(coalesce(m.revenue_per_visit,''), '[^0-9.]', '', 'g'), '')::numeric
    else null
  end
from public.master_attendance_data m
cross join current_org o
on conflict (organization_id, source_record_key)
do update set
  source_payload = excluded.source_payload,
  service_date = excluded.service_date,
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
  revenue_per_visit_raw = excluded.revenue_per_visit_raw,
  revenue_per_visit_numeric = excluded.revenue_per_visit_numeric,
  staged_at = now();

insert into app_core.source_records (organization_id, source_type, source_record_key, source_payload)
select organization_id, 'master_attendance_data', source_record_key, source_payload
from app_private.master_attendance_stage
on conflict (organization_id, source_type, source_record_key)
do update set source_payload = excluded.source_payload, imported_at = now();
```

Source identity upserts:

```sql
insert into app_core.source_identities (
  organization_id, source_type, source_identity_type, source_identity_key,
  source_display_name, source_email, source_phone,
  normalized_name, normalized_email, normalized_phone, source_payload, last_seen_at
)
select distinct
  organization_id,
  'master_attendance_data',
  'student',
  coalesce(student_norm_email, concat_ws(':', 'name_only', student_norm_name, birth_month::text, birth_year::text, student_norm_phone)),
  student_name,
  student_email,
  student_phone,
  student_norm_name,
  student_norm_email,
  student_norm_phone,
  jsonb_build_object('role_in_source','student'),
  now()
from app_private.master_attendance_stage
where coalesce(student_norm_email, student_norm_name) is not null
on conflict (organization_id, source_type, source_identity_type, source_identity_key)
do update set
  source_display_name = excluded.source_display_name,
  source_email = excluded.source_email,
  source_phone = excluded.source_phone,
  normalized_name = excluded.normalized_name,
  normalized_email = excluded.normalized_email,
  normalized_phone = excluded.normalized_phone,
  last_seen_at = now();

insert into app_core.source_identities (
  organization_id, source_type, source_identity_type, source_identity_key,
  source_display_name, source_email, normalized_name, normalized_email, source_payload, last_seen_at
)
select distinct
  organization_id,
  'master_attendance_data',
  'parent',
  coalesce(primary_norm_email, concat_ws(':', 'name_only', primary_norm_name)),
  primary_name,
  primary_email,
  primary_norm_name,
  primary_norm_email,
  jsonb_build_object('role_in_source','primary'),
  now()
from app_private.master_attendance_stage
where coalesce(primary_norm_email, primary_norm_name) is not null
on conflict (organization_id, source_type, source_identity_type, source_identity_key)
do update set
  source_display_name = excluded.source_display_name,
  source_email = excluded.source_email,
  normalized_name = excluded.normalized_name,
  normalized_email = excluded.normalized_email,
  last_seen_at = now();

insert into app_core.source_identities (
  organization_id, source_type, source_identity_type, source_identity_key,
  source_display_name, normalized_name, source_payload, last_seen_at
)
select distinct
  organization_id,
  'master_attendance_data',
  'instructor',
  concat_ws(':', 'name_only', instructor_norm_name),
  instructor_name,
  instructor_norm_name,
  jsonb_build_object('role_in_source','instructor'),
  now()
from app_private.master_attendance_stage
where instructor_norm_name is not null
on conflict (organization_id, source_type, source_identity_type, source_identity_key)
do update set
  source_display_name = excluded.source_display_name,
  normalized_name = excluded.normalized_name,
  last_seen_at = now();
```

Conservative auto-person creation and linking:

```sql
insert into app_core.persons (
  organization_id, display_name, normalized_name, email, normalized_email,
  phone, normalized_phone, birth_month, birth_year, raw_birthday_text, metadata
)
select
  si.organization_id,
  si.source_display_name,
  si.normalized_name,
  si.source_email,
  si.normalized_email,
  si.source_phone,
  si.normalized_phone,
  s.birth_month,
  s.birth_year,
  s.birthday_raw,
  jsonb_build_object('created_from_source','master_attendance_data')
from app_core.source_identities si
left join app_private.master_attendance_stage s
  on s.organization_id = si.organization_id
 and s.student_norm_email = si.normalized_email
where si.source_type = 'master_attendance_data'
  and si.person_id is null
  and si.normalized_email is not null
  and si.source_identity_type in ('student','parent')
on conflict (organization_id, normalized_email)
do update set
  display_name = case when app_core.persons.is_curated then app_core.persons.display_name else coalesce(app_core.persons.display_name, excluded.display_name) end,
  phone = coalesce(app_core.persons.phone, excluded.phone),
  normalized_phone = coalesce(app_core.persons.normalized_phone, excluded.normalized_phone),
  birth_month = coalesce(app_core.persons.birth_month, excluded.birth_month),
  birth_year = coalesce(app_core.persons.birth_year, excluded.birth_year),
  raw_birthday_text = coalesce(app_core.persons.raw_birthday_text, excluded.raw_birthday_text),
  updated_at = now();

update app_core.source_identities si
set person_id = p.id,
    confidence = 1,
    updated_at = now()
from app_core.persons p
where si.organization_id = p.organization_id
  and si.normalized_email = p.normalized_email
  and si.normalized_email is not null
  and si.person_id is null;

insert into app_core.match_candidates (
  organization_id, source_identity_id, candidate_person_id, candidate_kind, confidence, reason
)
select
  si.organization_id,
  si.id,
  p.id,
  case when p.id is null then 'needs_person' else 'possible_duplicate' end,
  case when p.id is null then 0.25 else 0.65 end,
  case when p.id is null
    then 'No safe email match; manual person creation or link required.'
    else 'Name matched but email was absent or different; manual review required.'
  end
from app_core.source_identities si
left join app_core.persons p
  on p.organization_id = si.organization_id
 and p.normalized_name = si.normalized_name
where si.source_type = 'master_attendance_data'
  and si.person_id is null
  and si.normalized_name is not null;
```

---

## Validation Queries

```sql
select organization_id, normalized_email, count(*)
from app_core.persons
where normalized_email is not null
group by organization_id, normalized_email
having count(*) > 1;

select organization_id, normalized_name, count(*)
from app_core.persons
where normalized_name is not null
group by organization_id, normalized_name
having count(*) > 1;

select organization_id, source_type, source_identity_type, count(*)
from app_core.source_identities
where person_id is null
group by organization_id, source_type, source_identity_type;

select organization_id, candidate_kind, count(*)
from app_core.match_candidates
where status = 'open'
group by organization_id, candidate_kind;

select pai.*
from app_core.person_auth_identities pai
left join app_core.persons p
  on p.organization_id = pai.organization_id
 and p.id = pai.person_id
where p.id is null;

select hm.*
from app_core.household_members hm
left join app_core.households h
  on h.organization_id = hm.organization_id
 and h.id = hm.household_id
left join app_core.persons p
  on p.organization_id = hm.organization_id
 and p.id = hm.person_id
where h.id is null or p.id is null;

select isa.*
from app_core.instructor_student_assignments isa
left join app_core.persons i
  on i.organization_id = isa.organization_id
 and i.id = isa.instructor_person_id
left join app_core.persons s
  on s.organization_id = isa.organization_id
 and s.id = isa.student_person_id
where i.id is null or s.id is null;

select
  (select count(*) from public.master_attendance_data) as legacy_rows,
  (select count(*) from app_core.source_records where source_type = 'master_attendance_data') as imported_records;

select m.id
from public.master_attendance_data m
left join app_core.source_records sr
  on sr.source_type = 'master_attendance_data'
 and sr.source_record_key = 'master_attendance_data:' || m.id::text
where sr.id is null;
```

---

## Required RLS Test Cases

Use Supabase SQL editor with JWT/auth context or run via API test users.

Expected outcomes:
- Student user can read only self.
- Parent user can read own household and linked children only.
- Instructor user can read assigned students only.
- Admin/manager can read org-wide canonical data, but only owner/admin can read raw source tables.
- User from org A cannot read org B rows.
- Non-admin cannot call role assignment RPC.
- Import rerun does not increase `source_records` count.

---

## Rollout Plan

1. Create Supabase branch or staging project.
2. Run migrations 001-008.
3. Seed one `app_core.organizations` row for current school.
4. Add one owner/admin membership for test auth user.
5. Run backfill job.
6. Run validation queries.
7. Test RLS with separate auth users: student, parent, instructor, admin, unrelated org user.
8. Enable frontend feature flag for read-only canonical data.
9. Enable admin/manual person workflows.
10. Enable linking/roles/households.
11. Keep legacy apps untouched.

Rollback:
- Disable frontend feature flag.
- Revoke app grants on `app_core`.
- Do not drop data in production during rollback.
- Because changes are additive, legacy apps continue unchanged.

---

## Open Questions for Supabase Review

- Confirm current organization slug/name for seed row.
- Confirm whether managers should see raw source payloads or only owner/admin.
- Decide whether adult students should be modeled as `adult_student` household members automatically.
- Decide whether instructor emails are available from another source adapter.
- Decide whether phone numbers should immediately be split into multiple contact rows during import.
- Decide whether lessons/sessions should be canonicalized now or after identity stabilization.
- Confirm privacy requirements for minors beyond RLS.

