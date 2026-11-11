import { createClient, type Client, type InStatement, type ResultSet } from "@libsql/client";
import { DEMO, MILESTONE1_CHECKLIST, MILESTONE2_CHECKLIST } from "./constants";

/** Minimal executor shared by a libSQL Client and a libSQL Transaction. */
export interface SqlExecutor {
  execute(stmt: InStatement): Promise<ResultSet>;
}

const PROJECT_ID = "demo-project";
const MILESTONE1_ID = "milestone-1";
const MILESTONE2_ID = "milestone-2";

const MILESTONE1_BRIEF =
  "Create the primary logo for Sarah's coffee startup. Explore at least two distinct logo concepts built around a coffee cup motif, supply the artwork as editable vector SVG files, propose a colour palette with primary and secondary brand colours, and provide stacked and horizontal lockup variations for light and dark backgrounds, including a monochrome version.";

const MILESTONE2_BRIEF =
  "Turn the approved logo into a full brand kit. Set a typography system with heading and body font pairings, design a business card and letterhead ready for print, create social media templates for Instagram posts and stories, design the coffee bag packaging using the new brand colours, and write a brand guidelines document covering usage rules, spacing and tone of voice.";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  client_name TEXT NOT NULL,
  freelancer_name TEXT NOT NULL,
  budget_cap_cents INTEGER NOT NULL,
  auto_pay_limit_cents INTEGER NOT NULL,
  pass_threshold INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  brief TEXT NOT NULL,
  checklist_json TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  state TEXT NOT NULL,
  paypal_order_id TEXT,
  paypal_authorization_id TEXT,
  paypal_capture_id TEXT,
  authorization_expires_at TEXT,
  funding_attempt_id TEXT
);
CREATE TABLE IF NOT EXISTS deliverables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  filename TEXT,
  link TEXT,
  note TEXT NOT NULL,
  extracted_text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  items_json TEXT NOT NULL,
  score INTEGER NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  milestone_id TEXT REFERENCES milestones(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

const PASSTHROUGH_PREFIXES = [":memory:", "file:", "libsql:", "https:", "wss:"];

function resolveConfig(): { url: string; authToken?: string } {
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim() || undefined;
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  if (tursoUrl) {
    return authToken ? { url: tursoUrl, authToken } : { url: tursoUrl };
  }
  const rawPath = process.env.RILIS_DB_PATH?.trim();
  if (!rawPath) {
    return authToken ? { url: ":memory:", authToken } : { url: ":memory:" };
  }
  const url = PASSTHROUGH_PREFIXES.some((prefix) => rawPath.startsWith(prefix))
    ? rawPath
    : `file:${rawPath}`;
  return authToken ? { url, authToken } : { url };
}

let cached: { key: string; promise: Promise<Client> } | null = null;

async function initClient(client: Client): Promise<Client> {
  await client.executeMultiple(SCHEMA);
  await ensureFundingAttemptColumn(client);
  await seedIfEmpty(client);
  return client;
}

export function getClient(): Promise<Client> {
  const config = resolveConfig();
  const key = JSON.stringify([config.url, config.authToken ?? null]);
  if (cached && cached.key === key) {
    return cached.promise;
  }
  if (cached) {
    const stale = cached;
    void stale.promise.then(
      (client) => client.close(),
      () => undefined,
    );
  }
  const promise = initClient(createClient(config));
  cached = { key, promise };
  void promise.catch(() => {
    if (cached?.promise === promise) {
      cached = null;
    }
  });
  return promise;
}

/** Add funding_attempt_id to DBs created before the column existed. */
async function ensureFundingAttemptColumn(db: SqlExecutor): Promise<void> {
  const result = await db.execute("PRAGMA table_info(milestones)");
  const columns = result.rows as unknown as Array<{ name: string }>;
  if (!columns.some((c) => c.name === "funding_attempt_id")) {
    await db.execute("ALTER TABLE milestones ADD COLUMN funding_attempt_id TEXT");
  }
}

/** Insert the demo project + milestones if the projects table is empty. */
export async function seedIfEmpty(db: SqlExecutor): Promise<void> {
  const result = await db.execute("SELECT COUNT(*) AS n FROM projects");
  const row = result.rows[0] as unknown as { n: number | bigint } | undefined;
  if (row && Number(row.n) > 0) {
    return;
  }
  await seedDemo(db);
}

/** Insert the seeded demo project and its two DRAFT milestones. */
export async function seedDemo(db: SqlExecutor): Promise<void> {
  await db.execute({
    sql: `INSERT INTO projects
       (id, title, client_name, freelancer_name, budget_cap_cents, auto_pay_limit_cents, pass_threshold)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      PROJECT_ID,
      "Brand logo for Sarah's coffee startup",
      "Sarah (Austin, US)",
      "Bima (Yogyakarta, ID)",
      DEMO.budgetCapCents,
      DEMO.autoPayLimitCents,
      DEMO.passThreshold,
    ],
  });
  await db.execute({
    sql: `INSERT INTO milestones
       (id, project_id, title, brief, checklist_json, amount_cents, state)
     VALUES (?, ?, ?, ?, ?, ?, 'DRAFT')`,
    args: [
      MILESTONE1_ID,
      PROJECT_ID,
      "Primary logo concepts",
      MILESTONE1_BRIEF,
      JSON.stringify(MILESTONE1_CHECKLIST),
      20000,
    ],
  });
  await db.execute({
    sql: `INSERT INTO milestones
       (id, project_id, title, brief, checklist_json, amount_cents, state)
     VALUES (?, ?, ?, ?, ?, ?, 'DRAFT')`,
    args: [
      MILESTONE2_ID,
      PROJECT_ID,
      "Full brand kit",
      MILESTONE2_BRIEF,
      JSON.stringify(MILESTONE2_CHECKLIST),
      60000,
    ],
  });
}

/** Delete every row in every table (children first, FK-safe). */
export async function clearAll(db: SqlExecutor): Promise<void> {
  await db.execute("DELETE FROM agent_events");
  await db.execute("DELETE FROM ledger_entries");
  await db.execute("DELETE FROM verifications");
  await db.execute("DELETE FROM deliverables");
  await db.execute("DELETE FROM milestones");
  await db.execute("DELETE FROM projects");
}
