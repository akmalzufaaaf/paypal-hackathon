# Rilis — Freelancer Money Agent: Design

_Date: 2026-11-10 · Hackathon: PayPal AI Hackathon (Devpost) · Submission deadline: Nov 12, 2026, 12:00 PM PST (Nov 13, 03:00 WIB)_

## Intent and why

Freelancers working directly with overseas clients face a trust deadlock:
the freelancer fears delivering work and not being paid; the client fears
paying and not receiving the work. Marketplaces solve this but take large
fees and impose multi-day payment holds outside either party's control.

**Rilis** inserts an AI agent into that gap. The client funds a milestone
with a real PayPal **authorization hold** (money reserved, not yet
captured). The freelancer delivers. The agent verifies the deliverable
against the brief, then — only inside explicit, client-set guardrails —
captures the payment automatically, escalates to the client, or voids
the hold. Every decision is written to an audit log with real PayPal
transaction IDs.

Why this, why now: PayPal's Orders API supports authorize → capture/void,
LLMs can check a deliverable against a written brief item-by-item, and
the hackathon's **Best Use of Agentic Commerce** category rewards exactly
this: an agent that transacts, not one that only recommends.

## Goals

1. A judge can open the hosted demo and, without reading code, watch a
   real PayPal sandbox authorization be **captured by agent policy** and
   a second one be **voided after escalation**.
2. PayPal is central and real: create order → approve → authorize →
   capture/void, all against the PayPal sandbox, with PayPal order,
   authorization, and capture IDs visible in the UI and audit log.
3. AI does real work: it turns a brief into a checklist and verifies a
   submitted deliverable against it, returning per-item verdicts, an
   overall score, and quoted evidence.
4. Guardrails are explicit and editable: project budget cap, auto-pay
   amount limit, minimum AI pass score. The agent never acts outside
   them, and the demo proves a refusal.
5. Submission package passes Devpost Stage One on first check: hosted
   demo URL, public repo with MIT license, README run instructions,
   <3-minute public YouTube video, AI tools disclosed.

## Non-goals

- No real-money movement; PayPal sandbox only.
- No real PayPal **Payouts** transfer to the freelancer (see Approaches:
  payout is a clearly labelled simulated ledger release; a Payouts spike
  is optional stretch only).
- No real user registration/auth, no email, no multi-project SaaS
  tenancy, no dispute filing with PayPal, no invoicing/subscriptions.
- No Bryntum/AG Grid/Channel3 integration (sponsor depth traded for
  PayPal-flow reliability; see Approaches).

## Anti-goals (success that would still be failure)

- A pretty UI where the "PayPal payment" is a fake button or a capture
  that happens regardless of AI verdict or amount limits.
- An agent that can capture any amount without an approval path.
- Claiming the simulated payout ledger is a real PayPal Payouts transfer,
  anywhere in UI, README, video, or Devpost text.
- Requiring a paid AI API key for judges to run the core demo.

## Constraints

- **Time:** ~2 days of build (Nov 10–12). Every choice below prefers a
  boring, already-known tool over a new one.
- **PayPal sandbox:** app credentials come from a sandbox Business
  account; the demo payer logs in with a sandbox Personal (buyer)
  account in the PayPal approval popup. Test credentials (buyer login,
  no secrets that spend real money) must be documented for judges in
  the README/Devpost testing instructions. Client secret stays
  server-side in env vars, never committed.
- **Judges are not required to run the project** (organizer update), so
  the hosted demo on Render must stay live and funded with working
  sandbox credentials until winners are announced (Dec 21, 2026), and
  the video must carry the full story on its own.
- **Freeze after deadline:** per organizer update, do not edit the repo,
  video, or linked materials after Nov 12, 12:00 PM PST until after the
  winner announcement.
- **License:** MIT, detectable at the repo root (Devpost requirement).

## Approaches considered

**A. Full-real PayPal (Orders + Payouts).** Authorize/capture/void plus
a real sandbox Payouts transfer to the freelancer's sandbox account.
Most authentic, but Payouts (business-account permissions, recipient
onboarding, batch payout behaviour in sandbox) is the single most
likely one-day blocker. Rejected as the base plan; retained as a
time-boxed optional spike (max 2 hours) whose success only swaps the
ledger-release step for a real payout call behind the same UI.

**B. Hybrid real Orders (CHOSEN).** The money core is fully real:
PayPal Orders with `intent: AUTHORIZE`, payer approval via the PayPal
JS SDK, server-side authorize, then agent-driven capture or void with
real PayPal IDs throughout. The freelancer "payout" after capture is a
ledger entry in our database, labelled in the UI as a simulated payout
release. AI verification, policy engine, and audit log are fully real.
This keeps every demo-critical action on the most documented,
most reliable PayPal surface.

**C. Bryntum timeline-first.** A Gantt board where phases unlock on
payment, using simple Checkout captures. Most visual and aimed at the
Bryntum sponsor prize, but it weakens the core story (no hold/release
semantics), and learning a commercial Gantt component in 2 days risks
the whole submission. Rejected; a simple milestone timeline in plain
React carries the same narrative in the demo.

## Product specification

### Users and demo scenario (seeded)

No registration. Two seeded demo accounts with a role switcher in the
header (builder's simplification for judging):

- **Client:** "Sarah, founder (Austin, US)" — funds milestones, sets
  policy, approves/rejects escalations.
- **Freelancer:** "Bima, brand designer (Yogyakarta, ID)" — submits
  deliverables, sees held/released amounts and expected availability.

Seeded project: **"Brand logo for Sarah's coffee startup"**, budget cap
$1,000, auto-pay limit $250, AI pass threshold 80.

- Milestone 1: "Primary logo concepts" — **$200** (inside auto-pay
  limit). Pre-written brief with 5 checklist requirements; a seeded
  sample deliverable the freelancer can submit in one click (or replace
  with their own file/link + note).
- Milestone 2: "Full brand kit" — **$600** (above auto-pay limit).
  Exists to force the escalation/refusal path in the demo.

### Core flow (state machine)

```
DRAFT ──fund──▶ AUTHORIZED (PayPal hold placed)
AUTHORIZED ──deliver──▶ DELIVERED
DELIVERED ──agent verifies──▶ VERIFIED (score + per-item verdicts)
VERIFIED ──┬─ amount ≤ auto-pay limit AND score ≥ threshold
           │      ──▶ AUTO_CAPTURED ──▶ RELEASED (ledger payout)
           ├─ amount > limit OR score < threshold
           │      ──▶ ESCALATED ──client approves──▶ CAPTURED ──▶ RELEASED
           │                     └─client rejects──▶ VOIDED
           └─ client rejects deliverable at any review point ──▶ VOIDED
```

Every transition writes an `AgentEvent` (actor: agent/client/freelancer,
rule inputs, decision, PayPal IDs, timestamp). The audit log panel is a
first-class screen element, not a debug page.

### Screens (single-page app, three panels)

```
┌──────────────────────────────────────────────────────────────┐
│ Rilis   Project: Brand logo        [Role: Client ▾]  Policy ⚙ │
├────────────────┬───────────────────────┬─────────────────────┤
│ Milestones     │ Milestone detail      │ Agent audit log     │
│ 1 Logo $200    │ Brief + checklist     │ 09:41 hold placed   │
│   ● AUTHORIZED │ Deliverable submit    │   order 5O3…        │
│ 2 Brand $600   │ AI verdict: 4/5, 86   │ 09:43 AI score 86   │
│   ○ DRAFT      │ [Capture] [Void]      │ 09:43 AUTO-CAPTURE  │
│ Budget cap bar │ (shown on escalation) │   capture 9AX…      │
└────────────────┴───────────────────────┴─────────────────────┘
```

Policy settings (budget cap, auto-pay limit, pass threshold) are
editable by the client role; the audit log records policy at decision
time so a judge can change the limit and re-run the refusal live.

### Agent policy (deterministic, unit-tested)

| AI score ≥ threshold? | Amount ≤ auto-pay limit? | Project total after capture ≤ budget cap? | Agent action |
|---|---|---|---|
| yes | yes | yes | Auto-capture, then ledger release |
| yes | no | — | Escalate to client |
| no | — | — | Escalate to client with failed items listed |
| yes | yes | no | Escalate (budget-cap breach) |
| any | any | any, client rejects | Void authorization |

The LLM never decides money movement. It only produces the score and
verdicts; this table — plain code — decides. That separation is a
pitch point ("the AI advises, the policy disposes").

### AI verification

1. On milestone creation (seeded in advance for the demo project), the
   brief text is converted to a checklist of concrete, checkable items.
2. On delivery, the freelancer provides: file upload (image/PDF/text)
   and/or a link, plus a delivery note. Text is extracted where the
   format allows (txt/md native; PDF via a small parser dependency;
   images are described by filename + freelancer note unless a vision
   model key is configured).
3. Verifier output is strict JSON:
   `{ items: [{ requirement, verdict: pass|fail|unclear, evidence }],
      score: 0-100, summary }`.
   `score` = weighted pass ratio defined in code from item verdicts,
   not a free-form LLM number.
4. **Provider strategy:** if `AI_API_KEY` (OpenAI-compatible endpoint)
   is set, use it; otherwise a deterministic fallback verifier runs
   (checklist keyword/evidence matching over the delivery note and
   extracted text). The fallback is disclosed in README/Devpost text
   ("runs key-free for judges; plug in any OpenAI-compatible key for
   full LLM verification"). The seeded demo deliverable must pass the
   fallback at ≥80 so the key-free demo path works end-to-end.

### PayPal integration (server-side REST, sandbox)

1. Client clicks **Fund milestone** → server `POST /v2/checkout/orders`
   with `intent: "AUTHORIZE"`, amount = milestone amount (USD),
   reference = milestone ID → returns order ID.
2. PayPal JS SDK Buttons render the approval for that order; the payer
   (client role) approves with the sandbox buyer account.
3. On approval, server `POST /v2/checkout/orders/{order_id}/authorize`
   → stores authorization ID, expiry; milestone → `AUTHORIZED`.
4. Agent decision to capture → server
   `POST /v2/payments/authorizations/{authorization_id}/capture`
   (final_capture = true) → capture ID; → `RELEASED` + ledger entry.
5. Rejection/void → server
   `POST /v2/payments/authorizations/{authorization_id}/void`.
6. OAuth token via client-credentials from env
   (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=sandbox`).
   All PayPal calls are server-side only; the JS SDK receives only the
   public client ID and order ID.
7. Idempotency: `PayPal-Request-Id` per mutating call, derived from
   milestone + transition, so a double-click cannot double-capture.
   Capture/void buttons also disable once a terminal state is reached,
   enforced by the state machine server-side.

Webhooks are a non-goal for the build window; a "Sync with PayPal"
action (GET order/authorization status) reconciles state on demand and
after each mutating call the server re-reads the resource before
rendering. (Builder's call.)

### Data model (SQLite, seeded on first boot if empty)

- `Project(id, title, budgetCapCents, autoPayLimitCents, passThreshold, clientName, freelancerName)`
- `Milestone(id, projectId, title, brief, checklistJson, amountCents, state, paypalOrderId, paypalAuthorizationId, paypalCaptureId, authorizationExpiresAt)`
- `Deliverable(id, milestoneId, kind, filename, link, note, extractedText, createdAt)`
- `Verification(id, milestoneId, provider, itemsJson, score, summary, createdAt)`
- `LedgerEntry(id, milestoneId, kind: release, amountCents, status: simulated, createdAt)`
- `AgentEvent(id, milestoneId, actor, action, detailJson, createdAt)`

Money is integer cents everywhere; display formats from cents.

### Architecture

- **One Next.js (App Router, TypeScript) monolith**: UI + route
  handlers for PayPal, verification, and policy transitions. No
  separate backend service, no auth library, no ORM (thin repository
  over `better-sqlite3`). Rationale: 2-day window, one deployable.
- **Deploy:** Render web service via `render.yaml` (sponsor target:
  Render — selected on the Devpost form; hosting must remain live to
  Dec 21). SQLite file lives on the service filesystem; it is seeded
  demo data, so an ephemeral reset is acceptable (re-seeds on boot).
- **Env:** `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`,
  `NEXT_PUBLIC_PAYPAL_CLIENT_ID` (same value), `PAYPAL_ENV=sandbox`,
  optional `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL`.
- **Repo hygiene:** `.env.example` with variable names only, MIT
  `LICENSE`, README with local run (`npm install && npm run dev`),
  demo instructions, sandbox test-buyer credentials, and the
  real-vs-simulated disclosure table.

### Testing

- Unit tests (Vitest) for: policy table (all rows), score computation
  from verdicts, state-machine transition guards, cents formatting.
  The LLM client and PayPal client are mocked at their module seams.
- Manual E2E checklist (in README) covering the 4-step demo script on
  both the hosted URL and a fresh local clone, with and without an AI
  key.
- First implementation task is a **PayPal spike**: create sandbox app,
  run create-order → approve → authorize → capture and → void from a
  script against the sandbox. If authorize is blocked after a
  half-day, fall back to `intent: CAPTURE` at funding time plus
  ledger-only hold semantics, disclosed as such (this degrades the
  pitch and is a last resort, not the plan).

## Demo script (video, <3 minutes, also the judge's self-serve path)

1. **Problem (20s):** freelancer/client trust deadlock, one line each.
2. **Fund (30s):** client funds the $200 milestone; PayPal sandbox
   approval popup; audit log shows the authorization hold + PayPal ID.
   "The money is reserved. Nobody has been paid."
3. **Deliver + verify (40s):** freelancer submits the seeded
   deliverable; AI checklist verdicts appear item-by-item (4/5, 86).
4. **Agent pays (30s):** policy fires — under limit, score passes —
   auto-capture; capture ID in audit log; ledger shows Bima released
   $200 (labelled simulated payout). 
5. **Agent refuses (40s):** fund + deliver the $600 milestone; AI
   passes it, but the agent escalates — over the auto-pay limit;
   client rejects; authorization voided live. "The agent advises.
   The policy disposes. The human decides anything big."
6. **Close (20s):** guardrails recap, audit trail, what's real vs
   simulated, prize-category line (Agentic Commerce).

## Prize targeting

- **Primary:** Honorable Mention — **Best Use of Agentic Commerce**
  (agent holds, verifies, and releases money under guardrails).
- **Secondary:** Best Use of PayPal + AI (real Orders
  authorize/capture/void + itemized AI verification).
- **Sponsor:** Render (hosting; selected on submission form). Sponsor
  depth was deliberately traded away for PayPal-flow reliability after
  the approach decision (Approach B over C).

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Sandbox app/buyer setup friction (incl. from Indonesia) | First task is the PayPal spike; ask in PayPal Discord early if account creation blocks; document buyer test login for judges |
| PayPal approval popup blocked in hosted iframe contexts | Render Buttons standalone (not in an iframe); test hosted flow early, not just localhost |
| LLM key unavailable/rate-limited on demo day | Deterministic fallback verifier; seeded deliverable passes it ≥80 |
| Double capture from retries/double-clicks | Server state machine + idempotency keys + terminal-state guards |
| Judges mistake ledger for real payout | "Simulated payout" labelling in UI, README disclosure table, and video narration |
| Scope creep (auth, webhooks, Payouts) | Non-goals are explicit; optional Payouts spike is time-boxed to 2h and behind the same UI |

## Builder's calls (settled by the builder, flagged for review)

- Name "Rilis" (Indonesian: "release") — working name, changeable at
  Devpost-copy time without code impact.
- Next.js + SQLite + no ORM + no auth (role switcher) — boring-stack
  choices for the 2-day window.
- Webhooks skipped in favour of on-demand PayPal status sync.
- Score computed in code from per-item verdicts, never taken as a
  free-form LLM number.
- Seeded demo project (coffee-startup logo) and one-click sample
  deliverable, replaceable by judge uploads.

## What is left to the builder

- Visual design beyond the three-panel layout above.
- Exact LLM prompt wording (output schema above is fixed).
- File-extraction edge cases beyond txt/md/pdf/image-note.
- Whether the optional Payouts spike is attempted (only after the full
  demo script passes end-to-end on the hosted URL).
