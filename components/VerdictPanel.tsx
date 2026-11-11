"use client";

import type { Verification } from "./demo-client";

interface VerdictPanelProps {
  verification: Verification | undefined;
  passThreshold?: number;
}

function VerdictIcon({ verdict }: { verdict: string }) {
  if (verdict === "pass") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path
          d="M13.3 4.3 6.4 11.2 2.7 7.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (verdict === "fail") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path
          d="m4 4 8 8M12 4l-8 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M5.8 6.2A2.3 2.3 0 1 1 8 8.3c-.7.3-1 .8-1 1.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <circle cx="7" cy="12.6" r="1.3" fill="currentColor" />
    </svg>
  );
}

export default function VerdictPanel({
  verification,
  passThreshold,
}: VerdictPanelProps) {
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
  const threshold = passThreshold ?? 80;
  const meetsThreshold = verification.score >= threshold;

  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.min(100, Math.max(0, verification.score)) / 100) * circumference;

  return (
    <section className="verdict-panel" aria-label="AI verdict">
      <h3>Agent verdict</h3>
      <div className="verdict-head">
        <div
          className={`score-ring ${meetsThreshold ? "ring-pass" : "ring-below"}`}
          role="img"
          aria-label={`Score ${verification.score} out of 100. Pass threshold is ${threshold}. ${meetsThreshold ? "Meets" : "Below"} threshold.`}
        >
          <svg viewBox="0 0 84 84" aria-hidden="true" focusable="false">
            <circle className="ring-track" cx="42" cy="42" r={radius} />
            <circle
              className="ring-fill"
              cx="42"
              cy="42"
              r={radius}
              strokeDasharray={`${filled} ${circumference}`}
            />
          </svg>
          <span className="verdict-score">{verification.score}</span>
        </div>
        <div className="verdict-meta">
          <span
            className={`threshold-badge ${meetsThreshold ? "threshold-met" : "threshold-missed"}`}
          >
            {meetsThreshold
              ? `Meets the ${threshold} threshold`
              : `Below the ${threshold} threshold`}
          </span>
          <span className="muted">
            {passCount} of {verification.items.length} checklist items pass
            <br />
            {providerLabel}
          </span>
        </div>
      </div>
      <p>{verification.summary}</p>
      <ul className="verdict-items">
        {verification.items.map((item, index) => (
          <li key={`${index}-${item.requirement}`} className="verdict-item">
            <span className={`verdict-badge verdict-${item.verdict}`}>
              <VerdictIcon verdict={item.verdict} />
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
