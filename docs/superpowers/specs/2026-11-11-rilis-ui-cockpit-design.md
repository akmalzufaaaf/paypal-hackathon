# Rilis UI — Demo Cockpit (Design)

Date: 2026-11-11 · Approved approach: B (Demo cockpit) · Skill: ui-ux-pro-max
(`design-system/rilis/MASTER.md` is the persisted design system)

## Intent

Judges get ~3 minutes. The current UI proves the flow works but does not
show it. The redesign makes one glance answer: where is the money, who holds
it, what did the agent decide, and why. Narrative: "The AI advises. The
policy disposes."

## Goals / Non-goals

- Goals: journey stepper per milestone, money-state hero strip, verdict
  score ring against the pass threshold, timeline audit log, Swiss-minimal
  fintech system (ui-ux-pro-max: Minimalism & Swiss, IBM Plex Sans).
- Non-goals: no logic/API/state changes, no new dependencies, no Tailwind
  rewrite. All existing class names keep working; tests are backend-only.
- Anti-goal: decorative AI-purple gradients, emoji icons, unclear money
  states (skill anti-patterns).

## Design calls (mine, correctable)

- MASTER.md proposes dark navy + purple CTA. Adapted: light Swiss surface
  for video legibility; navy ink `#0F172A`; PayPal trust blue `#0070E0`
  primary; gold is reserved for AUTHORIZED (money held); green = released/
  pass; red = voided/fail; purple only for the agent actor badge (semantic,
  pre-existing). This follows the skill's palette notes (navy corporate,
  gold trust) without the purple-CTA anti-pattern conflict.
- Motion dial 5/10 implemented as CSS transitions/stagger, no GSAP dep.
- Fonts: IBM Plex Sans via `next/font/google` (skill pick), Geist Mono kept
  for PayPal IDs.

## Changes

1. `app/layout.tsx` — IBM Plex Sans variable.
2. `app/globals.css` — new token system + cockpit classes, focus-visible
   rings, 44px targets, reduced-motion support, responsive breakpoints.
3. `components/HeroStrip.tsx` (new) — project headline, money stats
   (cap used / on hold / released), selected-milestone journey stepper
   with `aria-current` + atomic live status.
4. `components/JourneyStepper.tsx` (new) — state → step model
   (Draft → Funded → Delivered → Verified → Released, with Escalated /
   Captured / Voided terminal variants).
5. `app/page.tsx` — mount HeroStrip; all handlers/lock logic untouched.
6. `components/VerdictPanel.tsx` — SVG score ring vs threshold, SVG
   pass/fail/unclear icons. `MilestoneDetail` passes `passThreshold`.
7. `components/MilestoneList.tsx` — per-card step dots.
8. `components/AuditLog.tsx` — timeline hooks (CSS-driven).

## Verification

`npm test`, `npm run build`, dev-server screenshot at desktop + mobile
widths against the pre-delivery checklist in MASTER.md.
