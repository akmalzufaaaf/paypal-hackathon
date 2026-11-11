"use client";

import { useRouter } from "next/navigation";

import { useApp } from "@/components/AppProvider";
import PolicyPanel, { type PolicyPatch } from "@/components/PolicyPanel";
import ResetButton from "@/components/ResetButton";
import { formatMoney, patchMutation, postMutation } from "@/components/demo-client";
import { clearSession, initials } from "@/components/session";

export default function ProfilePage() {
  const app = useApp();
  const { session, state, busyKey } = app;
  const router = useRouter();

  function switchAccount() {
    clearSession();
    router.replace("/login");
  }

  return (
    <main className="page narrow-page">
      <div className="page-head">
        <div>
          <h1>Profile</h1>
          <p className="muted">Your demo account, project, and agent policy.</p>
        </div>
      </div>

      <section className="panel profile-card" aria-label="Your account">
        <span className="avatar large" aria-hidden="true">
          {initials(session.name)}
        </span>
        <div className="profile-meta">
          <h2>{session.name}</h2>
          <p className="muted">
            {session.email} · {session.location}
          </p>
          <span
            className={`state-badge ${session.role === "client" ? "state-delivered" : "state-authorized"}`}
          >
            {session.role === "client" ? "CLIENT" : "FREELANCER"}
          </span>
        </div>
        <button type="button" className="btn" onClick={switchAccount}>
          Switch account
        </button>
      </section>

      {state ? (
        <>
          <section className="panel" aria-label="Project">
            <h2>Project</h2>
            <p className="project-title">{state.project.title}</p>
            <dl className="profile-facts">
              <div>
                <dt>Client</dt>
                <dd>{state.project.clientName}</dd>
              </div>
              <div>
                <dt>Freelancer</dt>
                <dd>{state.project.freelancerName}</dd>
              </div>
              <div>
                <dt>Budget cap</dt>
                <dd>{formatMoney(state.project.budgetCapCents)}</dd>
              </div>
              <div>
                <dt>Auto-pay limit</dt>
                <dd>{formatMoney(state.project.autoPayLimitCents)}</dd>
              </div>
              <div>
                <dt>AI pass threshold</dt>
                <dd>{state.project.passThreshold}</dd>
              </div>
              <div>
                <dt>Milestones</dt>
                <dd>{state.milestones.length}</dd>
              </div>
            </dl>
          </section>

          <PolicyPanel
            key={`${state.project.budgetCapCents}-${state.project.autoPayLimitCents}-${state.project.passThreshold}`}
            project={state.project}
            role={session.role}
            busy={busyKey !== null}
            onSave={(patch: PolicyPatch) =>
              app.runMutation("policy", () =>
                patchMutation("/api/policy", { ...patch }),
              )
            }
          />

          <ResetButton
            role={session.role}
            busy={busyKey !== null}
            onReset={() =>
              app.runMutation("reset", () => postMutation("/api/reset"))
            }
          />
        </>
      ) : (
        <div className="panel loading-panel">
          <p>Loading project…</p>
        </div>
      )}

      <section className="panel" aria-label="Session">
        <h2>Session</h2>
        <p className="muted small">
          Demo login — this session is stored only in your browser
          (localStorage) and gates which actions you can take. PayPal runs on
          the sandbox; no real money moves.
        </p>
        <button type="button" className="btn danger" onClick={switchAccount}>
          Log out
        </button>
      </section>
    </main>
  );
}
