# Deployment Notes

## Release scope

- Unified all primary role views (`student`, `instructor`, `parent`, `admin`, `producer`) under the Cadenza shell UI.
- Replaced role pills with a single role dropdown in the left sidebar, ordered with `Instructor` first.
- Set the home route (`/`) to redirect to `instructor` for current testing workflow.
- Added producer workspace scaffold and migrated core producer modules:
  - `View Queue` with filters, sorting, review modal, and completion flow (mock-backed)
  - `View Playbook` with rules table, versioning, status/archive controls, and add/edit modal (mock-backed)
  - `View Matrix` with searchable student matrix, velocity, and pulse health visualization
- Centralized producer data state in `useProducerWorkspace()` and introduced datasource abstraction:
  - `ProducerWorkspaceDataSource` interface
  - mock datasource implementation
  - API datasource scaffold for future live integration
- Updated app branding and install icons to Cadenza logo:
  - Added manifest and icon metadata
  - Generated `192x192`, `512x512`, Apple touch icon, and refreshed `favicon.ico`

## Files and architecture notes

- New producer modules live under:
  - `src/components/producer/`
  - `src/lib/producer/`
  - `src/hooks/useProducerWorkspace.ts`
- App manifest now served from:
  - `src/app/manifest.ts`
- Icon assets now live under:
  - `public/cadenza-logo.png`
  - `public/cadenza-icon-192.png`
  - `public/cadenza-icon-512.png`
  - `public/apple-touch-icon.png`
  - `public/favicon.ico`

## Deployment verification checklist

- Open `/producer` and verify:
  - tab switching for Queue / Playbook / Matrix
  - shared playbook version affects all three tabs
- Open `/` and verify redirect lands on `/instructor`
- Confirm sidebar role dropdown works in student/instructor/parent/admin/producer views
- Confirm browser tab icon uses Cadenza logo
- On mobile, test "Add to Home Screen" icon displays Cadenza mark

