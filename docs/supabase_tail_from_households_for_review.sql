-- FORCE RLS decisions block to include before policy reset:
-- FORCE RLS decisions:
-- Force RLS on all tenant-owned/sensitive app_core tables so table-owner access is still policy-aware.
-- Supabase service_role / BYPASSRLS roles will still bypass RLS for controlled backend maintenance.
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

-- Remainder from households_read_accessible onward:
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
