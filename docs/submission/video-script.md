# Video script — Rilis (< 3 minutes)

Six parts, ~2:50 total. Record against the **hosted** demo only after the
hosted verification in `owner-actions.md` passes end to end. Narration lines
are verbatim suggestions; on-screen actions are what to click/show. Do not
claim the simulated payout is a real PayPal Payouts transfer, and do not
claim real-money capability, at any point.

**Before recording**

- [ ] Hosted demo passes the full demo script once, including **Reset demo**.
- [ ] Browser zoom set so PayPal IDs in the audit log are readable.
- [ ] Sandbox test-buyer login at hand (owner's sandbox Personal account).
- [ ] Start from **Reset demo** (client role): both milestones `DRAFT`.
- [ ] No secrets on screen (no dashboard env vars, no client secret).

## 1. Problem — 0:00–0:15 (15s)

- **On screen:** Rilis header + seeded project ("Brand logo for Sarah's
  coffee startup"), role switcher Sarah/Bima, the two milestones.
- **Narration:** "A freelancer overseas won't start without payment. A
  client won't pay before delivery. That deadlock is what Rilis removes —
  with an agent in the middle, holding the money."

## 2. Fund — 0:15–0:45 (30s)

- **On screen:** As Client (Sarah), open Milestone 1 "Primary logo
  concepts" ($200) → **Fund milestone** → PayPal sandbox approval popup →
  log in with the sandbox buyer → approve. Show state `AUTHORIZED` and the
  audit log entry with the PayPal order + authorization IDs.
- **Narration:** "Sarah funds the two-hundred-dollar milestone. PayPal
  places an authorization hold — this is a real PayPal sandbox call. The
  money is reserved. Nobody has been paid."

## 3. Deliver + verify — 0:45–1:20 (35s)

- **On screen:** Switch role to Freelancer (Bima) → **Use sample
  deliverable** → **Submit deliverable** → **Run agent check**. Show the
  per-item verdict panel: checklist items with pass/fail/unclear, quoted
  evidence, the overall score (key-free fallback: 4/5 items, score 80,
  which meets the threshold of 80; an LLM run may score differently), and
  which provider ran (LLM or fallback).
- **Narration:** "Bima delivers. The agent checks the work against the
  brief, item by item, with evidence for every verdict. Note what the AI
  does not do: it never touches the money. Code computes the score from
  the verdicts."

## 4. Agent pays — 1:20–1:50 (30s)

- **On screen:** Policy firing automatically — state moves to `RELEASED`;
  audit log shows the capture with its PayPal capture ID; ledger entry
  shows Bima released $200 with the visible **Simulated payout** label.
  Point at the label.
- **Narration:** "Two hundred dollars is under Sarah's two-fifty auto-pay
  limit, the score passes her threshold of eighty, and the project stays
  under its thousand-dollar cap — so policy captures the hold
  automatically. The capture is a real PayPal sandbox capture. This final
  payout entry is a simulated ledger release — Rilis does not claim a real
  PayPal Payouts transfer."

## 5. Agent refuses — 1:50–2:30 (40s)

- **On screen:** **Reset demo**, then fund + deliver Milestone 2 "Full
  brand kit" ($600) the same way. **Run agent check** → state `ESCALATED`
  with the reason. As Client, **Reject & void**. Show state `VOIDED` and
  the void entry in the audit log with the authorization ID.
- **Narration:** "Now the six-hundred-dollar milestone. The work can pass
  the check — but six hundred is over the auto-pay limit, so the agent
  refuses to pay on its own and escalates. Sarah rejects, and the hold is
  voided live. The agent advises. The policy disposes. The human decides
  anything big. And the budget cap is a hard ceiling — not even Sarah's
  approval can capture past it."

## 6. Close — 2:30–2:50 (20s)

- **On screen:** Policy panel (budget cap $1,000, auto-pay limit $250,
  threshold 80), the full audit log, the footer disclosure. End on the
  Rilis header.
- **Narration:** "Every hold, verdict, capture, and void is in the audit
  log with its PayPal ID. Real: PayPal authorize, capture, and void, AI
  verification, and the policy engine. Simulated: only the final payout
  ledger entry — labelled as such. That's Rilis: an agent that transacts
  under guardrails. Built for Best Use of Agentic Commerce, hosted on
  Render."

## After recording

- [ ] Total runtime under 3:00.
- [ ] Upload as a public YouTube video; paste the URL into
      `docs/submission/devpost-draft.md` **before** the owner submits
      (post-submission edits are frozen — see `owner-actions.md`).
- [ ] Captions checked: "Simulated payout" and "sandbox" are not cut.
