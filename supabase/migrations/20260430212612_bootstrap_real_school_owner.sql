-- Bootstrap first Real School owner/admin user.
-- Auth user: bill.doss@therealschoolofmusic.com
-- This migration only writes to app_core tables and reads auth.users.

begin;

do $$
declare
  v_org_id uuid;
  v_user_id uuid;
  v_person_id uuid;
  v_role_id uuid;
begin
  select id into v_org_id
  from app_core.organizations
  where slug = 'real-school';

  if v_org_id is null then
    raise exception 'real-school organization not found';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower('bill.doss@therealschoolofmusic.com')
  order by created_at desc
  limit 1;

  if v_user_id is null then
    raise exception 'auth user bill.doss@therealschoolofmusic.com not found';
  end if;

  select person_id into v_person_id
  from app_core.person_auth_identities
  where organization_id = v_org_id
    and user_id = v_user_id
    and identity_status = 'active'
  limit 1;

  if v_person_id is null then
    select id into v_person_id
    from app_core.persons
    where organization_id = v_org_id
      and normalized_email = 'bill.doss@therealschoolofmusic.com'
      and profile_status = 'active'
    order by created_at
    limit 1;
  end if;

  if v_person_id is null then
    insert into app_core.persons (
      organization_id,
      display_name,
      first_name,
      last_name,
      normalized_name,
      email,
      normalized_email,
      profile_status,
      is_curated,
      metadata
    )
    values (
      v_org_id,
      'Bill Doss',
      'Bill',
      'Doss',
      app_private.norm_name('Bill Doss'),
      'bill.doss@therealschoolofmusic.com',
      app_private.norm_email('bill.doss@therealschoolofmusic.com'),
      'active',
      true,
      jsonb_build_object('bootstrap_owner', true)
    )
    returning id into v_person_id;
  end if;

  insert into app_core.organization_memberships (
    organization_id,
    user_id,
    org_role,
    status,
    joined_at,
    metadata
  )
  values (
    v_org_id,
    v_user_id,
    'owner',
    'active',
    now(),
    jsonb_build_object('bootstrap_owner', true)
  )
  on conflict (organization_id, user_id)
  do update set
    org_role = 'owner',
    status = 'active',
    joined_at = coalesce(app_core.organization_memberships.joined_at, now()),
    updated_at = now(),
    metadata = app_core.organization_memberships.metadata || excluded.metadata;

  insert into app_core.person_auth_identities (
    organization_id,
    person_id,
    user_id,
    identity_status,
    is_primary
  )
  values (
    v_org_id,
    v_person_id,
    v_user_id,
    'active',
    true
  )
  on conflict (organization_id, user_id)
  do update set
    person_id = excluded.person_id,
    identity_status = 'active',
    is_primary = true,
    updated_at = now();

  insert into app_core.person_contact_points (
    organization_id,
    person_id,
    contact_type,
    raw_value,
    normalized_value,
    is_primary,
    active,
    metadata
  )
  values (
    v_org_id,
    v_person_id,
    'email',
    'bill.doss@therealschoolofmusic.com',
    app_private.norm_email('bill.doss@therealschoolofmusic.com'),
    true,
    true,
    jsonb_build_object('bootstrap_owner', true)
  )
  on conflict do nothing;

  for v_role_id in
    select id
    from app_core.roles
    where key in ('admin', 'producer')
  loop
    insert into app_core.person_roles (
      organization_id,
      person_id,
      role_id,
      effective_start,
      active,
      metadata
    )
    values (
      v_org_id,
      v_person_id,
      v_role_id,
      current_date,
      true,
      jsonb_build_object('bootstrap_owner', true)
    )
    on conflict do nothing;
  end loop;
end;
$$;

commit;
