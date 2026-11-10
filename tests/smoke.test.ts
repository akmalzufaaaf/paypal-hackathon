import { describe, expect, it } from "vitest";
import { DEMO } from "../lib/constants";

describe("DEMO seeded constants", () => {
  it("matches the Global Constraints values", () => {
    expect(DEMO).toEqual({
      budgetCapCents: 100000,
      autoPayLimitCents: 25000,
      passThreshold: 80,
    });
  });
});
