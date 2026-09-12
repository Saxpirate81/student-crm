begin;

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

commit;
