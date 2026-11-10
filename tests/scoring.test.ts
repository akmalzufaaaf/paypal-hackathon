import { describe, expect, it } from "vitest";
import { computeScore } from "../lib/scoring";
import type { ItemVerdict } from "../lib/types";

function item(verdict: ItemVerdict["verdict"], requirement = "req"): ItemVerdict {
  return { requirement, verdict, evidence: "" };
}

describe("computeScore", () => {
  it("scores 4 pass / 1 fail as 80", () => {
    expect(
      computeScore([item("pass"), item("pass"), item("pass"), item("pass"), item("fail")]),
    ).toBe(80);
  });

  it("scores all-unclear as 0", () => {
    expect(computeScore([item("unclear"), item("unclear"), item("unclear")])).toBe(0);
  });

  it("scores an empty list as 0", () => {
    expect(computeScore([])).toBe(0);
  });

  it("counts unclear as not-pass alongside fail", () => {
    expect(computeScore([item("pass"), item("unclear"), item("fail"), item("pass")])).toBe(50);
  });

  it("rounds to the nearest integer", () => {
    expect(computeScore([item("pass"), item("pass"), item("fail")])).toBe(67);
    expect(computeScore([item("pass"), item("fail"), item("fail")])).toBe(33);
  });

  it("scores all-pass as 100", () => {
    expect(computeScore([item("pass"), item("pass")])).toBe(100);
  });
});
