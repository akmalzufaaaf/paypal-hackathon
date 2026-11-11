"use client";

import Link from "next/link";

import { useApp } from "@/components/AppProvider";
import { journeyProgress } from "@/components/JourneyStepper";
import {
  formatMoney,
  formatTime,
  type Milestone,
} from "@/components/demo-client";

const HELD_STATES = new Set(["AUTHORIZED", "DELIVERED", "VERIFIED", "ESCALATED"]);

function MilestoneSummaryCard({ milestone }: { milestone: Milestone }) {
  const done = journeyProgress(milestone.state);
  return (
    <Link
      href={`/milestones/${milestone.id}`}
      className="dash-card milestone-summary"
    >
      <span className="milestone-card-top">
        <span className="milestone-card-title">{milestone.title}</span>
        <span className="milestone-card-amount">
          {formatMoney(milestone.amountCents)}
        </span>
      </span>
      <span className="milestone-card-foot">
        <span className={`state-badge state-${milestone.state.toLowerCase()}`}>
          {milestone.state}
        </span>
        <span className="card-dots" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((index) => (
            <span
              key={index}
              className={index < done ? "card-dot dot-done" : "card-dot"}
            />
          ))}
        </span>
      </span>
      <span className="dash-card-link">View status →</span>
    </Link>
  );
}

export default function DashboardPage() {
  const { session, state, loadError, retryLoad } = useApp();

  if (!state) {
    return (
      <main className="page">
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
            <p>Loading dashboard…</p>
          )}
        </div>
      </main>
    );
  }

  const { project, milestones, events } = state;
  const releasedCents = milestones
    .filter((m) => m.state === "CAPTURED" || m.state === "RELEASED")
    .reduce((sum, m) => sum + m.amountCents, 0);
  const heldCents = milestones
    .filter((m) => HELD_STATES.has(m.state))
    .reduce((sum, m) => sum + m.amountCents, 0);
  const needsAttention = milestones.filter(
    (m) => m.state === "ESCALATED" || m.state === "DELIVERED",
  ).length;
  const capPercent =
    project.budgetCapCents > 0
      ? Math.min(100, Math.round((releasedCents / project.budgetCapCents) * 100))
      : 0;
  const recentEvents = [...events].slice(-5).reverse();

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">
            Welcome back, {session.name}. {project.title} —{" "}
            {session.role === "client"
              ? "you fund and approve."
              : "you deliver and get released."}
          </p>
        </div>
        <span className="sandbox-badge">PayPal Sandbox</span>
      </div>

      <section className="kpi-grid" aria-label="Money overview">
        <div className="kpi-card">
          <span className="kpi-label">On hold now</span>
          <strong className="kpi-value held">{formatMoney(heldCents)}</strong>
          <span className="muted small">Reserved by PayPal, not yet paid</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Released</span>
          <strong className="kpi-value released">
            {formatMoney(releasedCents)}
          </strong>
          <span className="muted small">Simulated payouts in the ledger</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Budget cap used</span>
          <strong className="kpi-value">
            {capPercent}
            <span className="stat-unit">%</span>
          </strong>
          <div
            className="budget-bar"
            role="progressbar"
            aria-valuenow={capPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Released amount against budget cap"
          >
            <div
              className="budget-bar-fill"
              style={{ width: `${capPercent}%` }}
            />
          </div>
          <span className="muted small">
            of {formatMoney(project.budgetCapCents)} hard cap
          </span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Needs attention</span>
          <strong className="kpi-value attention">{needsAttention}</strong>
          <span className="muted small">
            Milestones waiting for a check or a client decision
          </span>
        </div>
      </section>

      <section aria-label="Milestones" className="dash-section">
        <div className="section-head">
          <h2>Milestones</h2>
          <Link href="/milestones" className="text-link">
            View all →
          </Link>
        </div>
        <div className="dash-cards">
          {milestones.map((milestone) => (
            <MilestoneSummaryCard key={milestone.id} milestone={milestone} />
          ))}
        </div>
      </section>

      <section aria-label="Recent activity" className="dash-section">
        <div className="section-head">
          <h2>Recent activity</h2>
          <Link href="/activity" className="text-link">
            Full audit log →
          </Link>
        </div>
        <div className="panel">
          {recentEvents.length === 0 ? (
            <p className="muted small">No events yet.</p>
          ) : (
            <ol className="event-list timeline">
              {recentEvents.map((event) => (
                <li key={event.id} className="event-entry">
                  <div className="event-head">
                    <span className={`actor-badge actor-${event.actor}`}>
                      {event.actor}
                    </span>
                    <span className="event-action">{event.action}</span>
                    <time className="muted small">
                      {formatTime(event.createdAt)}
                    </time>
                  </div>
                  <p className="event-detail">{event.detail}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </main>
  );
}
