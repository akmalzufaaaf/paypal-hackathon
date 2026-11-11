/**
 * Shared helpers for the thin API route adapters (Task 7).
 *
 * Response contract: success `{ ok: true, state }` where `state` is
 * `getState()` after the mutation; failure `{ ok: false, error }` with
 * 400 for bad transition/input, 502 for PayPal failures and 500 (generic
 * message, never a stack trace or env value) for anything else.
 */

import { connection, NextResponse } from "next/server";

import { PayPalError } from "./paypal";
import { getState } from "./repo";
import {
  InvalidTransitionError,
  PolicyBlocked,
  type PolicyPatch,
  type SubmitDeliverableInput,
} from "./workflow";

/**
 * Opt out of prerendering/static caching for this request. This repo uses
 * Next 16 Cache Components (`cacheComponents: true`), where
 * `export const dynamic = "force-dynamic"` is rejected; the bundled docs
 * prescribe `await connection()` before synchronous DB reads instead
 * (node_modules/next/dist/docs/.../connection.md). Route handlers call this
 * before reading or mutating state.
 */
export async function requestTime(): Promise<void> {
  await connection();
}

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

/** Workflow messages that describe client-correctable state/input problems. */
const WORKFLOW_400_PATTERNS: RegExp[] = [
  /milestone not found/,
  /a delivery note is required/,
  /invalid policy value/,
  /has no deliverable/,
  /has no verification/,
  /has no authorization to (capture|void)/,
];

export function mapError(err: unknown): { status: number; error: string } {
  if (err instanceof BadRequestError) {
    return { status: 400, error: err.message };
  }
  if (err instanceof PayPalError) {
    return { status: 502, error: err.message };
  }
  if (err instanceof InvalidTransitionError || err instanceof PolicyBlocked) {
    return { status: 400, error: err.message };
  }
  if (
    err instanceof Error &&
    WORKFLOW_400_PATTERNS.some((pattern) => pattern.test(err.message))
  ) {
    return { status: 400, error: err.message };
  }
  return { status: 500, error: "Internal server error" };
}

export function errorResponse(err: unknown): NextResponse {
  const { status, error } = mapError(err);
  if (status >= 500) {
    // Server-side only: the client still gets the generic message.
    console.error("[api] request failed:", err);
  }
  return NextResponse.json({ ok: false, error }, { status });
}

export async function okResponse(
  extra: Record<string, unknown> = {},
): Promise<NextResponse> {
  return NextResponse.json({ ok: true, state: await getState(), ...extra });
}

const MILESTONE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Milestone ids are string keys (e.g. "milestone-1"); reject malformed ids. */
export function parseMilestoneId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128 ||
    !MILESTONE_ID_PATTERN.test(value)
  ) {
    throw new BadRequestError("invalid milestone id");
  }
  return value;
}

export function requireStringField(
  body: Record<string, unknown>,
  field: string,
): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestError(`${field} is required`);
  }
  return value;
}

function optionalStringField(
  body: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = body[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new BadRequestError(`${field} must be a string`);
  }
  return value;
}

async function readBodyText(req: Request): Promise<string> {
  try {
    return await req.text();
  } catch {
    throw new BadRequestError("request body must be valid JSON");
  }
}

function parseJsonObject(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new BadRequestError("request body must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new BadRequestError("request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

/** Body is required: missing/invalid JSON or a non-object body is a 400. */
export async function readJsonBody(
  req: Request,
): Promise<Record<string, unknown>> {
  const text = await readBodyText(req);
  if (text.trim().length === 0) {
    throw new BadRequestError("request body must be valid JSON");
  }
  return parseJsonObject(text);
}

/** Body is optional: an absent body is `{}`, a present invalid one is a 400. */
export async function readOptionalJsonBody(
  req: Request,
): Promise<Record<string, unknown>> {
  const text = await readBodyText(req);
  if (text.trim().length === 0) return {};
  return parseJsonObject(text);
}

export function parseDeliverableBody(
  body: Record<string, unknown>,
): SubmitDeliverableInput {
  const note = optionalStringField(body, "note");
  const link = optionalStringField(body, "link");
  const filename = optionalStringField(body, "filename");
  const extractedText = optionalStringField(body, "extractedText");
  if (![note, link, extractedText].some((value) => value?.trim())) {
    throw new BadRequestError(
      "at least one of note, link, or extractedText is required",
    );
  }
  return {
    note: note ?? "",
    link: link ?? null,
    filename: filename ?? null,
    extractedText: extractedText ?? "",
  };
}

const POLICY_FIELDS = [
  "budgetCapCents",
  "autoPayLimitCents",
  "passThreshold",
] as const;

export function parsePolicyBody(body: Record<string, unknown>): PolicyPatch {
  const patch: PolicyPatch = {};
  for (const field of POLICY_FIELDS) {
    const value = body[field];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new BadRequestError(`${field} must be a number`);
    }
    patch[field] = value;
  }
  if (Object.keys(patch).length === 0) {
    throw new BadRequestError(
      `at least one of ${POLICY_FIELDS.join(", ")} is required`,
    );
  }
  return patch;
}
