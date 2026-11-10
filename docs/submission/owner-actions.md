# Owner actions — pending inputs (Task 9)

Everything locally verifiable for Task 9 is done (render.yaml, README,
LICENSE, .env.example, Devpost draft, video script, fresh-clone gate).
The steps below need the **owner's own accounts and secrets** and are
**PENDING** — they were not performed by the builder agent and must not be
reported as done until the owner completes them.

Deadline: submit on Devpost **before Nov 12, 2026, 12:00 PM PST**.
After submission, **freeze**: do not edit the repo, video, or linked
materials until after the winner announcement (Dec 21, 2026), and keep
the hosted demo + sandbox credentials live until then.

## (a) PayPal sandbox app + buyer, and the live spike

1. At https://developer.paypal.com (log in with your PayPal account):
   - **Apps & Credentials → Sandbox → Create App.** App type: **Business**
     (merchant). Name it e.g. `Rilis demo`.
   - Copy the **Client ID** and **Secret** (keep the secret private; it
     goes only into env vars, never into the repo).
   - **Testing Tools → Sandbox Accounts:** ensure a **Business** account
     linked to the app and a **Personal** (buyer) account exist; if not,
     create them. Note the buyer email + password — judges log in with
     this buyer in the approval popup.
2. Run the live spike locally (proves authorize → capture and
   authorize → void against the real sandbox before hosting):

   PowerShell:
   ```powershell
   $env:PAYPAL_CLIENT_ID="..."; $env:PAYPAL_CLIENT_SECRET="..."
   node scripts/paypal-spike.mjs
   ```
   The script prints an approve link per flow; approve each with the
   sandbox **buyer** account in your browser. Success = it prints an
   order/authorization/capture ID for the capture flow and a voided
   authorization for the void flow. Record those IDs for yourself.
   If authorize is blocked after a half-day of attempts, stop and decide
   explicitly — do not silently swap the design to `intent: CAPTURE`.
3. Paste into `README.md` → "Sandbox test-buyer credentials" (replacing
   both placeholder lines) and into `docs/submission/devpost-draft.md` →
   "Try it / testing instructions":
   - sandbox buyer email
   - sandbox buyer password
   (Sandbox credentials only — never a real PayPal password.)

## (b) Provide env secrets

Have these ready (from step (a) and your AI provider). Names only live in
`.env.example`; values go into Render (step c) and your local `.env.local`:

| Variable | Value |
|---|---|
| `PAYPAL_CLIENT_ID` | Sandbox Business app Client ID |
| `PAYPAL_CLIENT_SECRET` | Sandbox Business app Secret |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Same value as `PAYPAL_CLIENT_ID` |
| `PAYPAL_ENV` | `sandbox` |
| `AI_API_KEY` | API key for your chosen OpenAI-compatible provider — or leave all three AI vars unset for the fallback verifier. (The owner's planned example is a Meta Muse key, but any OpenAI-compatible provider works; no specific provider is required.) |
| `AI_BASE_URL` | That provider's OpenAI-compatible base URL (client POSTs to `{AI_BASE_URL}/chat/completions`) |
| `AI_MODEL` | Model name for that endpoint |

Optional: `PAYPAL_API_BASE` (defaults to the sandbox API base) and
`RILIS_DB_PATH` (defaults to `./data/rilis.db`).

## (c) Create the Render service from render.yaml

1. Push `feat/rilis-mvp` to GitHub (public repo — Devpost requires the
   MIT LICENSE detectable at the repo root; it is).
2. Render Dashboard → **New → Blueprint** → connect the repo → Render
   reads `render.yaml` (one Node web service: build
   `npm install && npm run build`, start `npm start`, health check `/`).
   (Or create a Web Service manually with the same build/start commands.)
3. In the service's **Environment** tab, set every variable from step (b)
   (they are `sync: false` in `render.yaml`, i.e. entered by you, never
   committed).
4. Deploy, then **check the Render build log specifically for the native
   `better-sqlite3` build** — a green overall deploy is not enough:
   - In the build log, find the `better-sqlite3` install step (npm runs
     `node-gyp rebuild` for it). Success = that step completes without a
     `gyp ERR!` / compiler error, and the runtime log shows the app
     answering requests.
   - Confirm the running Node version in the log is 24 (`render.yaml`
     pins `NODE_VERSION: "24"`; better-sqlite3 13 requires Node >=22 and
     ships N-API prebuilds, and 24 is the locally verified runtime). If
     the log shows a different major, fix the env var before trusting
     the deploy. This pin is a reproducibility choice, **not** proof
     the Render build works — only this log check proves it.
   - **If the `better-sqlite3` native build fails in the Render log,**
     use this decision path, in order:
     1. Read the exact `gyp ERR!` lines. If it is a missing compiler/
        toolchain error, explicitly approve switching this service's
        build command (Render Dashboard → Settings → Build Command,
        overriding `render.yaml`) to
        `npm install --ignore-scripts && npm run build`, and record
        that approval + the date in step (f)'s submission notes. This
        variant is only acceptable because better-sqlite3 13 bundles a
        Linux x64 N-API prebuild (`prebuilds/linux-x64.node` in the
        published package, loaded directly by the package — the same
        mechanism verified locally on Windows with
        `npm install --ignore-scripts`, 117/117 tests green). It is
        **not** proven for Render's Linux image until step 2 passes.
     2. After redeploying with whichever build command, prove the
        bundled binary actually loads on Render: open the hosted URL,
        click **Reset demo**, and confirm the seeded project loads with
        both milestones (that path reads/writes SQLite). A 500 on
        `/api/state` or a `better-sqlite3` load error in the runtime
        log means the binary did not load — do not submit; revert to
        the compiling build command and fix the toolchain/Node-version
        issue first.
     3. Whichever path succeeded, note the working build command in
        your submission notes so the frozen hosted service can be
        reproduced.
5. Paste the hosted URL into `README.md` ("Hosted demo") and into
   `docs/submission/devpost-draft.md` ("Hosted demo URL"), and commit
   **before** submitting — after the Devpost submission the repo is
   frozen (step f).

Note: Render's filesystem is ephemeral. The SQLite DB re-seeds on boot —
acceptable for the seeded demo; a restart simply resets the demo.

## (d) Hosted verification (demo script + Reset)

On the **hosted URL** (not just localhost — the PayPal popup must work in
the hosted context), run the full demo end to end:

1. **Reset demo** (client role) → both milestones `DRAFT`.
2. Fund Milestone 1 ($200) with the sandbox buyer → `AUTHORIZED`, order +
   authorization IDs in the audit log.
3. Freelancer role → **Use sample deliverable** → submit → **Run agent
   check** → verdicts + score (provider = llm with your key, fallback
   without).
4. Auto-capture fires → `RELEASED`, capture ID in the log, ledger entry
   labelled **Simulated payout**.
5. Reset → fund + deliver Milestone 2 ($600) → `ESCALATED` → **Reject &
   void** → `VOIDED`.
6. **Reset demo** again so the next judge starts clean.

Only if this is fully green **and ≥ 2 hours remain** before the deadline,
consider the optional real-Payouts spike (time-boxed, behind the same UI,
spec Approach A stretch). Otherwise skip it — the labelled simulated
ledger release is the submitted design.

## (e) Record and upload the video

1. Follow `docs/submission/video-script.md` (6 parts, < 3 minutes)
   against the hosted demo.
2. Upload as a **public YouTube** video.
3. Paste the video URL into `docs/submission/devpost-draft.md` and commit
   before submitting (freeze rule).

## (f) Submit on Devpost, then freeze

1. Fill the Devpost form from `docs/submission/devpost-draft.md`:
   - Category targets: **Best Use of Agentic Commerce** (primary),
     **Best Use of PayPal + AI** (secondary).
   - Sponsor selection: **Render**.
   - Paste the hosted URL, public repo URL, video URL, sandbox buyer
     credentials, real-vs-simulated disclosure, and the AI-tools
     disclosure. Check no `OWNER TO FILL` placeholders remain.
2. Submit **before Nov 12, 2026, 12:00 PM PST**.
3. **Freeze:** after submitting, do not edit the repo, video, or linked
   materials until after the winner announcement (Dec 21, 2026). Keep
   the Render service and the PayPal sandbox app/buyer live and funded
   (sandbox) until Dec 21, 2026.

## Status of this list

- [ ] (a) PayPal sandbox Business app + Personal buyer created; spike run
- [ ] (b) Env secrets provided
- [ ] (c) Render service created from render.yaml and deployed
- [ ] (d) Hosted demo script + Reset verified on the hosted URL
- [ ] (e) Video recorded and uploaded (public, < 3 min)
- [ ] (f) Devpost submitted before Nov 12, 12:00 PM PST; repo frozen
