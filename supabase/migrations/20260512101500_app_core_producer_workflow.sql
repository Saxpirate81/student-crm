begin;

create table if not exists app_core.email_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  template_name text not null,
  email_subject text not null,
  html_body text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

drop trigger if exists trg_email_templates_updated_at on app_core.email_templates;
create trigger trg_email_templates_updated_at
before update on app_core.email_templates
for each row execute function app_private.set_updated_at();

create table if not exists app_core.workflow_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  playbook_version text not null default 'Current',
  learning_track text not null default 'All',
  target_lesson int not null check (target_lesson > 0),
  placement text not null default 'lesson' check (placement in ('lesson', 'between')),
  task_name text not null,
  task_type text not null check (task_type in ('In-Room Milestone', 'Media Upload', 'System Action', 'Admin Task')),
  execution_mode text not null default 'Manual' check (execution_mode in ('Manual', 'Automated')),
  assignee text not null default 'Both' check (assignee in ('Teacher', 'Ops', 'Both')),
  teacher_description text not null default '',
  ops_description text not null default '',
  email_template_id uuid references app_core.email_templates(id),
  status text not null default 'Active' check (status in ('Active', 'Inactive', 'Archived')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index if not exists idx_workflow_rules_org_version_status_lesson
  on app_core.workflow_rules (organization_id, playbook_version, status, target_lesson);

drop trigger if exists trg_workflow_rules_updated_at on app_core.workflow_rules;
create trigger trg_workflow_rules_updated_at
before update on app_core.workflow_rules
for each row execute function app_private.set_updated_at();

create table if not exists app_core.ops_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  student_person_id uuid references app_core.persons(id),
  legacy_crm_id uuid,
  trigger_lesson int not null check (trigger_lesson > 0),
  task_name text not null,
  task_type text not null check (task_type in ('In-Room Milestone', 'Media Upload', 'System Action', 'Admin Task')),
  ops_instructions text not null default '',
  status text not null default 'Pending' check (status in ('Pending', 'Completed', 'Cancelled')),
  assigned_to text not null default 'Operations',
  email_template_id uuid references app_core.email_templates(id),
  source_rule_id uuid references app_core.workflow_rules(id),
  playbook_version text not null default 'Current',
  student_name text,
  parent_name text,
  parent_email text,
  parent_contact text,
  instrument text,
  learning_track text,
  age_years int,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index if not exists idx_ops_tasks_org_status_created
  on app_core.ops_tasks (organization_id, status, created_at);

drop trigger if exists trg_ops_tasks_updated_at on app_core.ops_tasks;
create trigger trg_ops_tasks_updated_at
before update on app_core.ops_tasks
for each row execute function app_private.set_updated_at();

create table if not exists app_core.email_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app_core.organizations(id) on delete cascade,
  student_person_id uuid references app_core.persons(id),
  legacy_crm_id uuid,
  template_id uuid references app_core.email_templates(id),
  sent_to_email text not null,
  email_subject text not null,
  sent_at timestamptz not null default now(),
  opened_at timestamptz,
  metadata jsonb not null default '{}'
);

create index if not exists idx_email_events_org_sent_at
  on app_core.email_events (organization_id, sent_at);

alter table app_core.email_templates enable row level security;
alter table app_core.workflow_rules enable row level security;
alter table app_core.ops_tasks enable row level security;
alter table app_core.email_events enable row level security;

drop policy if exists email_templates_select on app_core.email_templates;
create policy email_templates_select on app_core.email_templates
for select to authenticated
using (app_core.is_org_member(organization_id));

drop policy if exists email_templates_mutate on app_core.email_templates;
create policy email_templates_mutate on app_core.email_templates
for all to authenticated
using (app_core.is_org_admin(organization_id))
with check (app_core.is_org_admin(organization_id));

drop policy if exists workflow_rules_select on app_core.workflow_rules;
create policy workflow_rules_select on app_core.workflow_rules
for select to authenticated
using (app_core.is_org_member(organization_id));

drop policy if exists workflow_rules_mutate on app_core.workflow_rules;
create policy workflow_rules_mutate on app_core.workflow_rules
for all to authenticated
using (app_core.is_org_admin(organization_id))
with check (app_core.is_org_admin(organization_id));

drop policy if exists ops_tasks_select on app_core.ops_tasks;
create policy ops_tasks_select on app_core.ops_tasks
for select to authenticated
using (app_core.is_org_member(organization_id));

drop policy if exists ops_tasks_mutate on app_core.ops_tasks;
create policy ops_tasks_mutate on app_core.ops_tasks
for all to authenticated
using (app_core.is_org_admin(organization_id))
with check (app_core.is_org_admin(organization_id));

drop policy if exists email_events_select on app_core.email_events;
create policy email_events_select on app_core.email_events
for select to authenticated
using (app_core.is_org_member(organization_id));

drop policy if exists email_events_mutate on app_core.email_events;
create policy email_events_mutate on app_core.email_events
for all to authenticated
using (app_core.is_org_admin(organization_id))
with check (app_core.is_org_admin(organization_id));

with org as (
  select id as organization_id
  from app_core.organizations
  where slug = 'real-school'
  limit 1
)
insert into app_core.email_templates (
  organization_id,
  template_name,
  email_subject,
  html_body,
  metadata
)
select
  org.organization_id,
  t.template_name,
  t.email_subject,
  t.html_body,
  jsonb_build_object('legacy_template_id', t.id::text)
from org
join public.crm_email_templates t on true
where not exists (
  select 1
  from app_core.email_templates et
  where et.organization_id = org.organization_id
    and et.metadata->>'legacy_template_id' = t.id::text
);

with org as (
  select id as organization_id
  from app_core.organizations
  where slug = 'real-school'
  limit 1
),
template_map as (
  select
    id as app_template_id,
    metadata->>'legacy_template_id' as legacy_template_id
  from app_core.email_templates
)
insert into app_core.workflow_rules (
  organization_id,
  playbook_version,
  learning_track,
  target_lesson,
  placement,
  task_name,
  task_type,
  execution_mode,
  assignee,
  teacher_description,
  ops_description,
  email_template_id,
  status,
  metadata
)
select
  org.organization_id,
  coalesce(r.playbook_category, 'Current'),
  case
    when r.learning_track in ('All', 'Kids', 'Teens', 'Adults', 'Cross-Trainer', 'True Beginner') then r.learning_track
    else 'All'
  end,
  r.target_lesson,
  case when coalesce(r.assignee, 'Both') = 'Ops' then 'between' else 'lesson' end,
  r.task_name,
  case
    when r.task_type in ('In-Room Milestone', 'Media Upload', 'System Action', 'Admin Task') then r.task_type
    else 'System Action'
  end,
  case when coalesce(r.execution_mode, 'Manual') in ('Manual', 'Automated') then coalesce(r.execution_mode, 'Manual') else 'Manual' end,
  case when coalesce(r.assignee, 'Both') in ('Teacher', 'Ops', 'Both') then coalesce(r.assignee, 'Both') else 'Both' end,
  coalesce(r.teacher_description, ''),
  coalesce(r.ops_description, ''),
  tm.app_template_id,
  case when coalesce(r.status, 'Active') in ('Active', 'Inactive', 'Archived') then coalesce(r.status, 'Active') else 'Active' end,
  jsonb_build_object('legacy_rule_id', r.rule_id::text)
from org
join public.crm_workflow_rules r on true
left join template_map tm on tm.legacy_template_id = r.email_template_id::text
where not exists (
  select 1
  from app_core.workflow_rules wr
  where wr.organization_id = org.organization_id
    and wr.metadata->>'legacy_rule_id' = r.rule_id::text
);

with org as (
  select id as organization_id
  from app_core.organizations
  where slug = 'real-school'
  limit 1
),
template_map as (
  select
    id as app_template_id,
    metadata->>'legacy_template_id' as legacy_template_id
  from app_core.email_templates
),
rule_map as (
  select
    id as app_rule_id,
    metadata->>'legacy_rule_id' as legacy_rule_id,
    playbook_version
  from app_core.workflow_rules
)
insert into app_core.ops_tasks (
  organization_id,
  legacy_crm_id,
  trigger_lesson,
  task_name,
  task_type,
  ops_instructions,
  status,
  assigned_to,
  email_template_id,
  source_rule_id,
  playbook_version,
  student_name,
  parent_name,
  parent_email,
  instrument,
  learning_track,
  age_years,
  created_at,
  metadata
)
select
  org.organization_id,
  q.crm_id,
  q.trigger_lesson,
  coalesce(q.task_name, 'Producer Task'),
  case
    when q.task_type in ('In-Room Milestone', 'Media Upload', 'System Action', 'Admin Task') then q.task_type
    else 'System Action'
  end,
  coalesce(q.ops_instructions, ''),
  case
    when q.status in ('Pending', 'Completed', 'Cancelled') then q.status
    else 'Pending'
  end,
  coalesce(q.assigned_to, 'Operations'),
  tm.app_template_id,
  rm.app_rule_id,
  coalesce(rm.playbook_version, 'Current'),
  p.student_name,
  p.primary_name,
  p.primary_email,
  p.instrument,
  p.learning_track,
  case
    when p.age_group = 'Kids' then 10
    when p.age_group = 'Teens' then 15
    when p.age_group = 'Adults' then 24
    else null
  end,
  q.created_at,
  jsonb_build_object('legacy_task_id', q.task_id::text)
from org
join public.crm_ops_queue q on true
left join public.crm_profiles p on p.crm_id = q.crm_id
left join template_map tm on tm.legacy_template_id = q.email_template_id::text
left join rule_map rm on rm.legacy_rule_id = (
  select r.rule_id::text
  from public.crm_workflow_rules r
  where r.task_name = q.task_name
    and r.target_lesson = q.trigger_lesson
  order by case when coalesce(r.playbook_category, 'Current') = 'Current' then 0 else 1 end, r.created_at desc
  limit 1
)
where not exists (
  select 1
  from app_core.ops_tasks ot
  where ot.organization_id = org.organization_id
    and ot.metadata->>'legacy_task_id' = q.task_id::text
);

with org as (
  select id as organization_id
  from app_core.organizations
  where slug = 'real-school'
  limit 1
),
template_map as (
  select
    id as app_template_id,
    metadata->>'legacy_template_id' as legacy_template_id
  from app_core.email_templates
)
insert into app_core.email_events (
  organization_id,
  legacy_crm_id,
  template_id,
  sent_to_email,
  email_subject,
  sent_at,
  opened_at,
  metadata
)
select
  org.organization_id,
  l.crm_id,
  tm.app_template_id,
  l.sent_to_email,
  l.email_subject,
  coalesce(l.sent_at, now()),
  l.opened_at,
  jsonb_build_object('legacy_log_id', l.log_id::text)
from org
join public.crm_email_logs l on true
left join template_map tm on tm.legacy_template_id = l.template_id::text
where not exists (
  select 1
  from app_core.email_events ee
  where ee.organization_id = org.organization_id
    and ee.metadata->>'legacy_log_id' = l.log_id::text
);

commit;
