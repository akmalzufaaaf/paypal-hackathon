/**
 * Workflow service: orchestrates repo persistence, the PayPal client and
 * the deliverable verifier. Route handlers (Task 7) are thin adapters over
 * this module; tests drive it via `createWorkflow` with fakes.
 *
 * Money rules: amounts are integer cents; the budget cap is a hard ceiling
 * (even a client approval in `approveCapture` cannot breach it); policy
 * edits never re-run a decision — only `rerunPolicy` re-evaluates, and only
 * from VERIFIED/ESCALATED. Every state change is guarded by `canTransition`.
 */

import { getDb } from "./db";
import {
  authorizeOrder,
  captureAuthorization,
  createOrder,
  voidAuthorization,
} from "./paypal";
import { evaluatePolicy } from "./policy";
import {
  capturedTotalCents,
  getState,
  insertDeliverable,
  insertEvent,
  insertLedgerRelease,
  insertVerification,
  resetDemo,
  updateMilestone,
  type Deliverable,
  type Milestone,
  type Project,
  type Verification,
} from "./repo";
import { canTransition } from "./transitions";
import type { MilestoneState } from "./types";
import {
  verifyDeliverable,
  type VerifyDeliverableInput,
  type VerifyDeliverableResult,
} from "./verifier";

export class PolicyBlocked extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyBlocked";
  }
}

export class InvalidTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTransitionError";
  }
}

export interface PayPalDeps {
  createOrder(
    amountCents: number,
    referenceId: string,
    requestId: string,
  ): Promise<{ orderId: string }>;
  authorizeOrder(
    orderId: string,
  ): Promise<{ authorizationId: string; status: string }>;
  captureAuthorization(
    authorizationId: string,
    requestId: string,
  ): Promise<{ captureId: string; status: string }>;
  voidAuthorization(authorizationId: string): Promise<void>;
}

export type VerifyFn = (
  input: VerifyDeliverableInput,
) => Promise<VerifyDeliverableResult>;

export interface WorkflowDeps {
  paypal: PayPalDeps;
  verify: VerifyFn;
}

export interface SubmitDeliverableInput {
  kind?: string;
  filename?: string | null;
  link?: string | null;
  note: string;
  extractedText?: string;
}

export interface PolicyPatch {
  budgetCapCents?: number;
  autoPayLimitCents?: number;
  passThreshold?: number;
}

export type PolicyAction = "AUTO_CAPTURE" | "ESCALATE";

const LIVE_VOID_STATES: ReadonlySet<MilestoneState> = new Set([
  "AUTHORIZED",
  "DELIVERED",
  "VERIFIED",
  "ESCALATED",
]);

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createWorkflow(deps: Partial<WorkflowDeps> = {}) {
  const paypal: PayPalDeps = deps.paypal ?? {
    createOrder,
    authorizeOrder,
    captureAuthorization,
    voidAuthorization,
  };
  const verify: VerifyFn = deps.verify ?? ((input) => verifyDeliverable(input));

  function getMilestone(milestoneId: string): Milestone {
    const milestone = getState().milestones.find((m) => m.id === milestoneId);
    if (!milestone) {
      throw new Error(`milestone not found: ${milestoneId}`);
    }
    return milestone;
  }

  function getProject(): Project {
    return getState().project;
  }

  /** Guarded state change: the only path that mutates milestone state. */
  function transitionTo(
    milestone: Milestone,
    to: MilestoneState,
    patch: {
      paypalOrderId?: string;
      paypalAuthorizationId?: string;
      paypalCaptureId?: string;
    } = {},
  ): Milestone {
    if (!canTransition(milestone.state, to)) {
      throw new InvalidTransitionError(
        `Invalid transition ${milestone.state} -> ${to} for milestone ${milestone.id}`,
      );
    }
    return updateMilestone(milestone.id, { state: to, ...patch });
  }

  function latestDeliverable(milestoneId: string): Deliverable | undefined {
    return getState().deliverables.filter((d) => d.milestoneId === milestoneId).at(-1);
  }

  function latestVerification(milestoneId: string): Verification | undefined {
    return getState().verifications.filter((v) => v.milestoneId === milestoneId).at(-1);
  }

  function policySnapshot(project: Project) {
    return {
      budgetCapCents: project.budgetCapCents,
      autoPayLimitCents: project.autoPayLimitCents,
      passThreshold: project.passThreshold,
    };
  }

  /**
   * Capture the stored authorization and release the (simulated) payout.
   * The caller owns failure handling: a PayPal throw leaves the milestone
   * in its current review state with no ledger row.
   */
  async function captureAndRelease(milestoneId: string, actor: string): Promise<void> {
    const milestone = getMilestone(milestoneId);
    if (!milestone.paypalAuthorizationId) {
      throw new Error(`milestone ${milestoneId} has no authorization to capture`);
    }
    const { captureId } = await paypal.captureAuthorization(
      milestone.paypalAuthorizationId,
      `${milestoneId}:capture`,
    );
    const captured = transitionTo(milestone, "CAPTURED", { paypalCaptureId: captureId });
    insertEvent(
      milestoneId,
      actor,
      "captured",
      `Captured authorization ${milestone.paypalAuthorizationId} as capture ${captureId} for ${milestone.amountCents} cents.`,
    );
    transitionTo(captured, "RELEASED");
    insertLedgerRelease(milestoneId, milestone.amountCents);
    insertEvent(
      milestoneId,
      actor,
      "released",
      `Released ${milestone.amountCents} cents for milestone ${milestoneId} (simulated payout, capture ${captureId}).`,
    );
  }

  async function fundMilestone(milestoneId: string): Promise<{ orderId: string }> {
    const milestone = getMilestone(milestoneId);
    if (milestone.state !== "DRAFT") {
      throw new InvalidTransitionError(
        `fundMilestone requires DRAFT, got ${milestone.state} for milestone ${milestoneId}`,
      );
    }
    // Idempotent retry: never create a second live order for a milestone.
    if (milestone.paypalOrderId) {
      return { orderId: milestone.paypalOrderId };
    }
    let orderId: string;
    try {
      ({ orderId } = await paypal.createOrder(
        milestone.amountCents,
        milestoneId,
        `${milestoneId}:create-order`,
      ));
    } catch (err) {
      insertEvent(
        milestoneId,
        "client",
        "order_failed",
        `PayPal order creation failed for ${milestone.amountCents} cents: ${errorMessage(err)}`,
      );
      throw err;
    }
    updateMilestone(milestoneId, { paypalOrderId: orderId });
    insertEvent(
      milestoneId,
      "client",
      "order_created",
      `Created PayPal order ${orderId} for ${milestone.amountCents} cents (request ${milestoneId}:create-order).`,
    );
    return { orderId };
  }

  async function confirmAuthorization(milestoneId: string, orderId: string): Promise<void> {
    const milestone = getMilestone(milestoneId);
    if (!canTransition(milestone.state, "AUTHORIZED")) {
      throw new InvalidTransitionError(
        `Invalid transition ${milestone.state} -> AUTHORIZED for milestone ${milestoneId}`,
      );
    }
    let authorizationId: string;
    try {
      const result = await paypal.authorizeOrder(orderId);
      if (!result.authorizationId) {
        throw new Error("PayPal authorize response had no authorization id");
      }
      authorizationId = result.authorizationId;
    } catch (err) {
      insertEvent(
        milestoneId,
        "client",
        "authorize_failed",
        `PayPal authorize failed for order ${orderId}: ${errorMessage(err)}`,
      );
      throw err;
    }
    transitionTo(milestone, "AUTHORIZED", {
      paypalOrderId: orderId,
      paypalAuthorizationId: authorizationId,
    });
    insertEvent(
      milestoneId,
      "client",
      "authorized",
      `Authorized order ${orderId} as authorization ${authorizationId}; ${milestone.amountCents} cents held.`,
    );
  }

  async function submitDeliverable(
    milestoneId: string,
    input: SubmitDeliverableInput,
  ): Promise<void> {
    const milestone = getMilestone(milestoneId);
    if (!canTransition(milestone.state, "DELIVERED")) {
      throw new InvalidTransitionError(
        `Invalid transition ${milestone.state} -> DELIVERED for milestone ${milestoneId}`,
      );
    }
    if (!input || typeof input.note !== "string") {
      throw new Error("a delivery note is required");
    }
    insertDeliverable({
      milestoneId,
      kind: input.kind ?? "note",
      filename: input.filename ?? null,
      link: input.link ?? null,
      note: input.note,
      extractedText: input.extractedText ?? "",
    });
    transitionTo(milestone, "DELIVERED");
    insertEvent(
      milestoneId,
      "freelancer",
      "delivered",
      `Deliverable submitted for milestone ${milestoneId}${input.link ? ` (link: ${input.link})` : ""}${input.filename ? ` (file: ${input.filename})` : ""}.`,
    );
  }

  async function decide(milestoneId: string): Promise<{ action: PolicyAction }> {
    const milestone = getMilestone(milestoneId);
    if (!canTransition(milestone.state, "VERIFIED")) {
      throw new InvalidTransitionError(
        `Invalid transition ${milestone.state} -> VERIFIED for milestone ${milestoneId}`,
      );
    }
    const deliverable = latestDeliverable(milestoneId);
    if (!deliverable) {
      throw new Error(`milestone ${milestoneId} has no deliverable to verify`);
    }
    const result = await verify({
      checklist: milestone.checklist,
      deliveryNote: deliverable.note,
      extractedText: deliverable.extractedText,
      filename: deliverable.filename ?? undefined,
    });
    insertVerification({
      milestoneId,
      provider: result.provider,
      items: result.items,
      score: result.score,
      summary: result.summary,
    });
    const verified = transitionTo(milestone, "VERIFIED");
    insertEvent(
      milestoneId,
      "agent",
      "verified",
      `Verification (${result.provider}) score ${result.score}: ${result.summary}`,
    );

    const project = getProject();
    const policy = evaluatePolicy({
      score: result.score,
      passThreshold: project.passThreshold,
      amountCents: verified.amountCents,
      autoPayLimitCents: project.autoPayLimitCents,
      capturedTotalCents: capturedTotalCents(project.id),
      budgetCapCents: project.budgetCapCents,
    });

    if (policy.action === "ESCALATE") {
      transitionTo(verified, "ESCALATED");
      insertEvent(
        milestoneId,
        "agent",
        "escalated",
        `Escalated: ${policy.reasons.join("; ")} Policy: ${JSON.stringify(policySnapshot(project))}.`,
      );
      return { action: "ESCALATE" };
    }

    try {
      await captureAndRelease(milestoneId, "agent");
    } catch (err) {
      transitionTo(getMilestone(milestoneId), "ESCALATED");
      insertEvent(
        milestoneId,
        "agent",
        "capture_failed",
        `Capture failed; milestone escalated unpaid: ${errorMessage(err)}`,
      );
      throw err;
    }
    return { action: "AUTO_CAPTURE" };
  }

  async function approveCapture(milestoneId: string): Promise<void> {
    const milestone = getMilestone(milestoneId);
    if (milestone.state !== "ESCALATED" || !canTransition(milestone.state, "CAPTURED")) {
      throw new InvalidTransitionError(
        `approveCapture requires ESCALATED, got ${milestone.state} for milestone ${milestoneId}`,
      );
    }
    const project = getProject();
    const captured = capturedTotalCents(project.id);
    if (captured + milestone.amountCents > project.budgetCapCents) {
      insertEvent(
        milestoneId,
        "client",
        "capture_blocked",
        `Capture blocked: captured total ${captured} cents plus amount ${milestone.amountCents} cents exceeds the budget cap of ${project.budgetCapCents} cents.`,
      );
      throw new PolicyBlocked(
        `Captured total ${captured} cents plus amount ${milestone.amountCents} cents exceeds the budget cap of ${project.budgetCapCents} cents`,
      );
    }
    try {
      await captureAndRelease(milestoneId, "client");
    } catch (err) {
      insertEvent(
        milestoneId,
        "client",
        "capture_failed",
        `Capture failed; milestone stays ESCALATED unpaid: ${errorMessage(err)}`,
      );
      throw err;
    }
  }

  async function rejectVoid(milestoneId: string): Promise<void> {
    const milestone = getMilestone(milestoneId);
    if (!canTransition(milestone.state, "VOIDED")) {
      throw new InvalidTransitionError(
        `Invalid transition ${milestone.state} -> VOIDED for milestone ${milestoneId}`,
      );
    }
    if (!milestone.paypalAuthorizationId) {
      throw new Error(`milestone ${milestoneId} has no authorization to void`);
    }
    try {
      await paypal.voidAuthorization(milestone.paypalAuthorizationId);
    } catch (err) {
      insertEvent(
        milestoneId,
        "client",
        "void_failed",
        `Void failed for authorization ${milestone.paypalAuthorizationId}: ${errorMessage(err)}`,
      );
      throw err;
    }
    transitionTo(milestone, "VOIDED");
    insertEvent(
      milestoneId,
      "client",
      "voided",
      `Voided authorization ${milestone.paypalAuthorizationId} for milestone ${milestoneId}; hold released unpaid.`,
    );
  }

  async function rerunPolicy(milestoneId: string): Promise<{ action: PolicyAction }> {
    const milestone = getMilestone(milestoneId);
    if (milestone.state !== "VERIFIED" && milestone.state !== "ESCALATED") {
      throw new InvalidTransitionError(
        `rerunPolicy requires VERIFIED or ESCALATED, got ${milestone.state} for milestone ${milestoneId}`,
      );
    }
    const verification = latestVerification(milestoneId);
    if (!verification) {
      throw new Error(`milestone ${milestoneId} has no verification to re-evaluate`);
    }
    const project = getProject();
    const policy = evaluatePolicy({
      score: verification.score,
      passThreshold: project.passThreshold,
      amountCents: milestone.amountCents,
      autoPayLimitCents: project.autoPayLimitCents,
      capturedTotalCents: capturedTotalCents(project.id),
      budgetCapCents: project.budgetCapCents,
    });
    insertEvent(
      milestoneId,
      "client",
      "policy_rerun",
      `Re-ran policy with snapshot ${JSON.stringify(policySnapshot(project))} and score ${verification.score}: ${policy.action}${policy.reasons.length ? ` (${policy.reasons.join("; ")})` : ""}.`,
    );

    if (policy.action === "ESCALATE") {
      if (milestone.state === "VERIFIED") {
        transitionTo(milestone, "ESCALATED");
        insertEvent(
          milestoneId,
          "agent",
          "escalated",
          `Escalated: ${policy.reasons.join("; ")} Policy: ${JSON.stringify(policySnapshot(project))}.`,
        );
      }
      return { action: "ESCALATE" };
    }

    try {
      await captureAndRelease(milestoneId, "client");
    } catch (err) {
      const current = getMilestone(milestoneId);
      if (current.state === "VERIFIED") {
        transitionTo(current, "ESCALATED");
      }
      insertEvent(
        milestoneId,
        "client",
        "capture_failed",
        `Capture failed during policy re-run; milestone stays unpaid: ${errorMessage(err)}`,
      );
      throw err;
    }
    return { action: "AUTO_CAPTURE" };
  }

  async function updatePolicy(patch: PolicyPatch): Promise<void> {
    const project = getProject();
    const next = {
      budgetCapCents: patch.budgetCapCents ?? project.budgetCapCents,
      autoPayLimitCents: patch.autoPayLimitCents ?? project.autoPayLimitCents,
      passThreshold: patch.passThreshold ?? project.passThreshold,
    };
    for (const [key, value] of Object.entries(next)) {
      if (!Number.isInteger(value) || value < 0 || (key === "passThreshold" && value > 100)) {
        throw new Error(`invalid policy value for ${key}: ${value}`);
      }
    }
    getDb()
      .prepare(
        "UPDATE projects SET budget_cap_cents = ?, auto_pay_limit_cents = ?, pass_threshold = ? WHERE id = ?",
      )
      .run(next.budgetCapCents, next.autoPayLimitCents, next.passThreshold, project.id);
    insertEvent(null, "client", "policy_updated", JSON.stringify(next));
  }

  async function resetDemoFlow(): Promise<void> {
    const failures: string[] = [];
    for (const milestone of getState().milestones) {
      if (LIVE_VOID_STATES.has(milestone.state) && milestone.paypalAuthorizationId) {
        try {
          await paypal.voidAuthorization(milestone.paypalAuthorizationId);
        } catch (err) {
          failures.push(`${milestone.id}: ${errorMessage(err)}`);
        }
      }
    }
    resetDemo();
    insertEvent(
      null,
      "system",
      "demo_reset",
      failures.length
        ? `Demo reset. Void failures: ${failures.join("; ")}`
        : "Demo reset.",
    );
  }

  return {
    fundMilestone,
    confirmAuthorization,
    submitDeliverable,
    decide,
    approveCapture,
    rejectVoid,
    rerunPolicy,
    updatePolicy,
    resetDemoFlow,
  };
}

export type Workflow = ReturnType<typeof createWorkflow>;

const defaultWorkflow = createWorkflow();

export const fundMilestone = defaultWorkflow.fundMilestone;
export const confirmAuthorization = defaultWorkflow.confirmAuthorization;
export const submitDeliverable = defaultWorkflow.submitDeliverable;
export const decide = defaultWorkflow.decide;
export const approveCapture = defaultWorkflow.approveCapture;
export const rejectVoid = defaultWorkflow.rejectVoid;
export const rerunPolicy = defaultWorkflow.rerunPolicy;
export const updatePolicy = defaultWorkflow.updatePolicy;
export const resetDemoFlow = defaultWorkflow.resetDemoFlow;
