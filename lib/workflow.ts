/**
 * Workflow service: orchestrates repo persistence, the PayPal client and
 * the deliverable verifier. Route handlers (Task 7) are thin adapters over
 * this module; tests drive it via `createWorkflow` with fakes.
 *
 * Money rules: amounts are integer cents; the budget cap is a hard ceiling
 * (even a client approval in `approveCapture` cannot breach it); policy
 * edits never re-run a decision — only `rerunPolicy` re-evaluates, and only
 * from VERIFIED/ESCALATED. Every state change is guarded by `canTransition`.
 *
 * Concurrency/atomicity: every public mutation runs under one per-instance
 * async queue, so a milestone's state checks, the project budget-cap check
 * and the following capture can never interleave with another mutation;
 * `transitionTo` additionally re-reads the DB row and rejects stale
 * snapshots. Once PayPal has captured, RELEASED + ledger + audit events are
 * written in a single DB transaction — a local failure leaves the milestone
 * CAPTURED (never re-captured, never escalated) and release can be resumed.
 */

import { randomUUID } from "node:crypto";

import {
  authorizeOrder,
  captureAuthorization,
  createOrder,
  voidAuthorization,
} from "./paypal";
import { evaluatePolicy } from "./policy";
import {
  capturedTotalCents,
  completeRelease,
  getState,
  insertDeliverable,
  insertEvent,
  insertVerification,
  resetDemo,
  updateMilestone,
  updateProjectPolicy,
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

  // Serializes all public mutations for this workflow instance. This makes
  // each check-then-act sequence (state guard, budget-cap re-check, capture)
  // atomic with respect to other workflow calls, per milestone and per
  // project — concurrent decides/approvals cannot double-capture.
  let tail: Promise<void> = Promise.resolve();
  function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = tail.then(fn, fn);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function getMilestone(milestoneId: string): Promise<Milestone> {
    const milestone = (await getState()).milestones.find(
      (m) => m.id === milestoneId,
    );
    if (!milestone) {
      throw new Error(`milestone not found: ${milestoneId}`);
    }
    return milestone;
  }

  async function getProject(): Promise<Project> {
    return (await getState()).project;
  }

  /** Guarded state change: the only path that mutates milestone state. */
  async function transitionTo(
    milestone: Milestone,
    to: MilestoneState,
    patch: {
      paypalOrderId?: string;
      paypalAuthorizationId?: string;
      paypalCaptureId?: string;
    } = {},
  ): Promise<Milestone> {
    // Re-read the persisted row: never trust a snapshot taken before an
    // await (verifier / PayPal), even though mutations are serialized.
    const current = await getMilestone(milestone.id);
    if (current.state !== milestone.state) {
      throw new InvalidTransitionError(
        `Stale state for milestone ${milestone.id}: expected ${milestone.state}, found ${current.state}`,
      );
    }
    if (!canTransition(current.state, to)) {
      throw new InvalidTransitionError(
        `Invalid transition ${current.state} -> ${to} for milestone ${milestone.id}`,
      );
    }
    return await updateMilestone(milestone.id, { state: to, ...patch });
  }

  async function latestDeliverable(
    milestoneId: string,
  ): Promise<Deliverable | undefined> {
    return (await getState()).deliverables
      .filter((d) => d.milestoneId === milestoneId)
      .at(-1);
  }

  async function latestVerification(
    milestoneId: string,
  ): Promise<Verification | undefined> {
    return (await getState()).verifications
      .filter((v) => v.milestoneId === milestoneId)
      .at(-1);
  }

  function policySnapshot(project: Project) {
    return {
      budgetCapCents: project.budgetCapCents,
      autoPayLimitCents: project.autoPayLimitCents,
      passThreshold: project.passThreshold,
    };
  }

  /**
   * RELEASED + ledger + audit events as one DB transaction: either all of
   * them persist, or the milestone stays CAPTURED with its capture ID stored
   * and no ledger row — resumable without ever re-capturing.
   */
  async function releaseAtomically(
    captured: Milestone,
    actor: string,
  ): Promise<void> {
    await completeRelease(captured, actor);
  }

  /**
   * Capture the stored authorization and release the (simulated) payout.
   * A milestone already CAPTURED (PayPal capture succeeded, local release
   * failed earlier) is resumed release-only — PayPal is never called twice.
   * The caller owns failure handling via `handleCaptureFailure`.
   */
  async function captureAndRelease(milestoneId: string, actor: string): Promise<void> {
    const milestone = await getMilestone(milestoneId);
    if (milestone.state === "CAPTURED") {
      if (!milestone.paypalCaptureId) {
        throw new Error(`milestone ${milestoneId} is CAPTURED without a capture id`);
      }
      await releaseAtomically(milestone, actor);
      return;
    }
    if (!milestone.paypalAuthorizationId) {
      throw new Error(`milestone ${milestoneId} has no authorization to capture`);
    }
    const { captureId, status } = await paypal.captureAuthorization(
      milestone.paypalAuthorizationId,
      `${milestone.paypalAuthorizationId}:capture`,
    );
    if (status !== "COMPLETED") {
      throw new Error(
        `PayPal capture returned unexpected status ${status} for authorization ${milestone.paypalAuthorizationId}; expected COMPLETED`,
      );
    }
    // Persist the capture ID first; the release that follows is transactional.
    const captured = await transitionTo(milestone, "CAPTURED", {
      paypalCaptureId: captureId,
    });
    await releaseAtomically(captured, actor);
  }

  /**
   * Distinguish capture failure phases and always rethrow the original
   * error: PayPal (pre-capture) failure escalates VERIFIED or leaves
   * ESCALATED unpaid; post-capture local failure stays CAPTURED — CAPTURED
   * has no escalation edge and must never be re-captured.
   */
  async function handleCaptureFailure(
    milestoneId: string,
    actor: string,
    context: string,
    err: unknown,
  ): Promise<never> {
    const current = await getMilestone(milestoneId);
    if (current.state === "CAPTURED") {
      await insertEvent(
        milestoneId,
        actor,
        "capture_failed",
        `${context}: PayPal capture ${current.paypalCaptureId} succeeded but the local release failed; milestone stays CAPTURED for release-only resume: ${errorMessage(err)}`,
      );
    } else {
      if (current.state === "VERIFIED") {
        await transitionTo(current, "ESCALATED");
      }
      await insertEvent(
        milestoneId,
        actor,
        "capture_failed",
        `${context}: capture failed; milestone stays unpaid: ${errorMessage(err)}`,
      );
    }
    throw err;
  }

  async function fundMilestone(milestoneId: string): Promise<{ orderId: string }> {
    const milestone = await getMilestone(milestoneId);
    if (milestone.state !== "DRAFT") {
      throw new InvalidTransitionError(
        `fundMilestone requires DRAFT, got ${milestone.state} for milestone ${milestoneId}`,
      );
    }
    // Idempotent retry: never create a second live order for a milestone.
    if (milestone.paypalOrderId) {
      return { orderId: milestone.paypalOrderId };
    }
    // One attempt ID per funding attempt, persisted BEFORE the PayPal call:
    // a retry of this attempt reuses it (PayPal replays the same request),
    // while a reseeded milestone starts with none and gets a fresh one —
    // a forever-static key would replay the pre-Reset order after Reset.
    const attemptId = milestone.fundingAttemptId ?? randomUUID();
    if (!milestone.fundingAttemptId) {
      await updateMilestone(milestoneId, { fundingAttemptId: attemptId });
    }
    const requestId = `${milestoneId}:create-order:${attemptId}`;
    let orderId: string;
    try {
      ({ orderId } = await paypal.createOrder(
        milestone.amountCents,
        milestoneId,
        requestId,
      ));
    } catch (err) {
      await insertEvent(
        milestoneId,
        "client",
        "order_failed",
        `PayPal order creation failed for ${milestone.amountCents} cents: ${errorMessage(err)}`,
      );
      throw err;
    }
    await updateMilestone(milestoneId, { paypalOrderId: orderId });
    await insertEvent(
      milestoneId,
      "client",
      "order_created",
      `Created PayPal order ${orderId} for ${milestone.amountCents} cents (request ${requestId}).`,
    );
    return { orderId };
  }

  async function confirmAuthorization(milestoneId: string, orderId: string): Promise<void> {
    const milestone = await getMilestone(milestoneId);
    if (!canTransition(milestone.state, "AUTHORIZED")) {
      throw new InvalidTransitionError(
        `Invalid transition ${milestone.state} -> AUTHORIZED for milestone ${milestoneId}`,
      );
    }
    if (milestone.paypalOrderId && milestone.paypalOrderId !== orderId) {
      throw new InvalidTransitionError(
        `order ${orderId} does not match the stored order ${milestone.paypalOrderId} for milestone ${milestoneId}`,
      );
    }
    let authorizationId: string;
    try {
      const result = await paypal.authorizeOrder(orderId);
      if (!result.authorizationId) {
        throw new Error("PayPal authorize response had no authorization id");
      }
      if (result.status !== "CREATED") {
        throw new Error(
          `PayPal authorize returned unexpected status ${result.status} for order ${orderId}; expected CREATED`,
        );
      }
      authorizationId = result.authorizationId;
    } catch (err) {
      await insertEvent(
        milestoneId,
        "client",
        "authorize_failed",
        `PayPal authorize failed for order ${orderId}: ${errorMessage(err)}`,
      );
      throw err;
    }
    await transitionTo(milestone, "AUTHORIZED", {
      paypalOrderId: orderId,
      paypalAuthorizationId: authorizationId,
    });
    await insertEvent(
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
    const milestone = await getMilestone(milestoneId);
    if (!canTransition(milestone.state, "DELIVERED")) {
      throw new InvalidTransitionError(
        `Invalid transition ${milestone.state} -> DELIVERED for milestone ${milestoneId}`,
      );
    }
    if (!input || typeof input.note !== "string") {
      throw new Error("a delivery note is required");
    }
    await insertDeliverable({
      milestoneId,
      kind: input.kind ?? "note",
      filename: input.filename ?? null,
      link: input.link ?? null,
      note: input.note,
      extractedText: input.extractedText ?? "",
    });
    await transitionTo(milestone, "DELIVERED");
    await insertEvent(
      milestoneId,
      "freelancer",
      "delivered",
      `Deliverable submitted for milestone ${milestoneId}${input.link ? ` (link: ${input.link})` : ""}${input.filename ? ` (file: ${input.filename})` : ""}.`,
    );
  }

  async function decide(milestoneId: string): Promise<{ action: PolicyAction }> {
    const milestone = await getMilestone(milestoneId);
    if (!canTransition(milestone.state, "VERIFIED")) {
      throw new InvalidTransitionError(
        `Invalid transition ${milestone.state} -> VERIFIED for milestone ${milestoneId}`,
      );
    }
    const deliverable = await latestDeliverable(milestoneId);
    if (!deliverable) {
      throw new Error(`milestone ${milestoneId} has no deliverable to verify`);
    }
    const result = await verify({
      checklist: milestone.checklist,
      deliveryNote: deliverable.note,
      extractedText: deliverable.extractedText,
      filename: deliverable.filename ?? undefined,
    });
    await insertVerification({
      milestoneId,
      provider: result.provider,
      items: result.items,
      score: result.score,
      summary: result.summary,
    });
    const verified = await transitionTo(milestone, "VERIFIED");
    await insertEvent(
      milestoneId,
      "agent",
      "verified",
      `Verification (${result.provider}) score ${result.score}: ${result.summary}`,
    );

    const project = await getProject();
    const policy = evaluatePolicy({
      score: result.score,
      passThreshold: project.passThreshold,
      amountCents: verified.amountCents,
      autoPayLimitCents: project.autoPayLimitCents,
      capturedTotalCents: await capturedTotalCents(project.id),
      budgetCapCents: project.budgetCapCents,
    });

    if (policy.action === "ESCALATE") {
      await transitionTo(verified, "ESCALATED");
      await insertEvent(
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
      await handleCaptureFailure(milestoneId, "agent", "Auto-capture", err);
    }
    return { action: "AUTO_CAPTURE" };
  }

  async function approveCapture(milestoneId: string): Promise<void> {
    const milestone = await getMilestone(milestoneId);
    if (milestone.state === "CAPTURED") {
      // Resume after a post-capture local failure: release only. The cap is
      // not re-checked (this milestone is already counted as captured) and
      // PayPal is never re-captured.
      try {
        await captureAndRelease(milestoneId, "client");
      } catch (err) {
        await handleCaptureFailure(milestoneId, "client", "Release resume", err);
      }
      return;
    }
    if (milestone.state !== "ESCALATED" || !canTransition(milestone.state, "CAPTURED")) {
      throw new InvalidTransitionError(
        `approveCapture requires ESCALATED, got ${milestone.state} for milestone ${milestoneId}`,
      );
    }
    const project = await getProject();
    const captured = await capturedTotalCents(project.id);
    if (captured + milestone.amountCents > project.budgetCapCents) {
      await insertEvent(
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
      await handleCaptureFailure(milestoneId, "client", "Approved capture", err);
    }
  }

  async function rejectVoid(milestoneId: string): Promise<void> {
    const milestone = await getMilestone(milestoneId);
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
      await insertEvent(
        milestoneId,
        "client",
        "void_failed",
        `Void failed for authorization ${milestone.paypalAuthorizationId}: ${errorMessage(err)}`,
      );
      throw err;
    }
    await transitionTo(milestone, "VOIDED");
    await insertEvent(
      milestoneId,
      "client",
      "voided",
      `Voided authorization ${milestone.paypalAuthorizationId} for milestone ${milestoneId}; hold released unpaid.`,
    );
  }

  async function rerunPolicy(milestoneId: string): Promise<{ action: PolicyAction }> {
    const milestone = await getMilestone(milestoneId);
    if (
      milestone.state !== "VERIFIED" &&
      milestone.state !== "ESCALATED" &&
      milestone.state !== "CAPTURED"
    ) {
      throw new InvalidTransitionError(
        `rerunPolicy requires VERIFIED or ESCALATED, got ${milestone.state} for milestone ${milestoneId}`,
      );
    }
    if (milestone.state === "CAPTURED") {
      // Resume after a post-capture local failure: release only, no policy
      // re-evaluation and no second PayPal capture.
      await insertEvent(
        milestoneId,
        "client",
        "policy_rerun",
        `Re-run on CAPTURED milestone ${milestoneId}: resuming release of capture ${milestone.paypalCaptureId} without re-capturing.`,
      );
      try {
        await captureAndRelease(milestoneId, "client");
      } catch (err) {
        await handleCaptureFailure(milestoneId, "client", "Release resume", err);
      }
      return { action: "AUTO_CAPTURE" };
    }
    const verification = await latestVerification(milestoneId);
    if (!verification) {
      throw new Error(`milestone ${milestoneId} has no verification to re-evaluate`);
    }
    const project = await getProject();
    const policy = evaluatePolicy({
      score: verification.score,
      passThreshold: project.passThreshold,
      amountCents: milestone.amountCents,
      autoPayLimitCents: project.autoPayLimitCents,
      capturedTotalCents: await capturedTotalCents(project.id),
      budgetCapCents: project.budgetCapCents,
    });
    await insertEvent(
      milestoneId,
      "client",
      "policy_rerun",
      `Re-ran policy with snapshot ${JSON.stringify(policySnapshot(project))} and score ${verification.score}: ${policy.action}${policy.reasons.length ? ` (${policy.reasons.join("; ")})` : ""}.`,
    );

    if (policy.action === "ESCALATE") {
      if (milestone.state === "VERIFIED") {
        await transitionTo(milestone, "ESCALATED");
        await insertEvent(
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
      await handleCaptureFailure(milestoneId, "client", "Policy re-run capture", err);
    }
    return { action: "AUTO_CAPTURE" };
  }

  async function updatePolicy(patch: PolicyPatch): Promise<void> {
    const project = await getProject();
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
    await updateProjectPolicy(project.id, next);
    await insertEvent(null, "client", "policy_updated", JSON.stringify(next));
  }

  async function resetDemoFlow(): Promise<void> {
    const failures: string[] = [];
    for (const milestone of (await getState()).milestones) {
      if (LIVE_VOID_STATES.has(milestone.state) && milestone.paypalAuthorizationId) {
        try {
          await paypal.voidAuthorization(milestone.paypalAuthorizationId);
        } catch (err) {
          failures.push(`${milestone.id}: ${errorMessage(err)}`);
        }
      }
    }
    await resetDemo();
    await insertEvent(
      null,
      "system",
      "demo_reset",
      failures.length
        ? `Demo reset. Void failures: ${failures.join("; ")}`
        : "Demo reset.",
    );
  }

  // Every public mutation is serialized: a queued call re-reads state only
  // after the previous mutation has fully settled (PayPal + DB writes).
  return {
    fundMilestone: (milestoneId: string) =>
      runExclusive(() => fundMilestone(milestoneId)),
    confirmAuthorization: (milestoneId: string, orderId: string) =>
      runExclusive(() => confirmAuthorization(milestoneId, orderId)),
    submitDeliverable: (milestoneId: string, input: SubmitDeliverableInput) =>
      runExclusive(() => submitDeliverable(milestoneId, input)),
    decide: (milestoneId: string) => runExclusive(() => decide(milestoneId)),
    approveCapture: (milestoneId: string) =>
      runExclusive(() => approveCapture(milestoneId)),
    rejectVoid: (milestoneId: string) => runExclusive(() => rejectVoid(milestoneId)),
    rerunPolicy: (milestoneId: string) => runExclusive(() => rerunPolicy(milestoneId)),
    updatePolicy: (patch: PolicyPatch) => runExclusive(() => updatePolicy(patch)),
    resetDemoFlow: () => runExclusive(() => resetDemoFlow()),
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
