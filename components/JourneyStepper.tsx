"use client";

import type { MilestoneState } from "@/lib/types";

export type StepStatus = "done" | "current" | "todo" | "warning" | "danger";

export interface JourneyStep {
  label: string;
  status: StepStatus;
}

const BASE_STEPS = ["Draft", "Funded", "Delivered", "Verified"] as const;

/**
 * Status of the four main-path steps per milestone state. Escalation,
 * capture, release, and void all happen after the agent check, so
 * "Verified" is done in those states.
 */
const BASE_STATUS: Record<MilestoneState, StepStatus[]> = {
  DRAFT: ["current", "todo", "todo", "todo"],
  AUTHORIZED: ["done", "current", "todo", "todo"],
  DELIVERED: ["done", "done", "current", "todo"],
  VERIFIED: ["done", "done", "done", "current"],
  ESCALATED: ["done", "done", "done", "done"],
  CAPTURED: ["done", "done", "done", "done"],
  RELEASED: ["done", "done", "done", "done"],
  VOIDED: ["done", "done", "done", "done"],
};

export function journeySteps(state: MilestoneState): JourneyStep[] {
  const steps: JourneyStep[] = BASE_STEPS.map((label, index) => ({
    label,
    status: BASE_STATUS[state][index],
  }));

  switch (state) {
    case "RELEASED":
      steps.push({ label: "Released", status: "done" });
      break;
    case "CAPTURED":
      steps.push({ label: "Released", status: "current" });
      break;
    case "ESCALATED":
      steps.push({ label: "Client review", status: "warning" });
      break;
    case "VOIDED":
      steps.push({ label: "Voided", status: "danger" });
      break;
    default:
      steps.push({ label: "Released", status: "todo" });
  }
  return steps;
}

const STATUS_TEXT: Record<StepStatus, string> = {
  done: "completed",
  current: "current step",
  todo: "not reached yet",
  warning: "needs client decision",
  danger: "ended unpaid",
};

export default function JourneyStepper({ state }: { state: MilestoneState }) {
  const steps = journeySteps(state);
  return (
    <ol className="journey" aria-label={`Milestone journey: ${state}`}>
      {steps.map((step) => (
        <li
          key={step.label}
          className={`journey-step step-${step.status}`}
          aria-current={step.status === "current" ? "step" : undefined}
        >
          <span className="journey-dot" aria-hidden="true" />
          <span className="journey-label">{step.label}</span>
          <span className="visually-hidden">{STATUS_TEXT[step.status]}</span>
        </li>
      ))}
    </ol>
  );
}

/** Compact 5-dot progress for milestone cards. Returns done-count of 5. */
export function journeyProgress(state: MilestoneState): number {
  const steps = journeySteps(state);
  return steps.filter((s) => s.status === "done").length;
}
