# Rilis — Multi-Page App (Design)

Date: 2026-11-11 · Supersedes single-page cockpit layout (same visual system)

## Intent

Previous UI put everything on one page: "too basic and messy". Recreate as a
real product: login, dashboard, milestone status/detail, activity, profile —
one job per page, navigable via sidebar.

## Decisions

- **Demo login (user-approved):** seeded accounts Sarah (client) /
  Bima (freelancer), password `demo1234` shown on the form, session in
  `localStorage`. No backend auth; APIs and seeded demo untouched.
- **Routes:** `/` → redirect, `/login`, `/dashboard`, `/milestones`,
  `/milestones/[id]`, `/activity`, `/profile`.
- **Shell:** dark navy sidebar (logo, nav, account chip, logout) + light
  content; mobile topbar + bottom nav (≤5 items). Active nav via pathname.
- **Shared state:** `AppProvider` owns `/api/state`, the global mutation
  lock, funding lock, and action errors (moved verbatim from old page).
  Role now comes from the session, not a switcher.
- **Pages:** Dashboard = KPI cards (on hold, released, cap, needs
  attention) + milestone summary + recent activity. Milestones = filter
  chips by state. Detail = stepper + existing MilestoneDetail. Activity =
  existing AuditLog full-page. Profile = account, project, policy, reset,
  switch account.
- Visual system stays ui-ux-pro-max MASTER (IBM Plex Sans, navy/blue/gold/
  green semantics) with denser dashboard spacing; SVG icons only.

## Verification

Tests + build + screenshots of every route at 1440px and 375px.
