"use client";

import { formatMoney, type Milestone, type Project } from "./demo-client";

interface MilestoneListProps {
  project: Project;
  milestones: Milestone[];
  selectedId: string | null;
  onSelect: (milestoneId: string) => void;
}

const HELD_STATES = new Set(["AUTHORIZED", "DELIVERED", "VERIFIED", "ESCALATED"]);

export default function MilestoneList({
  project,
  milestones,
  selectedId,
  onSelect,
}: MilestoneListProps) {
  const capturedCents = milestones
    .filter((m) => m.state === "CAPTURED" || m.state === "RELEASED")
    .reduce((sum, m) => sum + m.amountCents, 0);
  const heldCents = milestones
    .filter((m) => HELD_STATES.has(m.state))
    .reduce((sum, m) => sum + m.amountCents, 0);
  const capPercent =
    project.budgetCapCents > 0
      ? Math.min(100, Math.round((capturedCents / project.budgetCapCents) * 100))
      : 0;

  return (
    <section className="panel milestone-list" aria-label="Milestones">
      <h2>Milestones</h2>
      <p className="project-title">{project.title}</p>
      <p className="muted">
        Client: {project.clientName}
        <br />
        Freelancer: {project.freelancerName}
      </p>

      <div className="milestone-cards">
        {milestones.map((milestone) => (
          <button
            key={milestone.id}
            type="button"
            className={
              milestone.id === selectedId
                ? "milestone-card selected"
                : "milestone-card"
            }
            aria-pressed={milestone.id === selectedId}
            onClick={() => onSelect(milestone.id)}
          >
            <span className="milestone-card-top">
              <span className="milestone-card-title">{milestone.title}</span>
              <span className="milestone-card-amount">
                {formatMoney(milestone.amountCents)}
              </span>
            </span>
            <span className={`state-badge state-${milestone.state.toLowerCase()}`}>
              {milestone.state}
            </span>
          </button>
        ))}
      </div>

      <div className="budget-cap">
        <div className="budget-cap-head">
          <span>Budget cap</span>
          <span>
            {formatMoney(capturedCents)} captured of {formatMoney(project.budgetCapCents)}
          </span>
        </div>
        <div
          className="budget-bar"
          role="progressbar"
          aria-valuenow={capPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Captured amount against budget cap"
        >
          <div className="budget-bar-fill" style={{ width: `${capPercent}%` }} />
        </div>
        <p className="muted small">
          {capPercent}% of cap used
          {heldCents > 0 ? ` · ${formatMoney(heldCents)} currently on hold` : ""}
          . The budget cap is a hard ceiling — approvals cannot exceed it.
        </p>
      </div>

      <dl className="policy-summary">
        <div>
          <dt>Auto-pay limit</dt>
          <dd>{formatMoney(project.autoPayLimitCents)}</dd>
        </div>
        <div>
          <dt>AI pass threshold</dt>
          <dd>{project.passThreshold}</dd>
        </div>
      </dl>
    </section>
  );
}
