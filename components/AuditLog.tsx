"use client";

import {
  formatMoney,
  formatTime,
  type AgentEvent,
  type LedgerEntry,
  type Milestone,
} from "./demo-client";

interface AuditLogProps {
  events: AgentEvent[];
  ledger: LedgerEntry[];
  milestones: Milestone[];
}

export default function AuditLog({ events, ledger, milestones }: AuditLogProps) {
  const titleById = new Map(milestones.map((m) => [m.id, m.title]));
  const withPayPalIds = milestones.filter(
    (m) => m.paypalOrderId || m.paypalAuthorizationId || m.paypalCaptureId,
  );

  return (
    <section className="panel audit-log" aria-label="Agent audit log">
      <h2>Agent audit log</h2>

      <h3 className="audit-subhead">Ledger</h3>
      {ledger.length === 0 ? (
        <p className="muted small">No payouts yet.</p>
      ) : (
        <ul className="ledger-list">
          {ledger.map((entry) => (
            <li key={entry.id} className="ledger-entry">
              <span className="simulated-label">Simulated payout</span>
              <span>
                {formatMoney(entry.amountCents)} —{" "}
                {titleById.get(entry.milestoneId) ?? entry.milestoneId}
              </span>
              <span className="muted small">
                Status: {entry.status} · {formatTime(entry.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="audit-subhead">PayPal references</h3>
      {withPayPalIds.length === 0 ? (
        <p className="muted small">
          No PayPal order, authorization, or capture IDs yet. Fund a milestone
          to create them.
        </p>
      ) : (
        <ul className="paypal-refs">
          {withPayPalIds.map((milestone) => (
            <li key={milestone.id}>
              <strong>{milestone.title}</strong>
              {milestone.paypalOrderId ? (
                <span className="mono">Order: {milestone.paypalOrderId}</span>
              ) : null}
              {milestone.paypalAuthorizationId ? (
                <span className="mono">
                  Authorization: {milestone.paypalAuthorizationId}
                </span>
              ) : null}
              {milestone.paypalCaptureId ? (
                <span className="mono">Capture: {milestone.paypalCaptureId}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <h3 className="audit-subhead">Events</h3>
      {events.length === 0 ? (
        <p className="muted small">No events yet.</p>
      ) : (
        <ol className="event-list">
          {events.map((event) => (
            <li key={event.id} className="event-entry">
              <div className="event-head">
                <span className={`actor-badge actor-${event.actor}`}>
                  {event.actor}
                </span>
                <span className="event-action">{event.action}</span>
                <time className="muted small">{formatTime(event.createdAt)}</time>
              </div>
              <p className="event-detail">{event.detail}</p>
              {event.milestoneId ? (
                <p className="muted small mono">{event.milestoneId}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
