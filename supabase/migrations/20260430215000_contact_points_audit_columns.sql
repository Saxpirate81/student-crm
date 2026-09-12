begin;

alter table app_core.person_contact_points
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists updated_by uuid references auth.users(id);

commit;
