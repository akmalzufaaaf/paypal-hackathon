import type { Transaction } from "@libsql/client";

import { clearAll, getClient, seedDemo, type SqlExecutor } from "./db";
import type { ItemVerdict, MilestoneState } from "./types";

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

type Numeric = number | bigint;

type ProjectRow = {
  id: string;
  title: string;
  client_name: string;
  freelancer_name: string;
  budget_cap_cents: Numeric;
  auto_pay_limit_cents: Numeric;
  pass_threshold: Numeric;
};

type MilestoneRow = {
  id: string;
  project_id: string;
  title: string;
  brief: string;
  checklist_json: string;
  amount_cents: Numeric;
  state: string;
  paypal_order_id: string | null;
  paypal_authorization_id: string | null;
  paypal_capture_id: string | null;
  authorization_expires_at: string | null;
  funding_attempt_id: string | null;
};

type DeliverableRow = {
  id: Numeric;
  milestone_id: string;
  kind: string;
  filename: string | null;
  link: string | null;
  note: string;
  extracted_text: string;
  created_at: string;
};

type VerificationRow = {
  id: Numeric;
  milestone_id: string;
  provider: string;
  items_json: string;
  score: Numeric;
  summary: string;
  created_at: string;
};

type LedgerRow = {
  id: Numeric;
  milestone_id: string;
  kind: string;
  amount_cents: Numeric;
  status: string;
  created_at: string;
};

type EventRow = {
  id: Numeric;
  milestone_id: string | null;
  actor: string;
  action: string;
  detail: string;
  created_at: string;
};

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    title: row.title,
    clientName: row.client_name,
    freelancerName: row.freelancer_name,
    budgetCapCents: Number(row.budget_cap_cents),
    autoPayLimitCents: Number(row.auto_pay_limit_cents),
    passThreshold: Number(row.pass_threshold),
  };
}

function toMilestone(row: MilestoneRow): Milestone {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    brief: row.brief,
    checklist: JSON.parse(row.checklist_json) as string[],
    amountCents: Number(row.amount_cents),
    state: row.state as MilestoneState,
    paypalOrderId: row.paypal_order_id,
    paypalAuthorizationId: row.paypal_authorization_id,
    paypalCaptureId: row.paypal_capture_id,
    authorizationExpiresAt: row.authorization_expires_at,
    fundingAttemptId: row.funding_attempt_id,
  };
}

function toDeliverable(row: DeliverableRow): Deliverable {
  return {
    id: Number(row.id),
    milestoneId: row.milestone_id,
    kind: row.kind,
    filename: row.filename,
    link: row.link,
    note: row.note,
    extractedText: row.extracted_text,
    createdAt: row.created_at,
  };
}

function toVerification(row: VerificationRow): Verification {
  return {
    id: Number(row.id),
    milestoneId: row.milestone_id,
    provider: row.provider,
    items: JSON.parse(row.items_json) as ItemVerdict[],
    score: Number(row.score),
    summary: row.summary,
    createdAt: row.created_at,
  };
}

function toLedgerEntry(row: LedgerRow): LedgerEntry {
  return {
    id: Number(row.id),
    milestoneId: row.milestone_id,
    kind: row.kind,
    amountCents: Number(row.amount_cents),
    status: row.status,
    createdAt: row.created_at,
  };
}

function toAgentEvent(row: EventRow): AgentEvent {
  return {
    id: Number(row.id),
    milestoneId: row.milestone_id,
    actor: row.actor,
    action: row.action,
    detail: row.detail,
    createdAt: row.created_at,
  };
}

const MILESTONE_COLUMNS =
  "id, project_id, title, brief, checklist_json, amount_cents, state, paypal_order_id, paypal_authorization_id, paypal_capture_id, authorization_expires_at, funding_attempt_id";

async function getMilestoneRow(
  executor: SqlExecutor,
  id: string,
): Promise<Milestone> {
  const result = await executor.execute({
    sql: `SELECT ${MILESTONE_COLUMNS} FROM milestones WHERE id = ?`,
    args: [id],
  });
  const row = result.rows[0] as unknown as MilestoneRow | undefined;
  if (!row) {
    throw new Error(`milestone not found: ${id}`);
  }
  return toMilestone(row);
}

/** Full demo state. Events are chronological (newest last) for log rendering. */
export async function getState(): Promise<DemoState> {
  const client = await getClient();
  const projectResult = await client.execute(
    "SELECT * FROM projects ORDER BY rowid LIMIT 1",
  );
  const projectRow = projectResult.rows[0] as unknown as ProjectRow | undefined;
  if (!projectRow) {
    throw new Error("demo project is not seeded");
  }
  const milestoneResult = await client.execute({
    sql: `SELECT ${MILESTONE_COLUMNS} FROM milestones WHERE project_id = ? ORDER BY rowid`,
    args: [projectRow.id],
  });
  const deliverableResult = await client.execute(
    "SELECT * FROM deliverables ORDER BY id",
  );
  const verificationResult = await client.execute(
    "SELECT * FROM verifications ORDER BY id",
  );
  const ledgerResult = await client.execute(
    "SELECT * FROM ledger_entries ORDER BY id",
  );
  const eventResult = await client.execute(
    "SELECT * FROM agent_events ORDER BY id",
  );

  return {
    project: toProject(projectRow),
    milestones: (milestoneResult.rows as unknown as MilestoneRow[]).map(toMilestone),
    deliverables: (deliverableResult.rows as unknown as DeliverableRow[]).map(
      toDeliverable,
    ),
    verifications: (verificationResult.rows as unknown as VerificationRow[]).map(
      toVerification,
    ),
    ledger: (ledgerResult.rows as unknown as LedgerRow[]).map(toLedgerEntry),
    events: (eventResult.rows as unknown as EventRow[]).map(toAgentEvent),
  };
}

export interface MilestonePatch {
  state?: MilestoneState;
  paypalOrderId?: string | null;
  paypalAuthorizationId?: string | null;
  paypalCaptureId?: string | null;
  authorizationExpiresAt?: string | null;
  fundingAttemptId?: string | null;
}

const PATCH_COLUMNS: Record<keyof MilestonePatch, string> = {
  state: "state",
  paypalOrderId: "paypal_order_id",
  paypalAuthorizationId: "paypal_authorization_id",
  paypalCaptureId: "paypal_capture_id",
  authorizationExpiresAt: "authorization_expires_at",
  fundingAttemptId: "funding_attempt_id",
};

export async function updateMilestone(
  id: string,
  patch: MilestonePatch,
): Promise<Milestone> {
  const client = await getClient();
  const entries = Object.entries(patch).filter(
    ([, value]) => value !== undefined,
  ) as Array<[keyof MilestonePatch, string | null]>;
  if (entries.length === 0) {
    return getMilestoneRow(client, id);
  }
  const assignments = entries
    .map(([key]) => `${PATCH_COLUMNS[key]} = ?`)
    .join(", ");
  const result = await client.execute({
    sql: `UPDATE milestones SET ${assignments} WHERE id = ?`,
    args: [...entries.map(([, value]) => value), id],
  });
  if (result.rowsAffected === 0) {
    throw new Error(`milestone not found: ${id}`);
  }
  return getMilestoneRow(client, id);
}

export interface DeliverableInput {
  milestoneId: string;
  kind?: string;
  filename?: string | null;
  link?: string | null;
  note: string;
  extractedText?: string;
}

export async function insertDeliverable(
  input: DeliverableInput,
): Promise<Deliverable> {
  const client = await getClient();
  const createdAt = new Date().toISOString();
  const result = await client.execute({
    sql: `INSERT INTO deliverables (milestone_id, kind, filename, link, note, extracted_text, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.milestoneId,
      input.kind ?? "note",
      input.filename ?? null,
      input.link ?? null,
      input.note,
      input.extractedText ?? "",
      createdAt,
    ],
  });
  const rowResult = await client.execute({
    sql: "SELECT * FROM deliverables WHERE id = ?",
    args: [Number(result.lastInsertRowid)],
  });
  return toDeliverable(rowResult.rows[0] as unknown as DeliverableRow);
}

export interface VerificationInput {
  milestoneId: string;
  provider: string;
  items: ItemVerdict[];
  score: number;
  summary: string;
}

export async function insertVerification(
  input: VerificationInput,
): Promise<Verification> {
  const client = await getClient();
  const createdAt = new Date().toISOString();
  const result = await client.execute({
    sql: `INSERT INTO verifications (milestone_id, provider, items_json, score, summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      input.milestoneId,
      input.provider,
      JSON.stringify(input.items),
      input.score,
      input.summary,
      createdAt,
    ],
  });
  const rowResult = await client.execute({
    sql: "SELECT * FROM verifications WHERE id = ?",
    args: [Number(result.lastInsertRowid)],
  });
  return toVerification(rowResult.rows[0] as unknown as VerificationRow);
}

async function insertLedgerReleaseOn(
  executor: SqlExecutor,
  milestoneId: string,
  amountCents: number,
): Promise<LedgerEntry> {
  const createdAt = new Date().toISOString();
  const result = await executor.execute({
    sql: `INSERT INTO ledger_entries (milestone_id, kind, amount_cents, status, created_at)
       VALUES (?, 'release', ?, 'simulated', ?)`,
    args: [milestoneId, amountCents, createdAt],
  });
  const rowResult = await executor.execute({
    sql: "SELECT * FROM ledger_entries WHERE id = ?",
    args: [Number(result.lastInsertRowid)],
  });
  return toLedgerEntry(rowResult.rows[0] as unknown as LedgerRow);
}

/** Simulated payout ledger entry (no real PayPal Payouts call). */
export async function insertLedgerRelease(
  milestoneId: string,
  amountCents: number,
): Promise<LedgerEntry> {
  const client = await getClient();
  return insertLedgerReleaseOn(client, milestoneId, amountCents);
}

async function insertEventOn(
  executor: SqlExecutor,
  milestoneId: string | null,
  actor: string,
  action: string,
  detail: string,
): Promise<AgentEvent> {
  const createdAt = new Date().toISOString();
  const result = await executor.execute({
    sql: `INSERT INTO agent_events (milestone_id, actor, action, detail, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    args: [milestoneId, actor, action, detail, createdAt],
  });
  const rowResult = await executor.execute({
    sql: "SELECT * FROM agent_events WHERE id = ?",
    args: [Number(result.lastInsertRowid)],
  });
  return toAgentEvent(rowResult.rows[0] as unknown as EventRow);
}

export async function insertEvent(
  milestoneId: string | null,
  actor: string,
  action: string,
  detail: string,
): Promise<AgentEvent> {
  const client = await getClient();
  return insertEventOn(client, milestoneId, actor, action, detail);
}

/** Sum of milestone amounts in CAPTURED or RELEASED state (integer cents). */
export async function capturedTotalCents(projectId: string): Promise<number> {
  const client = await getClient();
  const result = await client.execute({
    sql: `SELECT COALESCE(SUM(amount_cents), 0) AS total
       FROM milestones
       WHERE project_id = ? AND state IN ('CAPTURED', 'RELEASED')`,
    args: [projectId],
  });
  const row = result.rows[0] as unknown as { total: Numeric };
  return Number(row.total);
}

export interface ProjectPolicy {
  budgetCapCents: number;
  autoPayLimitCents: number;
  passThreshold: number;
}

export async function updateProjectPolicy(
  projectId: string,
  policy: ProjectPolicy,
): Promise<void> {
  const client = await getClient();
  await client.execute({
    sql: "UPDATE projects SET budget_cap_cents = ?, auto_pay_limit_cents = ?, pass_threshold = ? WHERE id = ?",
    args: [
      policy.budgetCapCents,
      policy.autoPayLimitCents,
      policy.passThreshold,
      projectId,
    ],
  });
}

/**
 * RELEASED transition + ledger release + audit events as one write
 * transaction: either all persist, or the milestone stays CAPTURED.
 */
export async function completeRelease(
  milestone: Milestone,
  actor: string,
): Promise<void> {
  const client = await getClient();
  const tx: Transaction = await client.transaction("write");
  try {
    const result = await tx.execute({
      sql: "UPDATE milestones SET state = 'RELEASED' WHERE id = ? AND state = 'CAPTURED'",
      args: [milestone.id],
    });
    if (result.rowsAffected !== 1) {
      throw new Error(
        `milestone ${milestone.id} is not CAPTURED; cannot complete release`,
      );
    }
    await insertLedgerReleaseOn(tx, milestone.id, milestone.amountCents);
    await insertEventOn(
      tx,
      milestone.id,
      actor,
      "captured",
      `Captured authorization ${milestone.paypalAuthorizationId} as capture ${milestone.paypalCaptureId} for ${milestone.amountCents} cents.`,
    );
    await insertEventOn(
      tx,
      milestone.id,
      actor,
      "released",
      `Released ${milestone.amountCents} cents for milestone ${milestone.id} (simulated payout, capture ${milestone.paypalCaptureId}).`,
    );
    await tx.commit();
  } catch (err) {
    if (!tx.closed) {
      await tx.rollback().catch(() => undefined);
    }
    throw err;
  } finally {
    tx.close();
  }
}

/** Clear all tables and re-seed the demo. PayPal void is handled in Task 6. */
export async function resetDemo(): Promise<void> {
  const client = await getClient();
  const tx: Transaction = await client.transaction("write");
  try {
    await clearAll(tx);
    await seedDemo(tx);
    await tx.commit();
  } catch (err) {
    if (!tx.closed) {
      await tx.rollback().catch(() => undefined);
    }
    throw err;
  } finally {
    tx.close();
  }
}
