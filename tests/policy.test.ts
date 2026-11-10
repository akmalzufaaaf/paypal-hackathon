import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "../lib/policy";
import type { PolicyInput } from "../lib/types";

const base: PolicyInput = {
  score: 86,
  passThreshold: 80,
  amountCents: 20000,
  autoPayLimitCents: 25000,
  capturedTotalCents: 0,
  budgetCapCents: 100000,
};

describe("evaluatePolicy", () => {
  it("auto-captures when score, limit, and cap all pass", () => {
    expect(evaluatePolicy(base)).toEqual({ action: "AUTO_CAPTURE", reasons: [] });
  });

  it("auto-captures at exact boundaries (score == threshold, amount == limit, captured + amount == cap)", () => {
    expect(
      evaluatePolicy({
        score: 80,
        passThreshold: 80,
        amountCents: 25000,
        autoPayLimitCents: 25000,
        capturedTotalCents: 75000,
        budgetCapCents: 100000,
      }),
    ).toEqual({ action: "AUTO_CAPTURE", reasons: [] });
  });

  it("escalates when score is below threshold (79 < 80)", () => {
    const result = evaluatePolicy({ ...base, score: 79 });
    expect(result.action).toBe("ESCALATE");
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toMatch(/score/i);
  });

  it("escalates when amount exceeds the auto-pay limit (60000 > 25000)", () => {
    const result = evaluatePolicy({ ...base, amountCents: 60000 });
    expect(result.action).toBe("ESCALATE");
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toMatch(/auto-pay|limit/i);
  });

  it("escalates when captured total + amount would exceed the budget cap (80000 + 30000 > 100000)", () => {
    const result = evaluatePolicy({
      ...base,
      amountCents: 30000,
      autoPayLimitCents: 50000,
      capturedTotalCents: 80000,
      budgetCapCents: 100000,
    });
    expect(result.action).toBe("ESCALATE");
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toMatch(/budget|cap/i);
  });

  it("returns one reason per failed rule when multiple rules fail", () => {
    const result = evaluatePolicy({
      score: 10,
      passThreshold: 80,
      amountCents: 60000,
      autoPayLimitCents: 25000,
      capturedTotalCents: 80000,
      budgetCapCents: 100000,
    });
    expect(result.action).toBe("ESCALATE");
    expect(result.reasons).toHaveLength(3);
  });
});
