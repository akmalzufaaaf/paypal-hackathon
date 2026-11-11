"use client";

import { useApp } from "@/components/AppProvider";
import AuditLog from "@/components/AuditLog";

export default function ActivityPage() {
  const { state, loadError, retryLoad } = useApp();

  return (
    <main className="page narrow-page">
      <div className="page-head">
        <div>
          <h1>Activity</h1>
          <p className="muted">
            Every agent decision, PayPal reference, and ledger entry — the full
            audit trail.
          </p>
        </div>
      </div>

      {!state ? (
        <div className="panel loading-panel">
          {loadError ? (
            <>
              <p className="alert" role="alert">
                Could not load demo state: {loadError}
              </p>
              <button type="button" className="btn primary" onClick={retryLoad}>
                Retry
              </button>
            </>
          ) : (
            <p>Loading activity…</p>
          )}
        </div>
      ) : (
        <AuditLog
          events={state.events}
          ledger={state.ledger}
          milestones={state.milestones}
        />
      )}
    </main>
  );
}
