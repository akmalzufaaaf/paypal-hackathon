import { describe, expect, it } from "vitest";
import { canTransition } from "../lib/transitions";
import type { MilestoneState } from "../lib/types";

// Controller ruling correction: exactly these 9 edges. Terminal RELEASED/VOIDED allow no exits.
const ALLOWED: ReadonlyArray<readonly [MilestoneState, MilestoneState]> = [
  ["DRAFT", "AUTHORIZED"],
  ["AUTHORIZED", "DELIVERED"],
  ["DELIVERED", "VERIFIED"],
  ["VERIFIED", "CAPTURED"],
  ["VERIFIED", "ESCALATED"],
  ["ESCALATED", "CAPTURED"],
  ["CAPTURED", "RELEASED"],
  ["VERIFIED", "VOIDED"],
  ["ESCALATED", "VOIDED"],
];

const ALL_STATES: MilestoneState[] = [
  "DRAFT",
  "AUTHORIZED",
  "DELIVERED",
  "VERIFIED",
  "ESCALATED",
  "CAPTURED",
  "RELEASED",
  "VOIDED",
];

describe("canTransition", () => {
  it("allows DRAFT -> AUTHORIZED", () => {
    expect(canTransition("DRAFT", "AUTHORIZED")).toBe(true);
  });

  it("allows ESCALATED -> CAPTURED", () => {
    expect(canTransition("ESCALATED", "CAPTURED")).toBe(true);
  });

  it("allows CAPTURED -> RELEASED", () => {
    expect(canTransition("CAPTURED", "RELEASED")).toBe(true);
  });

  it("rejects RELEASED -> VOIDED (terminal)", () => {
    expect(canTransition("RELEASED", "VOIDED")).toBe(false);
  });

  it("rejects DRAFT -> RELEASED", () => {
    expect(canTransition("DRAFT", "RELEASED")).toBe(false);
  });

  it("rejects AUTHORIZED -> CAPTURED", () => {
    expect(canTransition("AUTHORIZED", "CAPTURED")).toBe(false);
  });

  it("allows VERIFIED -> ESCALATED", () => {
    expect(canTransition("VERIFIED", "ESCALATED")).toBe(true);
  });

  it("rejects VERIFIED -> RELEASED (must go via CAPTURED)", () => {
    expect(canTransition("VERIFIED", "RELEASED")).toBe(false);
  });

  it("rejects ESCALATED -> RELEASED (must go via CAPTURED)", () => {
    expect(canTransition("ESCALATED", "RELEASED")).toBe(false);
  });

  it("allows exactly the ruled set across all state pairs", () => {
    const allowed = new Set(ALLOWED.map(([from, to]) => `${from}->${to}`));
    for (const from of ALL_STATES) {
      for (const to of ALL_STATES) {
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(
          allowed.has(`${from}->${to}`),
        );
      }
    }
  });

  it("allows no exits from terminal states RELEASED and VOIDED", () => {
    for (const terminal of ["RELEASED", "VOIDED"] as const) {
      for (const to of ALL_STATES) {
        expect(canTransition(terminal, to)).toBe(false);
      }
    }
  });
});
