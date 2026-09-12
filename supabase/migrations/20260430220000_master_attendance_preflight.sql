begin;

do $$
declare
  v_org_count int;
  v_legacy_rows bigint;
  v_stable_keys bigint;
  v_duplicate_key_groups bigint;
begin
  select count(*)
    into v_org_count
  from app_core.organizations
  where slug = 'real-school';

  if v_org_count <> 1 then
    raise exception 'Expected exactly one app_core.organizations row with slug real-school; found %', v_org_count;
  end if;

  if to_regclass('public.master_attendance_data') is null then
    raise exception 'Missing public.master_attendance_data; aborting attendance backfill preflight.';
  end if;

  select count(*)
    into v_legacy_rows
  from public.master_attendance_data;

  if v_legacy_rows = 0 then
    raise exception 'public.master_attendance_data has zero rows; aborting attendance backfill preflight.';
  end if;

  with keyed as (
    select app_private.master_attendance_stable_key(
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
    ) as stable_key
    from public.master_attendance_data
  ),
  duplicate_groups as (
    select stable_key
    from keyed
    group by stable_key
    having count(*) > 1
  )
  select
    count(distinct stable_key),
    (select count(*) from duplicate_groups)
    into v_stable_keys, v_duplicate_key_groups
  from keyed;

  raise notice 'master_attendance_data preflight passed: % current rows, % stable keys, % duplicate stable-key groups.',
    v_legacy_rows,
    v_stable_keys,
    v_duplicate_key_groups;
end;
$$;

commit;
