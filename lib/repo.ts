import { clearAll, getDb, seedDemo } from "./db";
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

type ProjectRow = {
  id: string;
  title: string;
  client_name: string;
  freelancer_name: string;
  budget_cap_cents: number;
  auto_pay_limit_cents: number;
  pass_threshold: number;
};

type MilestoneRow = {
  id: string;
  project_id: string;
  title: string;
  brief: string;
  checklist_json: string;
  amount_cents: number;
  state: string;
  paypal_order_id: string | null;
  paypal_authorization_id: string | null;
  paypal_capture_id: string | null;
  authorization_expires_at: string | null;
};

type DeliverableRow = {
  id: number;
  milestone_id: string;
  kind: string;
  filename: string | null;
  link: string | null;
  note: string;
  extracted_text: string;
  created_at: string;
};

type VerificationRow = {
  id: number;
  milestone_id: string;
  provider: string;
  items_json: string;
  score: number;
  summary: string;
  created_at: string;
};

type LedgerRow = {
  id: number;
  milestone_id: string;
  kind: string;
  amount_cents: number;
  status: string;
  created_at: string;
};

type EventRow = {
  id: number;
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
    budgetCapCents: row.budget_cap_cents,
    autoPayLimitCents: row.auto_pay_limit_cents,
    passThreshold: row.pass_threshold,
  };
}

function toMilestone(row: MilestoneRow): Milestone {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    brief: row.brief,
    checklist: JSON.parse(row.checklist_json) as string[],
    amountCents: row.amount_cents,
    state: row.state as MilestoneState,
    paypalOrderId: row.paypal_order_id,
    paypalAuthorizationId: row.paypal_authorization_id,
    paypalCaptureId: row.paypal_capture_id,
    authorizationExpiresAt: row.authorization_expires_at,
  };
}

function toDeliverable(row: DeliverableRow): Deliverable {
  return {
    id: row.id,
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
    id: row.id,
    milestoneId: row.milestone_id,
    provider: row.provider,
    items: JSON.parse(row.items_json) as ItemVerdict[],
    score: row.score,
    summary: row.summary,
    createdAt: row.created_at,
  };
}

function toLedgerEntry(row: LedgerRow): LedgerEntry {
  return {
    id: row.id,
    milestoneId: row.milestone_id,
    kind: row.kind,
    amountCents: row.amount_cents,
    status: row.status,
    createdAt: row.created_at,
  };
}

function toAgentEvent(row: EventRow): AgentEvent {
  return {
    id: row.id,
    milestoneId: row.milestone_id,
    actor: row.actor,
    action: row.action,
    detail: row.detail,
    createdAt: row.created_at,
  };
}

const MILESTONE_COLUMNS =
  "id, project_id, title, brief, checklist_json, amount_cents, state, paypal_order_id, paypal_authorization_id, paypal_capture_id, authorization_expires_at";

function getMilestoneRow(id: string): Milestone {
  const row = getDb()
    .prepare(`SELECT ${MILESTONE_COLUMNS} FROM milestones WHERE id = ?`)
    .get(id) as MilestoneRow | undefined;
  if (!row) {
    throw new Error(`milestone not found: ${id}`);
  }
  return toMilestone(row);
}

/** Full demo state. Events are chronological (newest last) for log rendering. */
export function getState(): DemoState {
  const db = getDb();
  const projectRow = db
    .prepare("SELECT * FROM projects ORDER BY rowid LIMIT 1")
    .get() as ProjectRow | undefined;
  if (!projectRow) {
    throw new Error("demo project is not seeded");
  }
  const milestoneRows = db
    .prepare(
      `SELECT ${MILESTONE_COLUMNS} FROM milestones WHERE project_id = ? ORDER BY rowid`,
    )
    .all(projectRow.id) as MilestoneRow[];
  const deliverableRows = db
    .prepare("SELECT * FROM deliverables ORDER BY id")
    .all() as DeliverableRow[];
  const verificationRows = db
    .prepare("SELECT * FROM verifications ORDER BY id")
    .all() as VerificationRow[];
  const ledgerRows = db
    .prepare("SELECT * FROM ledger_entries ORDER BY id")
    .all() as LedgerRow[];
  const eventRows = db
    .prepare("SELECT * FROM agent_events ORDER BY id")
    .all() as EventRow[];

  return {
    project: toProject(projectRow),
    milestones: milestoneRows.map(toMilestone),
    deliverables: deliverableRows.map(toDeliverable),
    verifications: verificationRows.map(toVerification),
    ledger: ledgerRows.map(toLedgerEntry),
    events: eventRows.map(toAgentEvent),
  };
}

export interface MilestonePatch {
  state?: MilestoneState;
  paypalOrderId?: string | null;
  paypalAuthorizationId?: string | null;
  paypalCaptureId?: string | null;
  authorizationExpiresAt?: string | null;
}

const PATCH_COLUMNS: Record<keyof MilestonePatch, string> = {
  state: "state",
  paypalOrderId: "paypal_order_id",
  paypalAuthorizationId: "paypal_authorization_id",
  paypalCaptureId: "paypal_capture_id",
  authorizationExpiresAt: "authorization_expires_at",
};

export function updateMilestone(id: string, patch: MilestonePatch): Milestone {
  const entries = Object.entries(patch).filter(
    ([, value]) => value !== undefined,
  ) as Array<[keyof MilestonePatch, string | null]>;
  if (entries.length === 0) {
    return getMilestoneRow(id);
  }
  const assignments = entries
    .map(([key]) => `${PATCH_COLUMNS[key]} = ?`)
    .join(", ");
  const result = getDb()
    .prepare(`UPDATE milestones SET ${assignments} WHERE id = ?`)
    .run(...entries.map(([, value]) => value), id);
  if (result.changes === 0) {
    throw new Error(`milestone not found: ${id}`);
  }
  return getMilestoneRow(id);
}

export interface DeliverableInput {
  milestoneId: string;
  kind?: string;
  filename?: string | null;
  link?: string | null;
  note: string;
  extractedText?: string;
}

export function insertDeliverable(input: DeliverableInput): Deliverable {
  const createdAt = new Date().toISOString();
  const result = getDb()
    .prepare(
      `INSERT INTO deliverables (milestone_id, kind, filename, link, note, extracted_text, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.milestoneId,
      input.kind ?? "note",
      input.filename ?? null,
      input.link ?? null,
      input.note,
      input.extractedText ?? "",
      createdAt,
    );
  const row = getDb()
    .prepare("SELECT * FROM deliverables WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as DeliverableRow;
  return toDeliverable(row);
}

export interface VerificationInput {
  milestoneId: string;
  provider: string;
  items: ItemVerdict[];
  score: number;
  summary: string;
}

export function insertVerification(input: VerificationInput): Verification {
  const createdAt = new Date().toISOString();
  const result = getDb()
    .prepare(
      `INSERT INTO verifications (milestone_id, provider, items_json, score, summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.milestoneId,
      input.provider,
      JSON.stringify(input.items),
      input.score,
      input.summary,
      createdAt,
    );
  const row = getDb()
    .prepare("SELECT * FROM verifications WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as VerificationRow;
  return toVerification(row);
}

/** Simulated payout ledger entry (no real PayPal Payouts call). */
export function insertLedgerRelease(
  milestoneId: string,
  amountCents: number,
): LedgerEntry {
  const createdAt = new Date().toISOString();
  const result = getDb()
    .prepare(
      `INSERT INTO ledger_entries (milestone_id, kind, amount_cents, status, created_at)
       VALUES (?, 'release', ?, 'simulated', ?)`,
    )
    .run(milestoneId, amountCents, createdAt);
  const row = getDb()
    .prepare("SELECT * FROM ledger_entries WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as LedgerRow;
  return toLedgerEntry(row);
}

export function insertEvent(
  milestoneId: string | null,
  actor: string,
  action: string,
  detail: string,
): AgentEvent {
  const createdAt = new Date().toISOString();
  const result = getDb()
    .prepare(
      `INSERT INTO agent_events (milestone_id, actor, action, detail, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(milestoneId, actor, action, detail, createdAt);
  const row = getDb()
    .prepare("SELECT * FROM agent_events WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as EventRow;
  return toAgentEvent(row);
}

/** Sum of milestone amounts in CAPTURED or RELEASED state (integer cents). */
export function capturedTotalCents(projectId: string): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total
       FROM milestones
       WHERE project_id = ? AND state IN ('CAPTURED', 'RELEASED')`,
    )
    .get(projectId) as { total: number };
  return row.total;
}

/** Clear all tables and re-seed the demo. PayPal void is handled in Task 6. */
export function resetDemo(): void {
  const db = getDb();
  const reset = db.transaction(() => {
    clearAll(db);
    seedDemo(db);
  });
  reset();
}
