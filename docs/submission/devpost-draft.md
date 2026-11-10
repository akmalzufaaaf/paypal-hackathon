# Devpost submission draft — Rilis

Copy-paste draft for the owner's Devpost submission. Fields marked
**OWNER TO FILL** must be completed by the owner before submitting; nothing
below claims the hosted demo is live until the owner pastes the real URL.

- **Project name:** Rilis — Freelancer Money Agent
- **Tagline (OWNER TO FILL if Devpost asks for a short one-liner):**
  An AI agent holds a client's PayPal payment, verifies the freelancer's
  deliverable, and releases or voids the money — only inside guardrails the
  client set.
- **Hosted demo URL:** `<!-- OWNER TO FILL: paste the live Render URL here after hosted verification passes -->`
- **Video URL:** `<!-- OWNER TO FILL: paste the public <3-minute YouTube URL here -->`
- **Repo URL:** `<!-- OWNER TO FILL: paste the public GitHub repo URL here -->`

## Problem

Freelancers working directly with overseas clients face a trust deadlock:
the freelancer fears delivering work and not being paid; the client fears
paying and not receiving the work. Marketplaces solve this but take large
fees and impose multi-day payment holds outside either party's control.

## Solution

Rilis inserts an AI agent into that gap:

1. The client funds a milestone with a real PayPal **authorization hold**
   (sandbox) — money reserved, not yet captured.
2. The freelancer delivers against a written brief with a checklist.
3. The agent verifies the deliverable item by item (per-item verdicts,
   quoted evidence, code-computed score).
4. A deterministic policy engine decides — auto-capture, escalate to the
   client, or void — strictly inside the client's guardrails: project
   budget cap, auto-pay amount limit, and minimum AI pass score.
5. Every decision lands in an audit log with real PayPal order,
   authorization, and capture IDs.

The demo proves both directions: a $200 milestone is captured automatically
by policy, and a $600 milestone is escalated (over the auto-pay limit) and
voided live after the client rejects it.

## How PayPal is used

- PayPal Orders API with `intent: AUTHORIZE`: create order → payer approval
  via the PayPal JS SDK → server-side authorize → capture or void, all
  against the PayPal sandbox.
- PayPal order, authorization, and capture IDs are shown in the UI and
  written to the audit log for every transition.
- Mutating calls carry idempotency keys (`PayPal-Request-Id`) derived from
  the milestone + transition; terminal states reject further transitions
  server-side, so a double-click cannot double-capture.
- The client secret stays server-side in environment variables; the browser
  only receives the public client ID and the order ID.
- **Sandbox only — no real money moves, and there is no real-money mode.**

## How AI is used

- On delivery, the verifier checks the deliverable against the brief's
  checklist and returns strict JSON: one verdict (`pass`/`fail`/`unclear`)
  plus quoted evidence per item.
- The **score is computed in code** from the verdicts — never taken as a
  free-form LLM number — and the LLM never decides money movement. A
  deterministic policy table (plain code) decides capture/escalate.
  The AI advises; the policy disposes.
- Configured via `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` (an
  OpenAI-compatible endpoint). With no key — or if the provider errors or
  returns unusable output — a deterministic keyword/evidence fallback
  verifier runs instead, so judges can run the full demo key-free. The
  verification panel shows which provider ran.

## Guardrails demonstrated

- Auto-capture only when score ≥ threshold **and** amount ≤ auto-pay limit
  **and** captured total + amount ≤ budget cap (integer cents throughout).
- The budget cap is a hard ceiling: client approval of an escalation can
  override the limit and the score, never the cap.
- Policy edits never silently re-run the agent; the explicit **Re-run
  policy** action re-applies current settings and logs the snapshot used.

## Built With

- Next.js (App Router, TypeScript) — one monolith: UI + API route handlers
- React
- PayPal Orders API (sandbox) + PayPal JS SDK (`@paypal/paypal-js`)
- SQLite via `better-sqlite3` (seeded demo data, re-seeds on boot)
- An OpenAI-compatible LLM endpoint for verification (owner-provided key),
  with a deterministic fallback verifier
- Vitest (117 unit tests: policy table, scoring, state machine, PayPal
  client, verifier, workflow, persistence)
- **Render** — hosting (one Node web service from `render.yaml`)

## Try it / testing instructions

**OWNER TO FILL before submitting:** hosted URL (above), and the sandbox
test-buyer login below. Do not submit with the placeholders still in place.

1. Open the hosted demo URL (above). Click **Reset demo** (client role) to
   start from the seed.
2. **Fund:** As Client, open Milestone 1 ($200) → **Fund milestone** →
   approve in the PayPal sandbox popup with the test-buyer login:
   - Email: `<!-- OWNER TO FILL: sandbox Personal buyer email -->`
   - Password: `<!-- OWNER TO FILL: sandbox Personal buyer password -->`
   (Sandbox only — spends no real money.)
3. **Deliver + verify:** Switch to the Freelancer role → **Use sample
   deliverable** → **Submit deliverable** → **Run agent check**. Per-item
   verdicts and a score appear.
4. **Agent pays:** The milestone auto-captures; the audit log shows the
   capture ID and the ledger shows the release labelled **Simulated
   payout**.
5. **Agent refuses:** Reset, then fund + deliver Milestone 2 ($600). It
   escalates (over the $250 auto-pay limit). As Client, **Reject & void** —
   the authorization is voided live.
6. Local run instead: `npm install && npm run dev`, then follow the manual
   E2E checklist in the README (with and without `AI_API_KEY`).

Note: the hosted demo is one shared seeded project; simultaneous judges
share state. Use **Reset demo** to start over. The video carries the full
story on its own.

## Real vs simulated (disclosure)

| Real | Simulated / seeded |
|---|---|
| PayPal sandbox order create/authorize/capture/void with real sandbox IDs in the UI and audit log | Post-capture payout to the freelancer: a database ledger entry labelled **Simulated payout**. No real PayPal Payouts transfer is made. |
| AI-or-fallback deliverable verification, deterministic policy engine, audit log | Seeded demo project/people and the one-click sample deliverable |

## Category targets

- **Primary:** Best Use of Agentic Commerce — an agent that transacts
  (holds, verifies, releases/voids money under guardrails), not one that
  only recommends.
- **Secondary:** Best Use of PayPal + AI — real Orders
  authorize/capture/void plus itemized AI verification.
- **Sponsor selection:** Render (hosting).

## AI tools disclosure

AI tools were used in building this project, and an AI model performs the
deliverable verification when an API key is configured (with a
deterministic non-AI fallback otherwise, disclosed in the UI and README).
