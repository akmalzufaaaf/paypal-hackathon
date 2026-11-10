"use client";

import type { Verification } from "./demo-client";

interface VerdictPanelProps {
  verification: Verification | undefined;
}

export default function VerdictPanel({ verification }: VerdictPanelProps) {
  if (!verification) {
    return (
      <section className="verdict-panel" aria-label="AI verdict">
        <h3>Agent verdict</h3>
        <p className="muted">
          No verification yet. After a deliverable is submitted, choose{" "}
          <strong>Run agent check</strong> and the agent will score it against
          the checklist above.
        </p>
      </section>
    );
  }

  const passCount = verification.items.filter(
    (item) => item.verdict === "pass",
  ).length;
  const providerLabel =
    verification.provider === "llm"
      ? "AI (LLM) verification"
      : "Deterministic fallback verification (no AI key)";

  return (
    <section className="verdict-panel" aria-label="AI verdict">
      <h3>Agent verdict</h3>
      <div className="verdict-head">
        <span className="verdict-score">{verification.score}</span>
        <span className="muted">
          {passCount} of {verification.items.length} checklist items pass
          <br />
          {providerLabel}
        </span>
      </div>
      <p>{verification.summary}</p>
      <ul className="verdict-items">
        {verification.items.map((item, index) => (
          <li key={`${index}-${item.requirement}`} className="verdict-item">
            <span className={`verdict-badge verdict-${item.verdict}`}>
              {item.verdict}
            </span>
            <span className="verdict-text">
              <strong>{item.requirement}</strong>
              <span className="muted">{item.evidence}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="muted small">
        The verifier only advises. Code computes the score and the policy table
        decides whether money moves.
      </p>
    </section>
  );
}
