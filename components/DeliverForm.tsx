"use client";

import { useState } from "react";

import {
  MILESTONE2_SAMPLE_DELIVERABLE_NOTE,
  SAMPLE_DELIVERABLE_NOTE,
} from "@/lib/constants";
import type { Milestone, Role } from "./demo-client";

export interface DeliverPayload {
  note: string;
  link: string | null;
  filename: string | null;
  extractedText: string;
}

interface DeliverFormProps {
  milestone: Milestone;
  role: Role;
  busy: boolean;
  onDeliver: (payload: DeliverPayload) => Promise<boolean>;
}

const SAMPLE_LINK = "https://example.com/sample-deliverable/primary-logo-concepts";
const SAMPLE_LINK_M2 = "https://example.com/sample-deliverable/full-brand-kit";

export default function DeliverForm({
  milestone,
  role,
  busy,
  onDeliver,
}: DeliverFormProps) {
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [filename, setFilename] = useState("");
  const [extractedText, setExtractedText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    role === "freelancer" &&
    milestone.state === "AUTHORIZED" &&
    !busy &&
    Boolean(note.trim() || link.trim() || extractedText.trim());

  function useSample() {
    // Seeded milestone IDs are stable, so select the sample by ID: the
    // Milestone-1 note scores 60 against the Milestone-2 checklist.
    const isBrandKit = milestone.id === "milestone-2";
    setNote(
      isBrandKit ? MILESTONE2_SAMPLE_DELIVERABLE_NOTE : SAMPLE_DELIVERABLE_NOTE,
    );
    setLink(isBrandKit ? SAMPLE_LINK_M2 : SAMPLE_LINK);
    setFormError(null);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    try {
      const text = await file.text();
      setFilename(file.name);
      setExtractedText(text);
      setFormError(null);
    } catch {
      setFormError("Could not read that file as text. Paste its text below instead.");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || submitting) return; // global mutation lock
    if (!note.trim() && !link.trim() && !extractedText.trim()) {
      setFormError("Add a delivery note, a link, or file text before submitting.");
      return;
    }
    setFormError(null);
    setSubmitting(true);
    const ok = await onDeliver({
      note: note.trim(),
      link: link.trim() ? link.trim() : null,
      filename: filename.trim() ? filename.trim() : null,
      extractedText,
    }).finally(() => setSubmitting(false));
    if (ok) {
      setNote("");
      setLink("");
      setFilename("");
      setExtractedText("");
    }
  }

  return (
    <form className="deliver-form" onSubmit={handleSubmit}>
      <h3>Submit deliverable</h3>
      {role !== "freelancer" ? (
        <p className="hint">Switch to the Freelancer role to submit a deliverable.</p>
      ) : null}

      <button
        type="button"
        className="btn ghost"
        onClick={useSample}
        disabled={busy || role !== "freelancer"}
      >
        Use sample deliverable
      </button>

      <label className="field">
        <span>Delivery note</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={5}
          placeholder="Describe what you delivered and how it meets the brief…"
          disabled={busy || role !== "freelancer"}
        />
      </label>

      <label className="field">
        <span>Deliverable link (optional)</span>
        <input
          type="url"
          value={link}
          onChange={(event) => setLink(event.target.value)}
          placeholder="https://…"
          disabled={busy || role !== "freelancer"}
        />
      </label>

      <label className="field">
        <span>Text / markdown file (optional, read in your browser)</span>
        <input
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
          disabled={busy || role !== "freelancer"}
        />
      </label>
      {filename ? <p className="muted small">File: {filename}</p> : null}

      <label className="field">
        <span>File text (from the file above, or paste text)</span>
        <textarea
          value={extractedText}
          onChange={(event) => setExtractedText(event.target.value)}
          rows={4}
          placeholder="Paste deliverable text here, or choose a .txt/.md file…"
          disabled={busy || role !== "freelancer"}
        />
      </label>

      {formError ? (
        <p className="alert" role="alert">
          {formError}
        </p>
      ) : null}

      <button type="submit" className="btn primary" disabled={!canSubmit}>
        {submitting ? "Submitting…" : "Submit deliverable"}
      </button>
    </form>
  );
}
