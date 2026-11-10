import type { ItemVerdict, MilestoneState } from "@/lib/types";

export type Role = "client" | "freelancer";

export interface Project {
  id: string;
  title: string;
  clientName: string;
  freelancerName: string;
  budgetCapCents: number;
  autoPayLimitCents: number;
  passThreshold: number;
}

export interface Milestone {
  id: string;
  projectId: string;
  title: string;
  brief: string;
  checklist: string[];
  amountCents: number;
  state: MilestoneState;
  paypalOrderId: string | null;
  paypalAuthorizationId: string | null;
  paypalCaptureId: string | null;
  authorizationExpiresAt: string | null;
  fundingAttemptId: string | null;
}

export interface Deliverable {
  id: number;
  milestoneId: string;
  kind: string;
  filename: string | null;
  link: string | null;
  note: string;
  extractedText: string;
  createdAt: string;
}

export interface Verification {
  id: number;
  milestoneId: string;
  provider: string;
  items: ItemVerdict[];
  score: number;
  summary: string;
  createdAt: string;
}

export interface LedgerEntry {
  id: number;
  milestoneId: string;
  kind: string;
  amountCents: number;
  status: string;
  createdAt: string;
}

export interface AgentEvent {
  id: number;
  milestoneId: string | null;
  actor: string;
  action: string;
  detail: string;
  createdAt: string;
}

export interface DemoState {
  project: Project;
  milestones: Milestone[];
  deliverables: Deliverable[];
  verifications: Verification[];
  ledger: LedgerEntry[];
  events: AgentEvent[];
}

export function formatMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const data = (await res.json()) as unknown;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }
  } catch {
    // fall through to the generic message below
  }
  throw new Error(`Request failed (${res.status})`);
}

function stateFrom(data: Record<string, unknown>): DemoState {
  if (!data.state || typeof data.state !== "object") {
    throw new Error("Server response did not include demo state");
  }
  return data.state as DemoState;
}

/** GET /api/state returns the bare DemoState (not the {ok,state} envelope). */
export async function loadDemoState(): Promise<DemoState> {
  const res = await fetch("/api/state", { cache: "no-store" });
  if (!res.ok) {
    const data = await parseJson(res).catch(() => null);
    const message =
      data && typeof data.error === "string"
        ? data.error
        : `Failed to load demo state (${res.status})`;
    throw new Error(message);
  }
  return (await res.json()) as DemoState;
}

async function mutation(
  path: string,
  method: "POST" | "PATCH",
  body?: Record<string, unknown>,
): Promise<DemoState> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
  } catch (err) {
    throw new Error(`Network error: ${errorMessage(err)}`);
  }
  const data = await parseJson(res);
  if (!res.ok || data.ok !== true) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : `Request failed (${res.status})`,
    );
  }
  return stateFrom(data);
}

export function postMutation(
  path: string,
  body?: Record<string, unknown>,
): Promise<DemoState> {
  return mutation(path, "POST", body);
}

export function patchMutation(
  path: string,
  body: Record<string, unknown>,
): Promise<DemoState> {
  return mutation(path, "PATCH", body);
}

/** POST /api/paypal/create-order — returns the orderId plus refreshed state. */
export async function createPayPalOrder(
  milestoneId: string,
): Promise<{ orderId: string; state: DemoState }> {
  const res = await fetch("/api/paypal/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ milestoneId }),
  });
  const data = await parseJson(res);
  if (!res.ok || data.ok !== true) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : `Request failed (${res.status})`,
    );
  }
  if (typeof data.orderId !== "string" || !data.orderId) {
    throw new Error("Server response did not include a PayPal order ID");
  }
  return { orderId: data.orderId, state: stateFrom(data) };
}

/** POST /api/paypal/authorize — returns refreshed state after the hold. */
export async function authorizePayPalOrder(
  milestoneId: string,
  orderId: string,
): Promise<DemoState> {
  return postMutation("/api/paypal/authorize", { milestoneId, orderId });
}
