"use client";

import {
  formatMoney,
  formatTime,
  type Deliverable,
  type DemoState,
  type Milestone,
  type Project,
  type Role,
  type Verification,
} from "./demo-client";
import DeliverForm, { type DeliverPayload } from "./DeliverForm";
import FundingButton from "./FundingButton";
import VerdictPanel from "./VerdictPanel";

interface MilestoneDetailProps {
  milestone: Milestone;
  project: Project;
  role: Role;
  busyKey: string | null;
  deliverable: Deliverable | undefined;
  verification: Verification | undefined;
  onDeliver: (payload: DeliverPayload) => Promise<boolean>;
  onDecide: () => Promise<boolean>;
  onApprove: () => Promise<boolean>;
  onReject: () => Promise<boolean>;
  onRerun: () => Promise<boolean>;
  onState: (state: DemoState) => void;
  onFundingError: (message: string) => void;
}

export default function MilestoneDetail({
  milestone,
  project,
  role,
  busyKey,
  deliverable,
  verification,
  onDeliver,
  onDecide,
  onApprove,
  onReject,
  onRerun,
  onState,
  onFundingError,
}: MilestoneDetailProps) {
  const busy = busyKey !== null;
  const isClient = role === "client";
  const withinAutoPay = milestone.amountCents <= project.autoPayLimitCents;
  const showActions =
    milestone.state === "DELIVERED" ||
    milestone.state === "VERIFIED" ||
    milestone.state === "ESCALATED" ||
    milestone.state === "CAPTURED";

  return (
    <section className="panel milestone-detail" aria-label="Milestone detail">
      <div className="detail-head">
        <div>
          <h2>{milestone.title}</h2>
          <p className="muted">
            {withinAutoPay
              ? "Within the auto-pay limit — a passing check can be captured automatically."
              : "Above the auto-pay limit — even a passing check will be escalated to the client."}
          </p>
        </div>
        <div className="detail-amount">
          <span className="amount">{formatMoney(milestone.amountCents)}</span>
          <span className={`state-badge state-${milestone.state.toLowerCase()}`}>
            {milestone.state}
          </span>
        </div>
      </div>

      {milestone.state === "RELEASED" ? (
        <p className="banner success">
          Released. Capture {milestone.paypalCaptureId ?? ""} completed and a{" "}
          <strong>Simulated payout</strong> was recorded in the ledger.
        </p>
      ) : null}
      {milestone.state === "VOIDED" ? (
        <p className="banner danger-banner">
          Voided. The PayPal authorization hold was released unpaid.
        </p>
      ) : null}
      {milestone.state === "ESCALATED" ? (
        <p className="banner warning">
          Escalated to the client. Approve to capture despite the escalation,
          reject to void the hold, or adjust policy and re-run.
        </p>
      ) : null}

      <h3>Brief</h3>
      <p>{milestone.brief}</p>

      <h3>Checklist</h3>
      <ol className="checklist">
        {milestone.checklist.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>

      {milestone.paypalOrderId ||
      milestone.paypalAuthorizationId ||
      milestone.paypalCaptureId ? (
        <div className="paypal-box">
          <h3>PayPal hold</h3>
          <dl className="id-list">
            {milestone.paypalOrderId ? (
              <div>
                <dt>Order ID</dt>
                <dd className="mono">{milestone.paypalOrderId}</dd>
              </div>
            ) : null}
            {milestone.paypalAuthorizationId ? (
              <div>
                <dt>Authorization ID</dt>
                <dd className="mono">{milestone.paypalAuthorizationId}</dd>
              </div>
            ) : null}
            {milestone.paypalCaptureId ? (
              <div>
                <dt>Capture ID</dt>
                <dd className="mono">{milestone.paypalCaptureId}</dd>
              </div>
            ) : null}
            {milestone.authorizationExpiresAt ? (
              <div>
                <dt>Authorization expires</dt>
                <dd>{formatTime(milestone.authorizationExpiresAt)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}

      {milestone.state === "DRAFT" ? (
        <FundingButton
          milestone={milestone}
          role={role}
          onState={onState}
          onError={onFundingError}
        />
      ) : null}

      {deliverable ? (
        <div className="deliverable-box">
          <h3>Latest deliverable</h3>
          <p className="muted small">Submitted {formatTime(deliverable.createdAt)}</p>
          {deliverable.note ? <p>{deliverable.note}</p> : null}
          {deliverable.link ? (
            <p className="mono small">Link: {deliverable.link}</p>
          ) : null}
          {deliverable.filename ? (
            <p className="muted small">File: {deliverable.filename}</p>
          ) : null}
          {deliverable.extractedText ? (
            <details>
              <summary>File text</summary>
              <pre className="extracted-text">{deliverable.extractedText}</pre>
            </details>
          ) : null}
        </div>
      ) : null}

      {milestone.state === "AUTHORIZED" ? (
        <DeliverForm
          milestone={milestone}
          role={role}
          busy={busyKey === "deliver"}
          onDeliver={onDeliver}
        />
      ) : null}

      <VerdictPanel verification={verification} />

      {showActions ? (
        <div className="action-row">
          <h3 className="action-title">Actions</h3>
          {milestone.state === "DELIVERED" ? (
            <div className="action-item">
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={() => void onDecide()}
              >
                {busyKey === "decide" ? "Running agent check…" : "Run agent check"}
              </button>
              <span className="muted small">
                Available in both roles — this is the agent step.
              </span>
            </div>
          ) : null}

          {milestone.state === "ESCALATED" || milestone.state === "CAPTURED" ? (
            <div className="action-item">
              <button
                type="button"
                className="btn primary"
                disabled={!isClient || busy}
                onClick={() => void onApprove()}
              >
                {busyKey === "approve"
                  ? "Capturing…"
                  : milestone.state === "CAPTURED"
                    ? "Resume release"
                    : "Approve & capture"}
              </button>
              {!isClient ? (
                <span className="muted small">Client role only.</span>
              ) : null}
            </div>
          ) : null}

          {milestone.state === "VERIFIED" || milestone.state === "ESCALATED" ? (
            <div className="action-item">
              <button
                type="button"
                className="btn danger"
                disabled={!isClient || busy}
                onClick={() => void onReject()}
              >
                {busyKey === "reject" ? "Voiding…" : "Reject & void"}
              </button>
              {!isClient ? (
                <span className="muted small">Client role only.</span>
              ) : null}
            </div>
          ) : null}

          {milestone.state === "VERIFIED" ||
          milestone.state === "ESCALATED" ||
          milestone.state === "CAPTURED" ? (
            <div className="action-item">
              <button
                type="button"
                className="btn"
                disabled={!isClient || busy}
                onClick={() => void onRerun()}
              >
                {busyKey === "rerun" ? "Re-running…" : "Re-run policy"}
              </button>
              {!isClient ? (
                <span className="muted small">Client role only.</span>
              ) : (
                <span className="muted small">
                  Re-applies the current policy to the stored score.
                </span>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
