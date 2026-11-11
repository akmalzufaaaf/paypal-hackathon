"use client";

import { useState } from "react";
import Link from "next/link";

import { useApp } from "@/components/AppProvider";
import { journeyProgress } from "@/components/JourneyStepper";
import { formatMoney } from "@/components/demo-client";

const FILTERS = [
  "ALL",
  "DRAFT",
  "AUTHORIZED",
  "DELIVERED",
  "VERIFIED",
  "ESCALATED",
  "RELEASED",
  "VOIDED",
] as const;

export default function MilestonesPage() {
  const { state, loadError, retryLoad } = useApp();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");

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
            <p>Loading milestones…</p>
          )}
        </div>
      </main>
    );
  }

  const present = new Set(state.milestones.map((m) => m.state));
  const visible =
    filter === "ALL"
      ? state.milestones
      : state.milestones.filter((m) => m.state === filter);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Milestones</h1>
          <p className="muted">
            {state.project.title} — every milestone and where its money stands.
          </p>
        </div>
      </div>

      <div className="chip-row" role="group" aria-label="Filter by status">
        {FILTERS.filter((f) => f === "ALL" || present.has(f as never)).map(
          (f) => (
            <button
              key={f}
              type="button"
              className={filter === f ? "chip active" : "chip"}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ),
        )}
      </div>

      {visible.length === 0 ? (
        <div className="panel">
          <p className="muted">No milestones in this status.</p>
        </div>
      ) : (
        <div className="dash-cards">
          {visible.map((milestone) => {
            const done = journeyProgress(milestone.state);
            return (
              <Link
                key={milestone.id}
                href={`/milestones/${milestone.id}`}
                className="dash-card milestone-summary"
              >
                <span className="milestone-card-top">
                  <span className="milestone-card-title">{milestone.title}</span>
                  <span className="milestone-card-amount">
                    {formatMoney(milestone.amountCents)}
                  </span>
                </span>
                <span className="milestone-brief">{milestone.brief}</span>
                <span className="milestone-card-foot">
                  <span
                    className={`state-badge state-${milestone.state.toLowerCase()}`}
                  >
                    {milestone.state}
                  </span>
                  <span className="card-dots" aria-hidden="true">
                    {[0, 1, 2, 3, 4].map((index) => (
                      <span
                        key={index}
                        className={
                          index < done ? "card-dot dot-done" : "card-dot"
                        }
                      />
                    ))}
                  </span>
                </span>
                <span className="dash-card-link">View status →</span>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
