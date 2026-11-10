import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { DEMO, MILESTONE1_CHECKLIST, MILESTONE2_CHECKLIST } from "./constants";

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
  authorization_expires_at TEXT
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

let cached: { key: string; db: Database.Database } | null = null;

export function getDb(): Database.Database {
  const rawPath = process.env.RILIS_DB_PATH ?? "./data/rilis.db";
  const isMemory = rawPath === ":memory:";
  const key = isMemory ? ":memory:" : path.resolve(rawPath);

  if (cached && cached.key === key) {
    return cached.db;
  }
  if (cached) {
    cached.db.close();
    cached = null;
  }

  if (!isMemory) {
    fs.mkdirSync(path.dirname(key), { recursive: true });
  }
  const db = new Database(key);
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  seedIfEmpty(db);
  cached = { key, db };
  return db;
}

/** Insert the demo project + milestones if the projects table is empty. */
export function seedIfEmpty(db: Database.Database): void {
  const row = db.prepare("SELECT COUNT(*) AS n FROM projects").get() as {
    n: number;
  };
  if (row.n > 0) {
    return;
  }
  seedDemo(db);
}

/** Insert the seeded demo project and its two DRAFT milestones. */
export function seedDemo(db: Database.Database): void {
  const insertProject = db.prepare(
    `INSERT INTO projects
       (id, title, client_name, freelancer_name, budget_cap_cents, auto_pay_limit_cents, pass_threshold)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertMilestone = db.prepare(
    `INSERT INTO milestones
       (id, project_id, title, brief, checklist_json, amount_cents, state)
     VALUES (?, ?, ?, ?, ?, ?, 'DRAFT')`,
  );
  const seed = db.transaction(() => {
    insertProject.run(
      PROJECT_ID,
      "Brand logo for Sarah's coffee startup",
      "Sarah (Austin, US)",
      "Bima (Yogyakarta, ID)",
      DEMO.budgetCapCents,
      DEMO.autoPayLimitCents,
      DEMO.passThreshold,
    );
    insertMilestone.run(
      MILESTONE1_ID,
      PROJECT_ID,
      "Primary logo concepts",
      MILESTONE1_BRIEF,
      JSON.stringify(MILESTONE1_CHECKLIST),
      20000,
    );
    insertMilestone.run(
      MILESTONE2_ID,
      PROJECT_ID,
      "Full brand kit",
      MILESTONE2_BRIEF,
      JSON.stringify(MILESTONE2_CHECKLIST),
      60000,
    );
  });
  seed();
}

/** Delete every row in every table (children first, FK-safe). */
export function clearAll(db: Database.Database): void {
  const clear = db.transaction(() => {
    db.exec(
      `DELETE FROM agent_events;
       DELETE FROM ledger_entries;
       DELETE FROM verifications;
       DELETE FROM deliverables;
       DELETE FROM milestones;
       DELETE FROM projects;`,
    );
  });
  clear();
}
