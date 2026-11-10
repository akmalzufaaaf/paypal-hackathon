# Rilis Freelancer Money Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Rilis, a hosted web app where an AI agent holds a client's PayPal sandbox milestone payment, verifies the freelancer's deliverable against the brief, and captures or escalates the payment under explicit guardrails — live before Nov 12, 2026, 12:00 PM PST.

**Architecture:** One Next.js (App Router, TypeScript) monolith. Pure domain modules (policy, scoring, state machine) are unit-tested first; a workflow service orchestrates SQLite persistence, the PayPal REST client, and the AI verifier behind injectable seams; route handlers are thin adapters; the UI is a single three-panel page. PayPal money movement is real sandbox Orders `AUTHORIZE` → authorize → capture/void; the freelancer payout is a labelled simulated ledger entry.

**Tech Stack:** Next.js (App Router) + TypeScript, `better-sqlite3`, `@paypal/paypal-js` (Buttons approval), PayPal REST API via server `fetch`, Vitest, Render deploy via `render.yaml`. Optional LLM via env-configured OpenAI-compatible/Meta endpoint with a deterministic fallback verifier.

**Spec:** `docs/superpowers/specs/2026-11-10-freelancer-money-agent-design.md`

## Global Constraints

- Submission deadline: **Nov 12, 2026, 12:00 PM PST**. After it, do not edit repo/video/linked materials until winners are announced (Dec 21, 2026); hosted demo and sandbox credentials must stay live until then.
- PayPal sandbox only; no real money. PayPal flow is `intent: "AUTHORIZE"` → payer approval → authorize → capture/void. Client secret only in server env (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=sandbox`); never committed (`.env.example` lists names only).
- Money is integer cents everywhere. Seeded demo: budget cap `100000` ($1,000), auto-pay limit `25000` ($250), AI pass threshold `80`; Milestone 1 = `20000` ($200, inside auto-pay), Milestone 2 = `60000` ($600, forces escalation).
- Budget cap is a **hard ceiling**: client approval can override auto-pay limit and AI score, never the cap. Policy edits never auto re-run; only the explicit **Re-run policy** action re-evaluates, and only from `VERIFIED`/`ESCALATED`.
- The LLM never decides money movement: it yields per-item verdicts; code computes the score; the deterministic policy table decides capture/escalate.
- Judges must be able to run the core demo **without an AI API key** (deterministic fallback; seeded deliverable passes it at ≥80). Hosted demo uses the owner-provided Meta (Muse Wonder/Spark) key.
- Payout is a **simulated ledger release**, labelled as such in UI and README. Real Payouts is an optional, time-boxed (2h) stretch behind the same UI, only after the full demo passes hosted.
- MIT `LICENSE` at repo root; README contains local run instructions, sandbox test-buyer credentials, and a real-vs-simulated disclosure table.
- AI tools used must be disclosed in the Devpost submission text.

## Review Focus

1. PayPal approval succeeds in the popup but the server authorize call fails or the page is refreshed mid-flow — milestone must not show `AUTHORIZED` without a stored authorization ID, and re-trying must not create a second live order for the same milestone. (Pinned in Task 4/6 tests.)
2. Double-click / concurrent capture, or Re-run policy while a capture is in flight — exactly one capture ID may ever be recorded; terminal states reject further transitions. (Task 2/6 tests.)
3. LLM returns malformed JSON, omits checklist items, or no AI key is configured — verification falls back or marks items `unclear`; an unparseable verification can never auto-capture. (Task 5 tests.)
4. Budget-cap arithmetic across milestones — cap compares captured total + current amount in integer cents; a $200 capture followed by a $600 capture under a $1,000 cap passes, a third that would exceed it escalates. (Task 2 tests.)
5. PayPal authorization expires or PayPal returns an error on capture — milestone stays unpaid, error is written to the audit log, client can void/reset; UI never shows `RELEASED`. (Task 6 tests.)

## File Structure

```
app/
  page.tsx                  three-panel demo page (server component, loads state)
  layout.tsx, globals.css
  api/state/route.ts        GET full demo state
  api/paypal/create-order/route.ts
  api/paypal/authorize/route.ts
  api/milestones/[id]/deliver/route.ts
  api/milestones/[id]/decide/route.ts        verify + policy (+ auto-capture)
  api/milestones/[id]/approve/route.ts       client capture from ESCALATED
  api/milestones/[id]/reject/route.ts        client void
  api/milestones/[id]/rerun/route.ts         manual policy re-evaluation
  api/policy/route.ts       PATCH project policy
  api/reset/route.ts        reset demo (void live hold, reseed)
components/
  RoleSwitcher.tsx, MilestoneList.tsx, MilestoneDetail.tsx,
  FundingButton.tsx (PayPal Buttons), DeliverForm.tsx, VerdictPanel.tsx,
  PolicyPanel.tsx, AuditLog.tsx, ResetButton.tsx
lib/
  constants.ts              DEMO seeded policy constants (Task 1 smoke test)
  types.ts                  shared types (states, verdicts, events)
  scoring.ts                score from per-item verdicts (pure)
  policy.ts                 policy table (pure)
  transitions.ts            milestone state machine guards (pure)
  db.ts                     SQLite open + schema + seed-on-empty
  repo.ts                   persistence for project/milestones/events/ledger
  paypal.ts                 PayPal REST client (token, orders, authorize/capture/void/get)
  ai-client.ts              optional LLM chat-JSON call (env-configured)
  verifier.ts               checklist verify: LLM path + deterministic fallback
  workflow.ts               orchestration used by route handlers (injectable deps)
scripts/paypal-spike.mjs    sandbox authorize→capture and authorize→void proof
tests/                      Vitest unit tests mirroring lib/ modules + workflow
render.yaml, .env.example, README.md, LICENSE
docs/submission/            Devpost copy draft + video script (Task 9)
```

---

### Task 1: Scaffold, test harness, and PayPal sandbox spike

**Files:**
- Create: Next.js app scaffold at repo root (preserve existing `AGENTS.md`, `docs/`)
- Create: `vitest.config.ts`, `scripts/paypal-spike.mjs`, `.env.example`, `.gitignore` (`.env*`, `data/`, `node_modules`)

**Interfaces:**
- Produces: `npm run dev`, `npm test` scripts; spike script CLI `node scripts/paypal-spike.mjs` reading `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` from env.

- [ ] **Step 1: Scaffold without clobbering repo docs**

Run `npx create-next-app@latest . --typescript --app --eslint --use-npm` in a temp copy of the repo if it refuses the non-empty directory, then merge generated files in, keeping `AGENTS.md` and `docs/` intact. Add dependencies: `better-sqlite3`, `@paypal/paypal-js`; dev: `vitest`.

- [ ] **Step 2: Add a smoke test and verify the harness**

Test `tests/smoke.test.ts` asserts the seeded constants module (create `lib/constants.ts` exporting `DEMO = { budgetCapCents: 100000, autoPayLimitCents: 25000, passThreshold: 80 }`) equals the Global Constraints values. Run `npm test`; expected PASS. Run `npm run build`; expected success with the default page.

- [ ] **Step 3: Write and run the PayPal spike (critical path)**

`scripts/paypal-spike.mjs`: client-credentials token → create order (`intent: "AUTHORIZE"`, $10.00, unique `PayPal-Request-Id`) → print approve link/order ID; after manual sandbox-buyer approval via the printed link, authorize → capture $10 → print capture ID; repeat with a second order ending in void. This script is run manually (it needs the owner-provided sandbox credentials and a human approval click); record its output IDs in the task commit message. If authorize is blocked after a half-day of attempts, stop and escalate to the owner (spec fallback to `CAPTURE` intent requires an explicit design change, not a silent swap).

- [ ] **Step 4: Commit** — `feat: scaffold Next.js app, test harness, PayPal sandbox spike`

### Task 2: Domain core — scoring, policy, state machine (pure, TDD)

**Files:**
- Create: `lib/types.ts`, `lib/scoring.ts`, `lib/policy.ts`, `lib/transitions.ts`
- Test: `tests/scoring.test.ts`, `tests/policy.test.ts`, `tests/transitions.test.ts`

**Interfaces:**
- Produces:
  - `type ItemVerdict = { requirement: string; verdict: "pass" | "fail" | "unclear"; evidence: string }`
  - `computeScore(items: ItemVerdict[]): number` — `round(100 × pass / total)`; `unclear` and `fail` both count as not-pass; empty list → `0`.
  - `type PolicyInput = { score: number; passThreshold: number; amountCents: number; autoPayLimitCents: number; capturedTotalCents: number; budgetCapCents: number }`
  - `evaluatePolicy(i: PolicyInput): { action: "AUTO_CAPTURE" | "ESCALATE"; reasons: string[] }` — `AUTO_CAPTURE` only when score ≥ threshold AND amount ≤ auto-pay limit AND capturedTotal + amount ≤ budget cap; otherwise `ESCALATE` with one human-readable reason per failed rule.
  - `type MilestoneState = "DRAFT" | "AUTHORIZED" | "DELIVERED" | "VERIFIED" | "ESCALATED" | "CAPTURED" | "RELEASED" | "VOIDED"`
  - `canTransition(from: MilestoneState, to: MilestoneState): boolean` for exactly the spec state machine (incl. `VERIFIED|ESCALATED → RELEASED` via capture path states `CAPTURED → RELEASED`, any review state → `VOIDED`); terminal states `RELEASED`/`VOIDED` allow no exits.

- [ ] **Step 1: Write failing tests**

Cover: score 4 pass/1 fail → `80`; all-unclear → `0`; empty → `0`. Policy rows: (86, ≤limit, within cap) → `AUTO_CAPTURE`; score 79 → `ESCALATE`; amount 60000 > limit 25000 → `ESCALATE`; captured 80000 + amount 30000 > cap 100000 → `ESCALATE` (Review Focus 4). Transitions: `DRAFT→AUTHORIZED`, `VERIFIED→ESCALATED`, `ESCALATED→CAPTURED`, `CAPTURED→RELEASED` true; `RELEASED→VOIDED`, `DRAFT→RELEASED`, `AUTHORIZED→CAPTURED` false.

- [ ] **Step 2: Run tests, expect FAIL** (modules missing). Run: `npm test`
- [ ] **Step 3: Implement the three pure modules** to the signatures above.
- [ ] **Step 4: Run tests, expect PASS.** Run: `npm test`
- [ ] **Step 5: Commit** — `feat: domain core — scoring, policy table, milestone state machine`

### Task 3: Persistence — schema, seed, repository, reset

**Files:**
- Create: `lib/db.ts`, `lib/repo.ts`
- Test: `tests/repo.test.ts` (uses `RILIS_DB_PATH=:memory:` or a temp file)

**Interfaces:**
- Consumes: `MilestoneState`, `ItemVerdict` from Task 2.
- Produces:
  - `getDb(): Database` — opens SQLite at `process.env.RILIS_DB_PATH ?? "./data/rilis.db"`, creates tables (`projects`, `milestones`, `deliverables`, `verifications`, `ledger_entries`, `agent_events`), seeds demo project on empty.
  - Seed: project "Brand logo for Sarah's coffee startup", client "Sarah (Austin, US)", freelancer "Bima (Yogyakarta, ID)", policy from `DEMO`; Milestone 1 "Primary logo concepts" 20000 with a 5-item checklist brief; Milestone 2 "Full brand kit" 60000; both `DRAFT`.
  - `getState(): { project, milestones, deliverables, verifications, ledger, events }` (events newest-last for log rendering)
  - `updateMilestone(id, patch)`, `insertDeliverable(...)`, `insertVerification(...)`, `insertLedgerRelease(milestoneId, amountCents)`, `insertEvent(milestoneId, actor, action, detail)`, `capturedTotalCents(projectId): number`
  - `resetDemo(): void` — clears all tables and re-seeds (PayPal void of a live hold is orchestrated in Task 6, not here).

- [ ] **Step 1: Write failing tests** — seed creates 1 project/2 milestones with exact cent amounts; `capturedTotalCents` sums only milestones in `CAPTURED`/`RELEASED`; `resetDemo` returns state to seed. Run `npm test`, expect FAIL.
- [ ] **Step 2: Implement `lib/db.ts` + `lib/repo.ts`** to the signatures above; checklist stored as JSON text.
- [ ] **Step 3: Run tests, expect PASS.** Run: `npm test`
- [ ] **Step 4: Commit** — `feat: SQLite persistence with seeded demo project`

### Task 4: PayPal REST client (mocked-fetch TDD)

**Files:**
- Create: `lib/paypal.ts`
- Test: `tests/paypal.test.ts` (stub global `fetch`)

**Interfaces:**
- Produces (all server-only, base URL `process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com"`):
  - `createOrder(amountCents: number, referenceId: string, requestId: string): Promise<{ orderId: string }>` — `POST /v2/checkout/orders`, `intent: "AUTHORIZE"`, USD amount formatted from cents.
  - `authorizeOrder(orderId: string): Promise<{ authorizationId: string; status: string }>` — reads `purchase_units[0].payments.authorizations[0]`.
  - `captureAuthorization(authorizationId: string, requestId: string): Promise<{ captureId: string; status: string }>`
  - `voidAuthorization(authorizationId: string): Promise<void>`
  - `getOrder(orderId: string): Promise<{ status: string }>`
  - `PayPalError` carrying PayPal `name`/`message` so callers can log and surface failures.
  - OAuth token fetched per client instance and cached until expiry; every mutating call sends `PayPal-Request-Id`.

- [ ] **Step 1: Write failing tests** — token request shape; create-order body has `intent: "AUTHORIZE"` and `"200.00"` for 20000; authorize parses authorization ID from a fixture response; capture sends the given `PayPal-Request-Id`; a 422 fixture throws `PayPalError` with the PayPal error name (Review Focus 1/5 at client level). Run `npm test`, expect FAIL.
- [ ] **Step 2: Implement `lib/paypal.ts`** with `fetch`; convert cents with `(c/100).toFixed(2)`.
- [ ] **Step 3: Run tests, expect PASS.** Run: `npm test`
- [ ] **Step 4: Commit** — `feat: PayPal sandbox REST client (authorize/capture/void)`

### Task 5: AI verifier — LLM seam + deterministic fallback (TDD)

**Files:**
- Create: `lib/ai-client.ts`, `lib/verifier.ts`
- Test: `tests/verifier.test.ts`

**Interfaces:**
- Consumes: `ItemVerdict`, `computeScore` (Task 2).
- Produces:
  - `chatJson(prompt: string): Promise<unknown>` in `ai-client.ts` — throws `AiNotConfigured` when `AI_API_KEY` unset; otherwise POSTs to `AI_BASE_URL` with `AI_MODEL`, returns parsed JSON.
  - `verifyDeliverable(input: { checklist: string[]; deliveryNote: string; extractedText: string; filename?: string }): Promise<{ provider: "llm" | "fallback"; items: ItemVerdict[]; score: number; summary: string }>`
  - Behaviour: with a key, prompt the model for exactly one verdict per checklist item (strict JSON); validate the response covers every checklist item exactly once — any missing/extra/unparseable output discards the LLM result and uses the fallback (never throws to the caller). Fallback: for each checklist item, `pass` when at least one significant keyword from the requirement appears in note+extractedText, else `unclear` (fallback never emits `fail`); score always via `computeScore`.

- [ ] **Step 1: Write failing tests** — no key → `provider: "fallback"` and the seeded sample deliverable (test fixture: note covering 4 of the 5 seeded requirements) scores ≥ 80; LLM stub returning an item subset → falls back; LLM stub returning valid full JSON → `provider: "llm"` with its verdicts and code-computed score (Review Focus 3). Run `npm test`, expect FAIL.
- [ ] **Step 2: Implement both modules**; seeded checklist/sample fixture lives in the test, mirroring Task 3 seed text exactly.
- [ ] **Step 3: Run tests, expect PASS.** Run: `npm test`
- [ ] **Step 4: Commit** — `feat: deliverable verifier with LLM seam and key-free fallback`

### Task 6: Workflow service — funding, delivery, agent decision, escalation, reset

**Files:**
- Create: `lib/workflow.ts`
- Test: `tests/workflow.test.ts` (in-memory DB from Task 3; fake PayPal + fake verifier injected)

**Interfaces:**
- Consumes: Tasks 2–5. Deps injected: `{ paypal, verify }` defaulting to real modules.
- Produces:
  - `fundMilestone(milestoneId): Promise<{ orderId }>` — only from `DRAFT`; creates order, stores `paypalOrderId`, logs event. (`AUTHORIZED` is set only by authorize, below.)
  - `confirmAuthorization(milestoneId, orderId): Promise<void>` — authorizes via PayPal, stores authorization ID, `DRAFT → AUTHORIZED`; on PayPal error, milestone stays `DRAFT`, error event logged (Review Focus 1).
  - `submitDeliverable(milestoneId, input): Promise<void>` — only from `AUTHORIZED`; stores deliverable, `→ DELIVERED`.
  - `decide(milestoneId): Promise<{ action }>` — from `DELIVERED`: runs verifier, stores verification + score, `→ VERIFIED`, applies `evaluatePolicy`; `AUTO_CAPTURE` → capture via PayPal → `CAPTURED → RELEASED` + ledger release + events; `ESCALATE` → `ESCALATED` + event with reasons. Capture PayPal error → stays `ESCALATED`, error event, no ledger entry (Review Focus 5).
  - `approveCapture(milestoneId): Promise<void>` — from `ESCALATED` only; re-checks budget cap as a hard ceiling (cap breach throws `PolicyBlocked` even here); capture → `RELEASED` + ledger.
  - `rejectVoid(milestoneId): Promise<void>` — from `VERIFIED`/`ESCALATED`: void via PayPal → `VOIDED` + event.
  - `rerunPolicy(milestoneId): Promise<{ action }>` — from `VERIFIED`/`ESCALATED` only; re-applies `evaluatePolicy` with current project policy; may auto-capture (Review Focus 2: a second capture attempt on a `RELEASED` milestone throws via state guard).
  - `updatePolicy(patch): Promise<void>` — updates cap/limit/threshold, logs `policy_updated` event with the new snapshot; never triggers `decide`.
  - `resetDemoFlow(): Promise<void>` — voids the live authorization if a milestone is `AUTHORIZED`/`DELIVERED`/`VERIFIED`/`ESCALATED` (best effort: PayPal failure still reseeds and logs it), then `repo.resetDemo()`.

- [ ] **Step 1: Write failing tests** — happy path auto-capture (fake PayPal returns auth/capture IDs; final state `RELEASED`, ledger 20000, events ordered); $600-equivalent milestone escalates and `approveCapture` releases it; reject voids; score-below-threshold escalates; cap breach cannot be approved (`PolicyBlocked`); authorize failure leaves `DRAFT`; capture failure leaves `ESCALATED` with no ledger row; double `decide`/`approveCapture` after `RELEASED` throws (Review Focus 1, 2, 4, 5). Run `npm test`, expect FAIL.
- [ ] **Step 2: Implement `lib/workflow.ts`**, guarding every transition with `canTransition` and deriving idempotency request IDs as `${milestoneId}:${transition}`.
- [ ] **Step 3: Run tests, expect PASS.** Run: `npm test`
- [ ] **Step 4: Commit** — `feat: agent workflow — fund, verify, capture/void under policy`

### Task 7: API routes (thin adapters over the workflow)

**Files:**
- Create: all `app/api/**/route.ts` files listed in File Structure.

**Interfaces:**
- Consumes: Task 6 functions + `getState` (Task 3). Each route: parse/validate input → call workflow/repo → JSON `{ ok: true, state }` or `{ ok: false, error }` with 400 (bad transition/input), 502 (PayPal failure). `GET /api/state` returns `getState()`. `POST /api/milestones/[id]/deliver` accepts JSON `{ link?, note, filename?, extractedText? }` (browser reads txt/md file text client-side; no multipart upload in v1 — builder's simplification, recorded here).

- [ ] **Step 1: Implement routes** mapping 1:1 to workflow functions (`create-order→fundMilestone`, `authorize→confirmAuthorization`, `decide`, `approve`, `reject`, `rerun`, `policy→updatePolicy`, `reset→resetDemoFlow`).
- [ ] **Step 2: Verify manually against dev server with mocked env** — with no PayPal env set, `GET /api/state` returns seeded state; transitions that need PayPal return 502 with a readable error, and the milestone state is unchanged. Run: `npm run dev`, then `curl localhost:3000/api/state`.
- [ ] **Step 3: Run full test suite + build.** Run: `npm test && npm run build` — expected PASS/success.
- [ ] **Step 4: Commit** — `feat: API routes for demo state, funding, decisions, policy, reset`

### Task 8: UI — three-panel demo page

**Files:**
- Create: `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, all `components/*.tsx` in File Structure.

**Interfaces:**
- Consumes: `GET /api/state` shape (Task 3) and Task 7 routes. `FundingButton` uses `@paypal/paypal-js` `loadScript({ clientId: NEXT_PUBLIC_PAYPAL_CLIENT_ID, intent: "authorize", currency: "USD" })`, Buttons `createOrder` → `POST /api/paypal/create-order`, `onApprove` → `POST /api/paypal/authorize`, then refreshes state.
- UI contract (from spec sketch): left = milestone list + budget-cap progress; middle = selected milestone (brief/checklist, deliver form, AI verdict panel, capture/void/rerun actions when state allows); right = audit log with PayPal IDs, plus Policy panel (client role) and Reset demo. Header role switcher (Client/Freelancer) only changes which actions are enabled and whose view is emphasised — no auth. Ledger entries render with a visible **"Simulated payout"** label. `DeliverForm` includes a **"Use sample deliverable"** button that fills the seeded sample note/link (the one the fallback verifier passes at ≥80), plus free-form note/link/file-text input for judges.

- [ ] **Step 1: Implement page + components** to the contract above; every mutating button disabled unless the state machine allows that transition for the current role; after each action, refetch `/api/state`.
- [ ] **Step 2: Manual demo rehearsal (seeded path)** — with sandbox env set: fund $200 (buyer popup) → submit seeded deliverable → Decide → auto-capture visible with capture ID → fund $600, deliver, Decide → escalated → Reject → voided. Record any deviation as a fix before proceeding.
- [ ] **Step 3: Run tests + build.** Run: `npm test && npm run build` — expected PASS/success.
- [ ] **Step 4: Commit** — `feat: three-panel demo UI with PayPal funding and agent audit log`

### Task 9: Deploy, submission package, and final verification

**Files:**
- Create: `render.yaml`, `README.md`, `LICENSE` (MIT), `docs/submission/devpost-draft.md`, `docs/submission/video-script.md`
- Modify: `.env.example` (final variable list from Task 1)

**Interfaces:**
- Consumes: everything above. `render.yaml`: one Node web service, build `npm install && npm run build`, start `npm start`, health check `/`, env vars `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `PAYPAL_ENV`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` (all `sync: false`).

- [ ] **Step 1: Write README + LICENSE + `.env.example`** — README must contain: what Rilis is; local run (`npm install && npm run dev`); sandbox test-buyer credentials (from owner); the manual E2E checklist (the 4-step demo script, with and without `AI_API_KEY`); a **Real vs simulated** table (Real: PayPal order/authorize/capture/void, AI-or-fallback verification, policy engine, audit log. Simulated: payout ledger release; seeded sandbox transactions); AI-tools disclosure line.
- [ ] **Step 2: Deploy to Render and verify hosted** — create the service from `render.yaml` (owner's Render account), set env secrets, deploy, then run the full demo script on the hosted URL including Reset demo. Also run the optional Payouts spike decision here: only if this step is fully green and ≥2h remain.
- [ ] **Step 3: Write submission package** — `docs/submission/devpost-draft.md` (title, problem, solution, how PayPal + AI are used, Built With incl. Render, test instructions, real-vs-simulated disclosure, category targets: Best Use of Agentic Commerce + Render sponsor selection) and `docs/submission/video-script.md` (the spec's 6-part <3-minute script with on-screen actions and narration lines).
- [ ] **Step 4: Final gate** — from a fresh clone in a temp directory: `npm install && npm run dev`, run the E2E checklist key-free; `npm test && npm run build` green; hosted URL green. Then commit — `docs: submission package, Render deploy, README` — and push. **After this commit, no further edits once the owner submits (freeze rule).**

---

## Self-Review Notes (plan author, 2026-11-10)

- **Spec coverage:** PayPal authorize/capture/void (Tasks 1, 4, 6, 8); AI verification + fallback (Task 5); policy table incl. hard budget cap, manual re-run, audit log (Tasks 2, 6, 8); seeded demo + reset (Tasks 3, 6, 8); Render hosting + freeze + live-until-Dec-21 (Task 9); README/license/disclosure/video/Devpost package (Task 9). Optional Payouts spike appears in Tasks 1/9 as time-boxed stretch only, per spec.
- **Type consistency:** `evaluatePolicy`, `computeScore`, `canTransition`, workflow function names, and API route mapping are defined once and reused verbatim across tasks.
- **Review Focus** items 1–5 are each pinned to tests in Tasks 2, 4, 5, or 6 as noted.
