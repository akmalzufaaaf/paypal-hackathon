"use client";

import { useState } from "react";

import { formatMoney, type Project, type Role } from "./demo-client";

export interface PolicyPatch {
  budgetCapCents: number;
  autoPayLimitCents: number;
  passThreshold: number;
}

interface PolicyPanelProps {
  project: Project;
  role: Role;
  busy: boolean;
  onSave: (patch: PolicyPatch) => Promise<boolean>;
}

function dollarsToCents(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

export default function PolicyPanel({
  project,
  role,
  busy,
  onSave,
}: PolicyPanelProps) {
  const [capDollars, setCapDollars] = useState(String(project.budgetCapCents / 100));
  const [limitDollars, setLimitDollars] = useState(
    String(project.autoPayLimitCents / 100),
  );
  const [threshold, setThreshold] = useState(String(project.passThreshold));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The parent remounts this panel (via `key`) when saved policy changes,
  // so local inputs always start from the persisted project values.
  const isClient = role === "client";
  const budgetCapCents = dollarsToCents(capDollars);
  const autoPayLimitCents = dollarsToCents(limitDollars);
  const passThreshold = Number(threshold);
  const thresholdValid =
    Number.isInteger(passThreshold) && passThreshold >= 0 && passThreshold <= 100;
  const valid =
    budgetCapCents !== null && autoPayLimitCents !== null && thresholdValid;

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || saving) return; // global mutation lock
    if (budgetCapCents === null || autoPayLimitCents === null || !thresholdValid) {
      setFormError(
        "Enter a budget cap and auto-pay limit of $0 or more, and a threshold between 0 and 100.",
      );
      return;
    }
    setFormError(null);
    setSaving(true);
    await onSave({ budgetCapCents, autoPayLimitCents, passThreshold }).finally(
      () => setSaving(false),
    );
  }

  return (
    <section className="panel policy-panel" aria-label="Agent policy">
      <h2>Agent policy</h2>
      <p className="muted small">
        Current: budget cap {formatMoney(project.budgetCapCents)} · auto-pay
        limit {formatMoney(project.autoPayLimitCents)} · pass threshold{" "}
        {project.passThreshold}. Saving a new policy is logged and never
        re-runs a decision on its own — use <strong>Re-run policy</strong> on a
        milestone for that.
      </p>
      {!isClient ? (
        <p className="hint">Switch to the Client role to edit policy.</p>
      ) : null}
      <form onSubmit={handleSave} className="policy-form">
        <label className="field">
          <span>Budget cap (USD, hard ceiling)</span>
          <input
            type="number"
            min="0"
            step="1"
            value={capDollars}
            onChange={(event) => setCapDollars(event.target.value)}
            disabled={!isClient || busy}
          />
        </label>
        <label className="field">
          <span>Auto-pay limit (USD)</span>
          <input
            type="number"
            min="0"
            step="1"
            value={limitDollars}
            onChange={(event) => setLimitDollars(event.target.value)}
            disabled={!isClient || busy}
          />
        </label>
        <label className="field">
          <span>AI pass threshold (0–100)</span>
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            disabled={!isClient || busy}
          />
        </label>
        {formError ? (
          <p className="alert" role="alert">
            {formError}
          </p>
        ) : null}
        <button
          type="submit"
          className="btn"
          disabled={!isClient || busy || !valid}
        >
          {saving ? "Saving…" : "Save policy"}
        </button>
      </form>
    </section>
  );
}
