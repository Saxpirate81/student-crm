# Cadenza / Real School Supabase Final Review Packet

Date: 2026-04-30  
Status: consolidated migration set, ready for Supabase review  
Scope: additive `app_core` / `app_private` schema for identity, lessons, assignments, submissions, media, listening, practice, communications, rewards, and legacy attendance import.

## Files To Send

1. `docs/supabase_app_core_consolidated_migration.sql`
   - Main runnable migration.
   - Creates schemas, extensions, tables, constraints, indexes, RLS helpers, RLS policies, RPCs, grants, and the seeded `real-school` organization.

2. `docs/supabase_master_attendance_backfill.sql`
   - Optional legacy import/backfill job for `public.master_attendance_data`.
   - Idempotent and safe to rerun.
   - Preserves raw source payloads, stages normalized values, creates source identity lineage, links conservative email matches, and routes uncertain matches to manual review.

3. `docs/supabase_validation_queries.sql`
   - Post-migration and post-backfill validation checks.
   - Covers tenant ownership, RLS enabled state, duplicate detection, orphan checks, import reconciliation, cross-tenant FK leakage, and shared contact review candidates.

## Critical + High Fixes Applied

- Added app domain tables beyond identity: `lessons`, `assignments`, `student_submissions`, `media_assets`, `media_links`, `practice_sessions`, `listening_playlists`, `listening_tracks`, `listening_sessions`, `communications`, `communication_reads`, `reward_badges`, and `person_reward_badges`.
- Removed risky uniqueness assumptions around shared emails/phones. People can share an email or phone; exact linking is conservative and review-driven.
- Added tenant-scoped foreign keys and tenant-aware indexes for all tenant-owned tables.
- Hardened `SECURITY DEFINER` functions with explicit `search_path`.
- Added RLS helper functions for person, lesson, assignment, and communication access.
- Restricted raw source/import lineage tables to owner/admin policies only.
- Restricted organization membership writes to org owners to avoid admin self-escalation.
- Added grants for `authenticated` while relying on RLS for enforcement.
- Added communication board read tracking via `mark_communication_read`.
- Added practice/listening RPCs for early app testing and local metric syncing.
- Added import reconciliation and validation queries for the legacy attendance adapter.

## Run Order

1. Run `supabase_app_core_consolidated_migration.sql`.
2. Sign in once as the first production owner.
3. Bootstrap that signed-in user as the first `real-school` owner:

```sql
select app_core.bootstrap_current_user_as_real_school_owner();
```

4. Run `supabase_master_attendance_backfill.sql`.
5. Run `supabase_validation_queries.sql`.
6. Test RLS with separate users for student, parent, instructor, admin/owner, and unrelated organization membership.

## Supabase Review Focus

- Confirm RLS policies match the intended privacy boundaries for minors.
- Confirm the first-owner bootstrap procedure for production.
- Confirm whether managers should remain excluded from raw source payload access.
- Confirm storage bucket strategy for compressed uploaded videos.
- Confirm whether `real-school` should remain the production organization slug.
- Confirm whether imported lessons should be `completed` by default when legacy status is ambiguous.

## Rollback Strategy

This is additive and does not modify legacy production tables. If rollout needs to pause:

1. Disable frontend feature flags for Supabase-backed data.
2. Revoke API exposure/grants for `app_core` if needed.
3. Leave `app_core` and `app_private` data in place for inspection.
4. Legacy apps continue to run from existing production tables.
