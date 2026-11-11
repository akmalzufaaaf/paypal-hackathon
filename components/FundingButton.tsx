"use client";

import { useEffect, useRef, useState } from "react";
import { loadScript, type PayPalButtonsComponent } from "@paypal/paypal-js";

import {
  authorizePayPalOrder,
  createPayPalOrder,
  formatMoney,
  type DemoState,
  type Milestone,
  type Role,
} from "./demo-client";

interface FundingButtonProps {
  milestone: Milestone;
  role: Role;
  /** True while the page-level mutation lock is held (any mutation). */
  locked: boolean;
  onState: (state: DemoState) => void;
  onError: (message: string) => void;
  /** Reports in-flight create/authorize calls; returns false when busy. */
  onPendingChange: (pending: boolean) => boolean;
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "PayPal checkout failed. Please try again.";
}

export default function FundingButton({
  milestone,
  role,
  locked,
  onState,
  onError,
  onPendingChange,
}: FundingButtonProps) {
  // Build-time value when present (local dev / Render); otherwise fetched
  // from /api/config at runtime so hosts whose env only exists at runtime
  // (Docker, Hugging Face Spaces) still get the public Client ID.
  const [clientId, setClientId] = useState<string | null | undefined>(
    () => process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() || undefined,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonsRef = useRef<PayPalButtonsComponent | null>(null);
  const onStateRef = useRef(onState);
  const onErrorRef = useRef(onError);
  const onPendingChangeRef = useRef(onPendingChange);
  const lockedRef = useRef(locked);

  useEffect(() => {
    onStateRef.current = onState;
    onErrorRef.current = onError;
    onPendingChangeRef.current = onPendingChange;
    lockedRef.current = locked;
  }, [onState, onError, onPendingChange, locked]);

  useEffect(() => {
    if (clientId !== undefined) return;
    let cancelled = false;
    fetch("/api/config")
      .then((res) => res.json() as Promise<{ paypalClientId?: unknown }>)
      .then((data) => {
        if (cancelled) return;
        setClientId(
          typeof data.paypalClientId === "string" && data.paypalClientId
            ? data.paypalClientId
            : null,
        );
      })
      .catch(() => {
        if (!cancelled) setClientId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  useEffect(() => {
    if (!clientId || role !== "client" || milestone.state !== "DRAFT") {
      return;
    }
    let cancelled = false;
    const container = containerRef.current;

    loadScript({
      clientId,
      intent: "authorize",
      currency: "USD",
    })
      .then((paypal) => {
        if (cancelled || !paypal?.Buttons || !container) return;
        const buttons = paypal.Buttons({
          style: { layout: "vertical", label: "paypal" },
          createOrder: async () => {
            setError(null);
            // The PayPal iframe cannot be disabled, so guard here: never
            // start (or apply state from) a funding call while another
            // mutation owns the page lock.
            if (lockedRef.current || !onPendingChangeRef.current(true)) {
              const message =
                "Another action is in progress. Wait for it to finish before funding.";
              setError(message);
              onErrorRef.current(message);
              throw new Error(message);
            }
            setPending(true);
            try {
              const { orderId, state } = await createPayPalOrder(milestone.id);
              onStateRef.current(state);
              return orderId;
            } catch (err) {
              const message = messageOf(err);
              setError(message);
              onErrorRef.current(message);
              throw err;
            } finally {
              setPending(false);
              onPendingChangeRef.current(false);
            }
          },
          onApprove: async (data) => {
            setError(null);
            if (lockedRef.current || !onPendingChangeRef.current(true)) {
              const message =
                "Another action is in progress. Wait for it to finish before funding.";
              setError(message);
              onErrorRef.current(message);
              throw new Error(message);
            }
            setPending(true);
            try {
              const state = await authorizePayPalOrder(milestone.id, data.orderID);
              onStateRef.current(state);
            } catch (err) {
              const message = messageOf(err);
              setError(message);
              onErrorRef.current(message);
              throw err;
            } finally {
              setPending(false);
              onPendingChangeRef.current(false);
            }
          },
          onError: (err) => {
            const message = messageOf(err);
            setError(message);
            onErrorRef.current(message);
          },
        });
        buttonsRef.current = buttons;
        container.innerHTML = "";
        return buttons.render(container);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = messageOf(err);
        setError(message);
        onErrorRef.current(message);
      });

    return () => {
      cancelled = true;
      const buttons = buttonsRef.current;
      buttonsRef.current = null;
      if (buttons) {
        buttons.close().catch(() => undefined);
      }
      if (container) container.innerHTML = "";
    };
  }, [clientId, milestone.id, milestone.state, role]);

  if (milestone.state !== "DRAFT") return null;

  if (clientId === undefined) {
    return (
      <div className="funding-box">
        <p className="muted">Loading PayPal…</p>
      </div>
    );
  }

  if (!clientId) {
    return (
      <div className="funding-box">
        <button type="button" className="btn primary" disabled>
          Fund milestone
        </button>
        <p className="hint">
          PayPal is not configured — set PAYPAL_CLIENT_ID (server env) to
          enable funding.
        </p>
        {error ? (
          <p className="alert" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (role !== "client") {
    return (
      <div className="funding-box">
        <button type="button" className="btn primary" disabled>
          Fund milestone
        </button>
        <p className="hint">Switch to the Client role to fund this milestone.</p>
      </div>
    );
  }

  return (
    <div className="funding-box">
      <p className="muted">
        Fund {formatMoney(milestone.amountCents)} with PayPal sandbox — this
        places an authorization hold, it does not pay the freelancer yet.
      </p>
      <div ref={containerRef} className="paypal-buttons" />
      {locked && !pending ? (
        <p className="hint">Another action is in progress — funding is paused.</p>
      ) : null}
      {pending ? <p className="muted small">Contacting PayPal…</p> : null}
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
