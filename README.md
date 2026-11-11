---
title: Rilis — Freelancer Money Agent
emoji: 🛡️
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# Rilis — Freelancer Money Agent

Rilis removes the trust deadlock between a freelancer and an overseas client.
The client funds a milestone with a real **PayPal sandbox authorization hold**
(money reserved, not yet captured). The freelancer delivers. An AI check
verifies the deliverable against the brief's checklist item by item. Then a
deterministic policy engine — not the LLM — decides: **auto-capture** the hold,
**escalate** to the client, or (on client rejection) **void** the hold. Every
step is written to an audit log with real PayPal order, authorization, and
capture IDs.

> **Sandbox only. No real money moves, and Rilis has no real-money mode.**
> The freelancer "payout" after a capture is a **simulated ledger release**
> (a database entry labelled "Simulated payout" in the UI). Rilis does **not**
> make real PayPal Payouts transfers. See [Real vs simulated](#real-vs-simulated).
>
> **Hosted demo:** _PENDING — the owner deploys from `render.yaml` and pastes
> the Render URL here. The hosted demo is not live until that happens._
> `<!-- OWNER: paste hosted Render URL here after deployment -->`

## How it works

```
DRAFT ──fund──▶ AUTHORIZED (PayPal hold placed)
AUTHORIZED ──deliver──▶ DELIVERED
DELIVERED ──agent verifies──▶ VERIFIED (score + per-item verdicts)
VERIFIED ──┬─ amount ≤ auto-pay limit AND score ≥ threshold AND within budget cap
           │      ──▶ AUTO-CAPTURED ──▶ RELEASED (simulated ledger payout)
           ├─ amount > limit OR score < threshold OR cap breach
           │      ──▶ ESCALATED ──client approves──▶ CAPTURED ──▶ RELEASED
           │                     └─client rejects──▶ VOIDED
           └─ client rejects deliverable at any review point ──▶ VOIDED
```

### Guardrails (deterministic policy, unit-tested)

| AI score ≥ threshold? | Amount ≤ auto-pay limit? | Project total after capture ≤ budget cap? | Agent action |
|---|---|---|---|
| yes | yes | yes | Auto-capture, then simulated ledger release |
| yes | no | — | Escalate to client |
| no | — | — | Escalate to client with failed items listed |
| yes | yes | no | Escalate (budget-cap breach) |

- The LLM never decides money movement. It only returns per-item verdicts;
  code computes the score from those verdicts, and the table above decides.
  ("The AI advises. The policy disposes.")
- The **budget cap is a hard ceiling**: a client approving an escalation can
  override the auto-pay limit and a failing AI score, but never a cap breach.
  Capture stays unavailable until the cap is raised (a logged policy edit)
  or the authorization is voided.
- Editing policy never re-runs the agent. Only the explicit **Re-run policy**
  action (from `VERIFIED`/`ESCALATED`) re-applies the current policy, and the
  audit log records the policy snapshot used.
- Mutating PayPal calls carry a `PayPal-Request-Id` derived from the
  milestone + transition, and terminal states (`RELEASED`/`VOIDED`) reject
  further transitions server-side, so a double-click cannot double-capture.

### Seeded demo

No registration. A header role switcher flips between two seeded people:

- **Client:** Sarah, founder (Austin, US) — funds milestones, sets policy,
  approves/rejects escalations.
- **Freelancer:** Bima, brand designer (Yogyakarta, ID) — submits deliverables.

Project: **"Brand logo for Sarah's coffee startup"** — budget cap **$1,000**,
auto-pay limit **$250**, AI pass threshold **80**.

- Milestone 1: "Primary logo concepts" — **$200** (inside the auto-pay limit),
  5-item checklist, one-click sample deliverable.
- Milestone 2: "Full brand kit" — **$600** (above the limit; forces escalation).

**Reset demo** (client role) voids any live `AUTHORIZED` hold (best effort),
clears milestones/deliverables/verifications/ledger/agent events, and
re-seeds the project. The hosted demo is one shared seeded project, so
simultaneous judges share state.

## Local run

Requirements: Node.js 22+ (the `better-sqlite3` dependency requires it) and npm.

```bash
npm install
npm run dev
```

> Windows note: `npm install` compiles the native `better-sqlite3`
> dependency from source and needs Visual Studio's "Desktop development
> with C++" workload. Without it, use `npm install --ignore-scripts`
> instead — the published package bundles a Windows prebuild, so the app
> and tests run unchanged (verified in the fresh-clone check).
> Deployment-side: `docs/submission/owner-actions.md` step (c) has the
> Render build-log check for this dependency and the decision path if
> the native build fails there.

Open http://localhost:3000. Without any env vars the app still loads with the
seeded project; funding stays disabled until the PayPal variables below are
set (the UI says so), and verification uses the deterministic fallback.

Tests and production build:

```bash
npm test
npm run build
npm start
```

### Environment variables

Copy `.env.example` to `.env.local` and fill in what you have. Variable names
only are committed; the client secret is server-side only and must never be
committed.

| Variable | Required | Purpose |
|---|---|---|
| `PAYPAL_CLIENT_ID` | For funding | PayPal sandbox Business app client ID (server-side). |
| `PAYPAL_CLIENT_SECRET` | For funding | PayPal sandbox Business app secret (server-side only). |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | For funding | Same value as `PAYPAL_CLIENT_ID`; exposed to the browser for the PayPal JS SDK. |
| `PAYPAL_ENV` | For funding | Set to `sandbox`. Documents intent; the REST client targets the sandbox API base. There is no live mode. |
| `PAYPAL_API_BASE` | No | Overrides the PayPal API base. Defaults to `https://api-m.sandbox.paypal.com`. |
| `AI_API_KEY` | No | Enables LLM verification. Without it (or if the provider call/reply is unusable) the deterministic fallback verifier runs. |
| `AI_BASE_URL` | With AI key | OpenAI-compatible base URL. The AI client POSTs to `{AI_BASE_URL}/chat/completions`. |
| `AI_MODEL` | With AI key | Model name sent to that endpoint. |
| `RILIS_DB_PATH` | No | SQLite path. Defaults to `./data/rilis.db` (`:memory:` in tests). On Render the filesystem is ephemeral: the DB re-seeds on boot, which is acceptable for seeded demo data. |

## Sandbox test-buyer credentials

Funding a milestone opens a PayPal sandbox approval popup. Log in there with
the sandbox **Personal (buyer)** account below — not a real PayPal account.

> **OWNER — ACTION REQUIRED (placeholder, not real credentials):**
> Paste the sandbox buyer login you created at developer.paypal.com here,
> replacing both lines, before submitting:
>
> - Email: `<!-- OWNER: paste sandbox Personal buyer email here -->`
> - Password: `<!-- OWNER: paste sandbox Personal buyer password here -->`
>
> Do not paste a real PayPal password. Sandbox buyer credentials spend no
> real money and are safe to share with judges.

## Manual E2E checklist

Run this on a fresh local clone and (once deployed) on the hosted URL.
First click **Reset demo** (client role) so you start from the seed.

### A. Key-free — no `AI_API_KEY` (fallback verifier)

PayPal sandbox variables are still required for steps 1–4; "key-free" means
only that no AI key is configured. Verification then shows
provider = fallback, and the seeded sample deliverable must pass at ≥ 80.

1. **Fund $200.** As Client, open Milestone 1 → **Fund milestone** → approve
   in the PayPal sandbox popup with the test-buyer login above.
   Expect: state `AUTHORIZED`; audit log shows the hold with PayPal order
   and authorization IDs. "The money is reserved. Nobody has been paid."
2. **Deliver + verify.** Switch to Freelancer → **Use sample deliverable** →
   **Submit deliverable**. Click **Run agent check**.
   Expect: per-item verdicts appear (checklist item, pass/fail/unclear,
   quoted evidence), a code-computed score, and provider = fallback.
3. **Agent pays.** $200 ≤ $250 limit and score ≥ 80, within the $1,000 cap.
   Expect: auto-capture without a human click; state `RELEASED`; audit log
   shows the capture ID; the ledger shows Bima released $200 labelled
   **Simulated payout**.
4. **Agent refuses.** **Reset demo**, then repeat steps 1–2 for Milestone 2
   ($600). The check may pass, but $600 > $250 limit.
   Expect: state `ESCALATED` (no auto-capture). As Client, **Reject & void**.
   Expect: state `VOIDED`; the authorization hold is voided via PayPal and
   the void is in the audit log.
5. **Reset.** Click **Reset demo**. Expect: both milestones back to `DRAFT`
   at $200/$600 and the demo can be run again.

### B. With `AI_API_KEY` (LLM verification)

Set `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL`, restart, **Reset demo**, and
repeat steps 1–4 above. Differences to expect:

- Verification shows provider = llm, with the model's per-item verdicts and
  evidence. The score is still computed in code from the verdicts — an
  LLM-supplied score is ignored.
- If the provider errors or returns malformed JSON, verification silently
  falls back to the deterministic verifier (provider = fallback) rather than
  failing or auto-capturing on unparseable output.
- The escalation in step 4 is unchanged: the policy engine, not the model,
  decides capture/escalate/void.

### C. Guardrail spot-checks (optional)

- Lower the auto-pay limit below $200 in the Policy panel, re-run steps 1–3:
  Milestone 1 must now escalate instead of auto-capturing. Edit the policy,
  then use **Re-run policy** — nothing re-runs until you click it.
- Set the budget cap below an amount already captured plus the next
  milestone: approval must stay blocked until the cap is raised or the
  hold is voided.

## Real vs simulated

| Real (PayPal sandbox / in-app logic) | Simulated / seeded |
|---|---|
| PayPal order create (`intent: AUTHORIZE`), payer approval, authorize, capture, and void against the PayPal sandbox, with real sandbox order/authorization/capture IDs in the UI and audit log | Post-capture payout to the freelancer: a SQLite ledger entry labelled **Simulated payout**. No PayPal Payouts transfer is made. |
| AI-or-fallback deliverable verification: per-item verdicts with evidence; score computed in code | Seeded demo project, milestones, briefs/checklists, and the one-click sample deliverable |
| Deterministic policy engine (auto-capture / escalate / void under budget cap, auto-pay limit, pass threshold) | Seeded demo people via a role switcher (no registration/auth) |
| Audit log of every transition with actor, rule inputs, decision, and PayPal IDs | Expected-availability/ledger presentation of the release |

Rilis never claims the ledger release is a real PayPal Payouts transfer, in
the UI, this README, the video, or the Devpost text.

## Deployment (Render)

`render.yaml` defines one Node web service (build `npm install && npm run
build`, start `npm start`, health check `/`). All PayPal/AI variables are
`sync: false` — the owner enters them as secrets in the Render dashboard.
Deployment and hosted verification are owner steps; see
[`docs/submission/owner-actions.md`](docs/submission/owner-actions.md).

## Submission package

- Devpost copy draft: [`docs/submission/devpost-draft.md`](docs/submission/devpost-draft.md)
- Video script (< 3 min): [`docs/submission/video-script.md`](docs/submission/video-script.md)
- Owner action list: [`docs/submission/owner-actions.md`](docs/submission/owner-actions.md)
- PayPal sandbox spike (manual proof script): `scripts/paypal-spike.mjs`

Prize targets: **Best Use of Agentic Commerce** (primary), **Best Use of
PayPal + AI** (secondary), Render sponsor selection.

## AI tools disclosure

AI tools were used in building this project, and an AI model performs the
deliverable verification when `AI_API_KEY` is configured (with a
deterministic non-AI fallback otherwise). This disclosure is repeated in the
Devpost submission text.

## License

MIT — see [`LICENSE`](LICENSE). Copyright (c) 2026 Rilis contributors.
