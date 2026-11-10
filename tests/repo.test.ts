import { beforeEach, describe, expect, it } from "vitest";

// Must be set before any getDb() call; repo/db open the DB lazily.
process.env.RILIS_DB_PATH = ":memory:";

import {
  DEMO,
  MILESTONE1_CHECKLIST,
  MILESTONE2_CHECKLIST,
  SAMPLE_DELIVERABLE_NOTE,
} from "../lib/constants";
import { getDb } from "../lib/db";
import {
  capturedTotalCents,
  getState,
  insertDeliverable,
  insertEvent,
  insertLedgerRelease,
  insertVerification,
  resetDemo,
  updateMilestone,
} from "../lib/repo";

beforeEach(() => {
  resetDemo();
});

describe("seed", () => {
  it("creates exactly one project with the brief's exact fields and DEMO policy", () => {
    const { project, milestones } = getState();
    expect(project.title).toBe("Brand logo for Sarah's coffee startup");
    expect(project.clientName).toBe("Sarah (Austin, US)");
    expect(project.freelancerName).toBe("Bima (Yogyakarta, ID)");
    expect(project.budgetCapCents).toBe(DEMO.budgetCapCents);
    expect(project.autoPayLimitCents).toBe(DEMO.autoPayLimitCents);
    expect(project.passThreshold).toBe(DEMO.passThreshold);
    expect(milestones).toHaveLength(2);
  });

  it("seeds Milestone 1 at 20000 and Milestone 2 at 60000, both DRAFT", () => {
    const { milestones } = getState();
    const [m1, m2] = milestones;
    expect(m1.title).toBe("Primary logo concepts");
    expect(m1.amountCents).toBe(20000);
    expect(m1.state).toBe("DRAFT");
    expect(m2.title).toBe("Full brand kit");
    expect(m2.amountCents).toBe(60000);
    expect(m2.state).toBe("DRAFT");
  });

  it("seeds 5-item checklists from lib/constants, stored per milestone", () => {
    const { milestones } = getState();
    expect(MILESTONE1_CHECKLIST).toHaveLength(5);
    expect(MILESTONE2_CHECKLIST).toHaveLength(5);
    expect(milestones[0].checklist).toEqual(MILESTONE1_CHECKLIST);
    expect(milestones[1].checklist).toEqual(MILESTONE2_CHECKLIST);
    expect(milestones[0].brief.length).toBeGreaterThan(0);
    expect(milestones[1].brief.length).toBeGreaterThan(0);
  });

  it("seeds PayPal id fields as null", () => {
    const { milestones } = getState();
    for (const m of milestones) {
      expect(m.paypalOrderId).toBeNull();
      expect(m.paypalAuthorizationId).toBeNull();
      expect(m.paypalCaptureId).toBeNull();
      expect(m.authorizationExpiresAt).toBeNull();
      expect(m.fundingAttemptId).toBeNull();
    }
  });
});

describe("seeded checklist + sample deliverable (deterministic fallback contract)", () => {
  it("sample note covers exactly 4 of the 5 Milestone-1 requirements by distinctive keyword", () => {
    const note = SAMPLE_DELIVERABLE_NOTE.toLowerCase();
    // Covered: logo, coffee, vector/SVG, colour palette
    expect(note).toContain("logo");
    expect(note).toContain("coffee");
    expect(note).toContain("svg");
    expect(note).toContain("colour palette");
    // Missed: the variations requirement — none of its keywords may appear
    for (const missed of [
      "variation",
      "stacked",
      "horizontal",
      "lockup",
      "light",
      "dark",
      "background",
      "monochrome",
    ]) {
      expect(note).not.toContain(missed);
    }
  });

  it("every Milestone-1 checklist item carries its distinctive keyword", () => {
    const items = MILESTONE1_CHECKLIST.map((s) => s.toLowerCase());
    expect(items.some((s) => s.includes("logo"))).toBe(true);
    expect(items.some((s) => s.includes("coffee"))).toBe(true);
    expect(items.some((s) => s.includes("svg"))).toBe(true);
    expect(items.some((s) => s.includes("colour palette"))).toBe(true);
    expect(items.some((s) => s.includes("variation"))).toBe(true);
  });
});

describe("capturedTotalCents", () => {
  it("is 0 on the seed", () => {
    const { project } = getState();
    expect(capturedTotalCents(project.id)).toBe(0);
  });

  it("sums only milestones in CAPTURED or RELEASED state", () => {
    const { project, milestones } = getState();
    const [m1, m2] = milestones;

    updateMilestone(m1.id, { state: "AUTHORIZED" });
    updateMilestone(m2.id, { state: "ESCALATED" });
    expect(capturedTotalCents(project.id)).toBe(0);

    updateMilestone(m1.id, { state: "CAPTURED" });
    expect(capturedTotalCents(project.id)).toBe(20000);

    updateMilestone(m2.id, { state: "RELEASED" });
    expect(capturedTotalCents(project.id)).toBe(80000);
  });
});

describe("repository writes", () => {
  it("updateMilestone persists state and PayPal ids", () => {
    const { milestones } = getState();
    const updated = updateMilestone(milestones[0].id, {
      state: "AUTHORIZED",
      paypalOrderId: "ORDER-1",
      paypalAuthorizationId: "AUTH-1",
    });
    expect(updated.state).toBe("AUTHORIZED");
    expect(updated.paypalOrderId).toBe("ORDER-1");
    expect(updated.paypalAuthorizationId).toBe("AUTH-1");

    const reread = getState().milestones[0];
    expect(reread.state).toBe("AUTHORIZED");
    expect(reread.paypalAuthorizationId).toBe("AUTH-1");
  });

  it("updateMilestone persists fundingAttemptId through the patch surface", () => {
    const { milestones } = getState();
    const updated = updateMilestone(milestones[0].id, {
      fundingAttemptId: "attempt-123",
    });
    expect(updated.fundingAttemptId).toBe("attempt-123");
    expect(getState().milestones[0].fundingAttemptId).toBe("attempt-123");
  });

  it("insertDeliverable round-trips through getState", () => {
    const { milestones } = getState();
    const saved = insertDeliverable({
      milestoneId: milestones[0].id,
      note: SAMPLE_DELIVERABLE_NOTE,
      link: "https://example.com/logo-v1",
    });
    expect(saved.milestoneId).toBe(milestones[0].id);
    expect(saved.note).toBe(SAMPLE_DELIVERABLE_NOTE);

    const state = getState();
    expect(state.deliverables).toHaveLength(1);
    expect(state.deliverables[0].note).toBe(SAMPLE_DELIVERABLE_NOTE);
    expect(state.deliverables[0].link).toBe("https://example.com/logo-v1");
  });

  it("insertVerification stores items as JSON and returns them parsed", () => {
    const { milestones } = getState();
    const items = [
      {
        requirement: MILESTONE1_CHECKLIST[0],
        verdict: "pass" as const,
        evidence: "note mentions logo concepts",
      },
    ];
    const saved = insertVerification({
      milestoneId: milestones[0].id,
      provider: "fallback",
      items,
      score: 80,
      summary: "4 of 5 requirements covered",
    });
    expect(saved.items).toEqual(items);
    expect(saved.score).toBe(80);

    const state = getState();
    expect(state.verifications).toHaveLength(1);
    expect(state.verifications[0].items).toEqual(items);
  });

  it("insertLedgerRelease records a simulated release entry", () => {
    const { milestones } = getState();
    const entry = insertLedgerRelease(milestones[0].id, 20000);
    expect(entry.milestoneId).toBe(milestones[0].id);
    expect(entry.amountCents).toBe(20000);
    expect(entry.kind).toBe("release");
    expect(entry.status).toBe("simulated");
    expect(getState().ledger).toHaveLength(1);
  });

  it("insertEvent returns events newest-last (chronological order)", () => {
    const { milestones } = getState();
    insertEvent(milestones[0].id, "client", "funded", "order ORDER-1");
    insertEvent(milestones[0].id, "agent", "verified", "score 80");

    const { events } = getState();
    expect(events.map((e) => e.action)).toEqual(["funded", "verified"]);
    expect(events[events.length - 1].action).toBe("verified");
    expect(events[0].actor).toBe("client");
  });
});

describe("resetDemo", () => {
  it("clears all tables and returns state to the seed", () => {
    const before = getState();
    const [m1] = before.milestones;
    updateMilestone(m1.id, { state: "RELEASED", paypalCaptureId: "CAP-1" });
    insertDeliverable({ milestoneId: m1.id, note: "work" });
    insertVerification({
      milestoneId: m1.id,
      provider: "fallback",
      items: [],
      score: 0,
      summary: "n/a",
    });
    insertLedgerRelease(m1.id, 20000);
    insertEvent(m1.id, "agent", "released", "capture CAP-1");
    expect(getState().deliverables).toHaveLength(1);

    resetDemo();

    const after = getState();
    expect(after.project).toEqual(before.project);
    expect(after.milestones).toEqual(before.milestones);
    expect(after.deliverables).toEqual([]);
    expect(after.verifications).toEqual([]);
    expect(after.ledger).toEqual([]);
    expect(after.events).toEqual([]);
    expect(capturedTotalCents(after.project.id)).toBe(0);
  });
});

describe("getDb", () => {
  it("returns the same connection for the same path", () => {
    expect(getDb()).toBe(getDb());
  });
});
