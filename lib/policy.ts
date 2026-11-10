import type { PolicyInput } from "./types";

export function evaluatePolicy(i: PolicyInput): {
  action: "AUTO_CAPTURE" | "ESCALATE";
  reasons: string[];
} {
  const reasons: string[] = [];

  if (i.score < i.passThreshold) {
    reasons.push(
      `Score ${i.score} is below the pass threshold of ${i.passThreshold}`,
    );
  }
  if (i.amountCents > i.autoPayLimitCents) {
    reasons.push(
      `Amount ${i.amountCents} cents exceeds the auto-pay limit of ${i.autoPayLimitCents} cents`,
    );
  }
  if (i.capturedTotalCents + i.amountCents > i.budgetCapCents) {
    reasons.push(
      `Captured total ${i.capturedTotalCents} cents plus amount ${i.amountCents} cents exceeds the budget cap of ${i.budgetCapCents} cents`,
    );
  }

  if (reasons.length === 0) {
    return { action: "AUTO_CAPTURE", reasons: [] };
  }
  return { action: "ESCALATE", reasons };
}
