"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

  // One global mutation lock for every mutating path (API mutations and
  // PayPal funding). `busyRef` blocks re-entry synchronously (before React
  // re-renders disabled controls), and `seqRef` tags the lock owner: only
  // the current owner's response may replace state or clear the lock, so a
  // late response from a superseded call can never overwrite newer state.
  const busyRef = useRef(false);
  const seqRef = useRef(0);
  const fundingSeqRef = useRef<number | null>(null);

  const acquireLock = useCallback((key: string): number | null => {
    if (busyRef.current) return null;
    busyRef.current = true;
    const seq = ++seqRef.current;
    setBusyKey(key);
    return seq;
  }, []);

  const releaseLock = useCallback((seq: number): void => {
    if (seq !== seqRef.current) return;
    busyRef.current = false;
    setBusyKey(null);
  }, []);

  const applyState = useCallback((next: DemoState, seq: number): boolean => {
    if (seq !== seqRef.current) return false;
    setState(next);
    setSelectedId((current) =>
      current && next.milestones.some((m) => m.id === current)
        ? current
        : (next.milestones[0]?.id ?? null),
    );
    return true;
  }, []);

  const runMutation = useCallback(
    async (key: string, fn: () => Promise<DemoState>): Promise<boolean> => {
      const seq = acquireLock(key);
      if (seq === null) return false; // another mutation already owns the lock
      setActionError(null);
      try {
        const next = await fn();
        return applyState(next, seq);
      } catch (err) {
        if (seq === seqRef.current) setActionError(messageOf(err));
        return false;
      } finally {
        releaseLock(seq);
      }
    },
    [acquireLock, applyState, releaseLock],
  );

  // PayPal create-order/authorize pending is tracked through the same lock:
  // FundingButton reports each in-flight call, and only a state delivered
  // while that funding sequence still owns the lock is applied.
  const handleFundingPendingChange = useCallback(
    (pending: boolean): boolean => {
      if (pending) {
        if (fundingSeqRef.current !== null) return false; // already in flight
        const seq = acquireLock("funding");
        if (seq === null) return false;
        fundingSeqRef.current = seq;
        return true;
      }
      const seq = fundingSeqRef.current;
      fundingSeqRef.current = null;
      if (seq !== null) releaseLock(seq);
      return true;
    },
    [acquireLock, releaseLock],
  );

  const handleFundingState = useCallback(
    (next: DemoState): void => {
      const seq = fundingSeqRef.current;
      if (seq === null) return; // stale funding callback — no longer tracked
      setActionError(null);
      applyState(next, seq);
    },
    [applyState],
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
            onState={handleFundingState}
            onFundingError={(message) => setActionError(message)}
            onFundingPendingChange={handleFundingPendingChange}
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
              busy={busyKey !== null}
              onSave={(patch: PolicyPatch) =>
                runMutation("policy", () =>
                  patchMutation("/api/policy", { ...patch }),
                )
              }
            />
            <ResetButton
              role={role}
              busy={busyKey !== null}
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
