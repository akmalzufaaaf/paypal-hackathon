"use client";

import { useCallback, useEffect, useState } from "react";

import AuditLog from "@/components/AuditLog";
import MilestoneDetail from "@/components/MilestoneDetail";
import MilestoneList from "@/components/MilestoneList";
import PolicyPanel, { type PolicyPatch } from "@/components/PolicyPanel";
import ResetButton from "@/components/ResetButton";
import RoleSwitcher from "@/components/RoleSwitcher";
import type { DeliverPayload } from "@/components/DeliverForm";
import {
  loadDemoState,
  patchMutation,
  postMutation,
  type DemoState,
  type Role,
} from "@/components/demo-client";

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function Home() {
  const [state, setState] = useState<DemoState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("client");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadDemoState()
      .then((next) => {
        if (cancelled) return;
        setState(next);
        setLoadError(null);
        setSelectedId((current) =>
          current && next.milestones.some((m) => m.id === current)
            ? current
            : (next.milestones[0]?.id ?? null),
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(messageOf(err));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const runMutation = useCallback(
    async (key: string, fn: () => Promise<DemoState>): Promise<boolean> => {
      setBusyKey(key);
      setActionError(null);
      try {
        const next = await fn();
        setState(next);
        setSelectedId((current) =>
          current && next.milestones.some((m) => m.id === current)
            ? current
            : (next.milestones[0]?.id ?? null),
        );
        return true;
      } catch (err) {
        setActionError(messageOf(err));
        return false;
      } finally {
        setBusyKey(null);
      }
    },
    [],
  );

  const selected =
    state?.milestones.find((m) => m.id === selectedId) ??
    state?.milestones[0] ??
    null;

  const latestDeliverable = selected
    ? state?.deliverables.filter((d) => d.milestoneId === selected.id).at(-1)
    : undefined;
  const latestVerification = selected
    ? state?.verifications.filter((v) => v.milestoneId === selected.id).at(-1)
    : undefined;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>Rilis</h1>
          <p>
            Freelancer Money Agent — an agent holds a PayPal sandbox milestone
            payment, verifies the deliverable, then captures or escalates under
            policy guardrails.
          </p>
          {state ? <p className="muted small">Project: {state.project.title}</p> : null}
        </div>
        {state ? (
          <RoleSwitcher
            role={role}
            clientName={state.project.clientName}
            freelancerName={state.project.freelancerName}
            onRoleChange={setRole}
          />
        ) : null}
      </header>

      {actionError ? (
        <div className="alert global-alert" role="alert">
          <span>{actionError}</span>
          <button
            type="button"
            className="btn ghost small-btn"
            onClick={() => setActionError(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {!state && !loadError ? (
        <main className="panel loading-panel">
          <p>Loading demo state…</p>
        </main>
      ) : null}

      {!state && loadError ? (
        <main className="panel loading-panel">
          <p className="alert" role="alert">
            Could not load demo state: {loadError}
          </p>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setLoadError(null);
              setReloadKey((key) => key + 1);
            }}
          >
            Retry
          </button>
        </main>
      ) : null}

      {state && selected ? (
        <main className="panels">
          <MilestoneList
            project={state.project}
            milestones={state.milestones}
            selectedId={selected.id}
            onSelect={setSelectedId}
          />

          <MilestoneDetail
            milestone={selected}
            project={state.project}
            role={role}
            busyKey={busyKey}
            deliverable={latestDeliverable}
            verification={latestVerification}
            onDeliver={(payload: DeliverPayload) =>
              runMutation("deliver", () =>
                postMutation(`/api/milestones/${selected.id}/deliver`, {
                  note: payload.note,
                  link: payload.link,
                  filename: payload.filename,
                  extractedText: payload.extractedText,
                }),
              )
            }
            onDecide={() =>
              runMutation("decide", () =>
                postMutation(`/api/milestones/${selected.id}/decide`),
              )
            }
            onApprove={() =>
              runMutation("approve", () =>
                postMutation(`/api/milestones/${selected.id}/approve`),
              )
            }
            onReject={() =>
              runMutation("reject", () =>
                postMutation(`/api/milestones/${selected.id}/reject`),
              )
            }
            onRerun={() =>
              runMutation("rerun", () =>
                postMutation(`/api/milestones/${selected.id}/rerun`),
              )
            }
            onState={(next) => {
              setActionError(null);
              setState(next);
            }}
            onFundingError={(message) => setActionError(message)}
          />

          <div className="right-column">
            <AuditLog
              events={state.events}
              ledger={state.ledger}
              milestones={state.milestones}
            />
            <PolicyPanel
              key={`${state.project.budgetCapCents}-${state.project.autoPayLimitCents}-${state.project.passThreshold}`}
              project={state.project}
              role={role}
              busy={busyKey === "policy"}
              onSave={(patch: PolicyPatch) =>
                runMutation("policy", () =>
                  patchMutation("/api/policy", { ...patch }),
                )
              }
            />
            <ResetButton
              role={role}
              busy={busyKey === "reset"}
              onReset={() =>
                runMutation("reset", () => postMutation("/api/reset"))
              }
            />
          </div>
        </main>
      ) : null}

      <footer className="footer">
        <p>
          PayPal sandbox only — no real money moves. The payout shown in the
          ledger is a <strong>Simulated payout</strong>; PayPal order,
          authorization, capture, and void calls are real sandbox calls.
        </p>
      </footer>
    </div>
  );
}
