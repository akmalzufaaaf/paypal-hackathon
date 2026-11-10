"use client";

import { useState } from "react";

import type { Role } from "./demo-client";

interface ResetButtonProps {
  role: Role;
  busy: boolean;
  onReset: () => Promise<boolean>;
}

export default function ResetButton({ role, busy, onReset }: ResetButtonProps) {
  const isClient = role === "client";
  const [resetting, setResetting] = useState(false);

  async function handleClick() {
    const confirmed = window.confirm(
      "Reset the demo? Any live PayPal hold will be voided (best effort) and the seeded project will be restored.",
    );
    if (!confirmed) return;
    setResetting(true);
    await onReset().finally(() => setResetting(false));
  }

  return (
    <section className="panel reset-panel" aria-label="Reset demo">
      <h2>Reset demo</h2>
      <p className="muted small">
        Voids any live hold (best effort) and restores the seeded project so
        the next viewer starts from the beginning.
      </p>
      {!isClient ? (
        <p className="hint">Switch to the Client role to reset the demo.</p>
      ) : null}
      <button
        type="button"
        className="btn danger"
        disabled={!isClient || busy}
        onClick={() => void handleClick()}
      >
        {resetting ? "Resetting…" : "Reset demo"}
      </button>
    </section>
  );
}
