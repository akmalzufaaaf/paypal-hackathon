import { beforeEach, describe, expect, it, vi } from "vitest";

// Must be set before any getDb() call; repo/db open the DB lazily.
process.env.RILIS_DB_PATH = ":memory:";

import { SAMPLE_DELIVERABLE_NOTE } from "../lib/constants";
import { getDb } from "../lib/db";
import {
  capturedTotalCents,
  getState,
  insertVerification,
  resetDemo,
  updateMilestone,
} from "../lib/repo";
import type { VerifyDeliverableInput } from "../lib/verifier";
import { createWorkflow, PolicyBlocked } from "../lib/workflow";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function makeFakePayPal(captureDelayMs = 0) {
  let orderSeq = 0;
  let captureSeq = 0;
  const flags = {
    failAuthorize: false,
    failCapture: false,
    failVoid: false,
  };
  const paypal = {
    createOrder: vi.fn(async () => ({ orderId: `ORDER-${++orderSeq}` })),
    authorizeOrder: vi.fn(async (orderId: string) => {
      if (flags.failAuthorize) throw new Error("paypal authorize failed");
      return { authorizationId: `AUTH-${orderId}`, status: "CREATED" };
    }),
    captureAuthorization: vi.fn(async () => {
      if (captureDelayMs > 0) await sleep(captureDelayMs);
      if (flags.failCapture) throw new Error("paypal capture failed");
      return { captureId: `CAP-${++captureSeq}`, status: "COMPLETED" };
    }),
    voidAuthorization: vi.fn(async () => {
      if (flags.failVoid) throw new Error("paypal void failed");
    }),
  };
  return { paypal, flags };
}

function makeFakeVerify(scoreRef: { score: number }, delayMs = 0) {
  return vi.fn(async (input: VerifyDeliverableInput) => {
    if (delayMs > 0) await sleep(delayMs);
    const passCount = Math.round((scoreRef.score / 100) * input.checklist.length);
    return {
      provider: "fallback" as const,
      items: input.checklist.map((requirement, i) => ({
        requirement,
        verdict: (i < passCount ? "pass" : "unclear") as "pass" | "unclear",
        evidence: "fake evidence",
      })),
      score: scoreRef.score,
      summary: `fake verification score ${scoreRef.score}`,
    };
  });
}

let fake: ReturnType<typeof makeFakePayPal>;
let scoreRef: { score: number };
let verify: ReturnType<typeof makeFakeVerify>;
let wf: ReturnType<typeof createWorkflow>;

beforeEach(() => {
  resetDemo();
  fake = makeFakePayPal();
  scoreRef = { score: 100 };
  verify = makeFakeVerify(scoreRef);
  wf = createWorkflow({ paypal: fake.paypal, verify });
});

function milestone(id: string) {
  const m = getState().milestones.find((x) => x.id === id);
  if (!m) throw new Error(`missing milestone ${id}`);
  return m;
}

async function driveToDelivered(
  milestoneId: string,
  workflow: ReturnType<typeof createWorkflow> = wf,
) {
  const { orderId } = await workflow.fundMilestone(milestoneId);
  await workflow.confirmAuthorization(milestoneId, orderId);
  await workflow.submitDeliverable(milestoneId, {
    note: SAMPLE_DELIVERABLE_NOTE,
    link: "https://example.com/deliverable",
  });
  return orderId;
}

/** Workflow whose verifier + capture are slow enough for races to interleave. */
function makeSlowWorkflow() {
  const slowFake = makeFakePayPal(25);
  const slowWf = createWorkflow({
    paypal: slowFake.paypal,
    verify: makeFakeVerify(scoreRef, 25),
  });
  return { slowWf, slowFake };
}

describe("happy path auto-capture", () => {
  it("funds, authorizes, delivers, verifies and auto-captures to RELEASED with a ledger release", async () => {
    const orderId = await driveToDelivered("milestone-1");
    expect(orderId).toBe("ORDER-1");

    const result = await wf.decide("milestone-1");
    expect(result).toEqual({ action: "AUTO_CAPTURE" });

    const m = milestone("milestone-1");
    expect(m.state).toBe("RELEASED");
    expect(m.paypalOrderId).toBe("ORDER-1");
    expect(m.paypalAuthorizationId).toBe("AUTH-ORDER-1");
    expect(m.paypalCaptureId).toBe("CAP-1");

    const state = getState();
    expect(state.ledger).toHaveLength(1);
    expect(state.ledger[0].milestoneId).toBe("milestone-1");
    expect(state.ledger[0].amountCents).toBe(20000);
    expect(state.ledger[0].kind).toBe("release");
    expect(state.ledger[0].status).toBe("simulated");
    expect(state.verifications).toHaveLength(1);
    expect(state.verifications[0].score).toBe(100);

    // Events are chronological and cover the whole flow in order.
    expect(state.events.map((e) => e.action)).toEqual([
      "order_created",
      "authorized",
      "delivered",
      "verified",
      "captured",
      "released",
    ]);
  });

  it("derives idempotency request IDs as ${milestoneId}:${transition}", async () => {
    await driveToDelivered("milestone-1");
    await wf.decide("milestone-1");

    expect(fake.paypal.createOrder).toHaveBeenCalledWith(
      20000,
      "milestone-1",
      "milestone-1:create-order",
    );
    expect(fake.paypal.captureAuthorization).toHaveBeenCalledWith(
      "AUTH-ORDER-1",
      "milestone-1:capture",
    );
  });

  it("funding twice does not create a second live order (Review Focus 1)", async () => {
    const first = await wf.fundMilestone("milestone-1");
    const second = await wf.fundMilestone("milestone-1");
    expect(second).toEqual(first);
    expect(fake.paypal.createOrder).toHaveBeenCalledTimes(1);
    expect(milestone("milestone-1").state).toBe("DRAFT");
    expect(milestone("milestone-1").paypalOrderId).toBe(first.orderId);
  });
});

describe("escalation and client approval", () => {
  it("$600 milestone escalates over the auto-pay limit and approveCapture releases it", async () => {
    await driveToDelivered("milestone-2");

    const result = await wf.decide("milestone-2");
    expect(result).toEqual({ action: "ESCALATE" });
    expect(milestone("milestone-2").state).toBe("ESCALATED");
    expect(getState().ledger).toHaveLength(0);
    expect(fake.paypal.captureAuthorization).not.toHaveBeenCalled();

    const escalated = getState().events.find((e) => e.action === "escalated");
    expect(escalated?.detail).toContain("exceeds the auto-pay limit");

    await wf.approveCapture("milestone-2");
    expect(milestone("milestone-2").state).toBe("RELEASED");
    expect(milestone("milestone-2").paypalCaptureId).toBe("CAP-1");
    const state = getState();
    expect(state.ledger).toHaveLength(1);
    expect(state.ledger[0].amountCents).toBe(60000);
  });

  it("score below the pass threshold escalates with the reason logged", async () => {
    scoreRef.score = 40;
    await driveToDelivered("milestone-1");

    const result = await wf.decide("milestone-1");
    expect(result).toEqual({ action: "ESCALATE" });
    expect(milestone("milestone-1").state).toBe("ESCALATED");
    expect(fake.paypal.captureAuthorization).not.toHaveBeenCalled();
    expect(getState().ledger).toHaveLength(0);

    const escalated = getState().events.find((e) => e.action === "escalated");
    expect(escalated?.detail).toContain("below the pass threshold");
  });

  it("reject voids the authorization from ESCALATED", async () => {
    const orderId = await driveToDelivered("milestone-2");
    await wf.decide("milestone-2");
    expect(milestone("milestone-2").state).toBe("ESCALATED");

    await wf.rejectVoid("milestone-2");
    expect(milestone("milestone-2").state).toBe("VOIDED");
    expect(fake.paypal.voidAuthorization).toHaveBeenCalledWith(`AUTH-${orderId}`);
    expect(getState().ledger).toHaveLength(0);
    expect(getState().events.map((e) => e.action)).toContain("voided");
  });

  it("reject voids from VERIFIED", async () => {
    const orderId = await driveToDelivered("milestone-1");
    // VERIFIED is transient through decide(); seed the review state directly.
    updateMilestone("milestone-1", { state: "VERIFIED" });
    insertVerification({
      milestoneId: "milestone-1",
      provider: "fallback",
      items: [],
      score: 100,
      summary: "seeded",
    });

    await wf.rejectVoid("milestone-1");
    expect(milestone("milestone-1").state).toBe("VOIDED");
    expect(fake.paypal.voidAuthorization).toHaveBeenCalledWith(`AUTH-${orderId}`);
  });
});

describe("budget cap hard ceiling", () => {
  it("cap breach cannot be approved: approveCapture throws PolicyBlocked and never captures", async () => {
    await wf.updatePolicy({ budgetCapCents: 50000 });
    await driveToDelivered("milestone-2");

    const result = await wf.decide("milestone-2");
    expect(result).toEqual({ action: "ESCALATE" });
    expect(milestone("milestone-2").state).toBe("ESCALATED");

    const err = await wf.approveCapture("milestone-2").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PolicyBlocked);
    expect((err as Error).name).toBe("PolicyBlocked");
    expect((err as Error).message).toMatch(/budget cap/i);

    expect(milestone("milestone-2").state).toBe("ESCALATED");
    expect(milestone("milestone-2").paypalCaptureId).toBeNull();
    expect(fake.paypal.captureAuthorization).not.toHaveBeenCalled();
    expect(getState().ledger).toHaveLength(0);
  });
});

describe("PayPal failure handling", () => {
  it("authorize failure leaves DRAFT with an error event, and retry succeeds without a second order", async () => {
    const { orderId } = await wf.fundMilestone("milestone-1");
    fake.flags.failAuthorize = true;

    await expect(wf.confirmAuthorization("milestone-1", orderId)).rejects.toThrow(
      "paypal authorize failed",
    );
    const m = milestone("milestone-1");
    expect(m.state).toBe("DRAFT");
    expect(m.paypalAuthorizationId).toBeNull();
    expect(m.paypalOrderId).toBe(orderId);
    expect(getState().events.map((e) => e.action)).toContain("authorize_failed");

    fake.flags.failAuthorize = false;
    await wf.confirmAuthorization("milestone-1", orderId);
    expect(milestone("milestone-1").state).toBe("AUTHORIZED");
    expect(milestone("milestone-1").paypalAuthorizationId).toBe(`AUTH-${orderId}`);
    expect(fake.paypal.createOrder).toHaveBeenCalledTimes(1);
  });

  it("capture failure during decide leaves ESCALATED with no ledger row, then approveCapture recovers", async () => {
    await driveToDelivered("milestone-1");
    fake.flags.failCapture = true;

    await expect(wf.decide("milestone-1")).rejects.toThrow("paypal capture failed");
    const m = milestone("milestone-1");
    expect(m.state).toBe("ESCALATED");
    expect(m.paypalCaptureId).toBeNull();
    expect(getState().ledger).toHaveLength(0);
    expect(getState().events.map((e) => e.action)).toContain("capture_failed");

    fake.flags.failCapture = false;
    await wf.approveCapture("milestone-1");
    expect(milestone("milestone-1").state).toBe("RELEASED");
    expect(getState().ledger).toHaveLength(1);
    expect(getState().ledger[0].amountCents).toBe(20000);
  });
});

describe("terminal-state guards (Review Focus 2)", () => {
  it("double decide / approveCapture after RELEASED throws and captures exactly once", async () => {
    await driveToDelivered("milestone-1");
    await wf.decide("milestone-1");
    expect(milestone("milestone-1").state).toBe("RELEASED");

    await expect(wf.decide("milestone-1")).rejects.toThrow();
    await expect(wf.approveCapture("milestone-1")).rejects.toThrow();
    await expect(wf.rerunPolicy("milestone-1")).rejects.toThrow();
    await expect(wf.rejectVoid("milestone-1")).rejects.toThrow();

    expect(fake.paypal.captureAuthorization).toHaveBeenCalledTimes(1);
    expect(getState().ledger).toHaveLength(1);
    expect(milestone("milestone-1").paypalCaptureId).toBe("CAP-1");
  });

  it("guards invalid transitions before any PayPal call", async () => {
    // decide before delivery, deliver before authorization, approve before escalation
    await expect(wf.decide("milestone-1")).rejects.toThrow();
    await expect(
      wf.submitDeliverable("milestone-1", { note: "too early" }),
    ).rejects.toThrow();
    await expect(wf.approveCapture("milestone-1")).rejects.toThrow();
    await expect(wf.rejectVoid("milestone-1")).rejects.toThrow();
    await expect(wf.rerunPolicy("milestone-1")).rejects.toThrow();

    const { orderId } = await wf.fundMilestone("milestone-1");
    await wf.confirmAuthorization("milestone-1", orderId);
    await expect(wf.fundMilestone("milestone-1")).rejects.toThrow();
    await expect(wf.decide("milestone-1")).rejects.toThrow();

    expect(fake.paypal.captureAuthorization).not.toHaveBeenCalled();
    expect(fake.paypal.voidAuthorization).not.toHaveBeenCalled();
    expect(getState().ledger).toHaveLength(0);
  });
});

describe("updatePolicy and rerunPolicy", () => {
  it("policy edits never auto re-run; explicit rerunPolicy re-evaluates and may auto-capture", async () => {
    await driveToDelivered("milestone-2");
    await wf.decide("milestone-2");
    expect(milestone("milestone-2").state).toBe("ESCALATED");

    await wf.updatePolicy({ autoPayLimitCents: 60000 });

    // Edit alone changes nothing about the milestone.
    expect(milestone("milestone-2").state).toBe("ESCALATED");
    expect(fake.paypal.captureAuthorization).not.toHaveBeenCalled();
    expect(getState().project.autoPayLimitCents).toBe(60000);

    const updated = getState().events.find((e) => e.action === "policy_updated");
    expect(updated).toBeDefined();
    expect(JSON.parse(updated!.detail)).toEqual({
      budgetCapCents: 100000,
      autoPayLimitCents: 60000,
      passThreshold: 80,
    });

    const result = await wf.rerunPolicy("milestone-2");
    expect(result).toEqual({ action: "AUTO_CAPTURE" });
    expect(milestone("milestone-2").state).toBe("RELEASED");
    expect(getState().ledger[0].amountCents).toBe(60000);
  });

  it("rerunPolicy from VERIFIED escalates when the current policy fails", async () => {
    await driveToDelivered("milestone-1");
    updateMilestone("milestone-1", { state: "VERIFIED" });
    insertVerification({
      milestoneId: "milestone-1",
      provider: "fallback",
      items: [],
      score: 10,
      summary: "seeded low score",
    });

    const result = await wf.rerunPolicy("milestone-1");
    expect(result).toEqual({ action: "ESCALATE" });
    expect(milestone("milestone-1").state).toBe("ESCALATED");
    expect(fake.paypal.captureAuthorization).not.toHaveBeenCalled();
  });
});

describe("resetDemoFlow", () => {
  it("voids a live authorization and reseeds the demo", async () => {
    const orderId = await driveToDelivered("milestone-1");
    expect(milestone("milestone-1").state).toBe("DELIVERED");

    await wf.resetDemoFlow();

    expect(fake.paypal.voidAuthorization).toHaveBeenCalledWith(`AUTH-${orderId}`);
    const state = getState();
    expect(state.milestones.map((m) => m.state)).toEqual(["DRAFT", "DRAFT"]);
    expect(state.deliverables).toHaveLength(0);
    expect(state.ledger).toHaveLength(0);
    expect(state.events.map((e) => e.action)).toEqual(["demo_reset"]);
  });

  it("void failure still reseeds and logs the failure", async () => {
    await driveToDelivered("milestone-2");
    await wf.decide("milestone-2");
    expect(milestone("milestone-2").state).toBe("ESCALATED");
    fake.flags.failVoid = true;

    await expect(wf.resetDemoFlow()).resolves.toBeUndefined();

    const state = getState();
    expect(state.milestones.map((m) => m.state)).toEqual(["DRAFT", "DRAFT"]);
    const reset = state.events.find((e) => e.action === "demo_reset");
    expect(reset?.detail).toContain("paypal void failed");
  });
});

describe("concurrency (in-flight guard)", () => {
  it("two concurrent decide calls capture exactly once with one ledger row", async () => {
    const { slowWf, slowFake } = makeSlowWorkflow();
    await driveToDelivered("milestone-1", slowWf);

    const results = await Promise.allSettled([
      slowWf.decide("milestone-1"),
      slowWf.decide("milestone-1"),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(slowFake.paypal.captureAuthorization).toHaveBeenCalledTimes(1);
    expect(getState().ledger).toHaveLength(1);
    expect(getState().ledger[0].amountCents).toBe(20000);
    expect(milestone("milestone-1").state).toBe("RELEASED");
    expect(milestone("milestone-1").paypalCaptureId).toBe("CAP-1");
  });

  it("two concurrent approveCapture calls on one milestone capture exactly once", async () => {
    const { slowWf, slowFake } = makeSlowWorkflow();
    await driveToDelivered("milestone-2", slowWf);
    await slowWf.decide("milestone-2");
    expect(milestone("milestone-2").state).toBe("ESCALATED");

    const results = await Promise.allSettled([
      slowWf.approveCapture("milestone-2"),
      slowWf.approveCapture("milestone-2"),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(slowFake.paypal.captureAuthorization).toHaveBeenCalledTimes(1);
    expect(getState().ledger).toHaveLength(1);
    expect(milestone("milestone-2").state).toBe("RELEASED");
  });

  it("concurrent approvals on different milestones cannot jointly breach the budget cap", async () => {
    const { slowWf, slowFake } = makeSlowWorkflow();
    await driveToDelivered("milestone-1", slowWf);
    await driveToDelivered("milestone-2", slowWf);
    // Both in review; each alone fits a 70000 cap, together 80000 does not.
    updateMilestone("milestone-1", { state: "ESCALATED" });
    updateMilestone("milestone-2", { state: "ESCALATED" });
    await slowWf.updatePolicy({ budgetCapCents: 70000 });

    const results = await Promise.allSettled([
      slowWf.approveCapture("milestone-1"),
      slowWf.approveCapture("milestone-2"),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    expect(
      (rejected as PromiseRejectedResult | undefined)?.reason,
    ).toBeInstanceOf(PolicyBlocked);
    expect(slowFake.paypal.captureAuthorization).toHaveBeenCalledTimes(1);
    expect(getState().ledger).toHaveLength(1);
    expect(capturedTotalCents(getState().project.id)).toBeLessThanOrEqual(70000);
    expect(
      getState()
        .milestones.map((m) => m.state)
        .sort(),
    ).toEqual(["ESCALATED", "RELEASED"]);
  });
});

describe("post-capture write failure (atomic release)", () => {
  it("stays CAPTURED with the original error, then resumes release-only without re-capturing", async () => {
    await driveToDelivered("milestone-1");
    getDb().exec(
      `CREATE TRIGGER fail_ledger_insert
       BEFORE INSERT ON ledger_entries
       BEGIN SELECT RAISE(ABORT, 'injected ledger failure'); END;`,
    );
    try {
      // The injected ledger failure must surface verbatim — never masked
      // by an invalid CAPTURED -> ESCALATED transition error.
      await expect(wf.decide("milestone-1")).rejects.toThrow(
        "injected ledger failure",
      );
    } finally {
      getDb().exec("DROP TRIGGER IF EXISTS fail_ledger_insert");
    }

    const captured = milestone("milestone-1");
    expect(captured.state).toBe("CAPTURED");
    expect(captured.paypalCaptureId).toBe("CAP-1");
    expect(getState().ledger).toHaveLength(0);
    expect(fake.paypal.captureAuthorization).toHaveBeenCalledTimes(1);

    // Resume from CAPTURED: release only, no second PayPal capture.
    await wf.approveCapture("milestone-1");
    expect(milestone("milestone-1").state).toBe("RELEASED");
    expect(getState().ledger).toHaveLength(1);
    expect(getState().ledger[0].amountCents).toBe(20000);
    expect(fake.paypal.captureAuthorization).toHaveBeenCalledTimes(1);
    expect(getState().events.map((e) => e.action)).toContain("released");
  });
});
