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
  onState: (state: DemoState) => void;
  onError: (message: string) => void;
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
  onState,
  onError,
}: FundingButtonProps) {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonsRef = useRef<PayPalButtonsComponent | null>(null);
  const onStateRef = useRef(onState);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onStateRef.current = onState;
    onErrorRef.current = onError;
  }, [onState, onError]);

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
            try {
              const { orderId, state } = await createPayPalOrder(milestone.id);
              onStateRef.current(state);
              return orderId;
            } catch (err) {
              const message = messageOf(err);
              setError(message);
              onErrorRef.current(message);
              throw err;
            }
          },
          onApprove: async (data) => {
            setError(null);
            try {
              const state = await authorizePayPalOrder(milestone.id, data.orderID);
              onStateRef.current(state);
            } catch (err) {
              const message = messageOf(err);
              setError(message);
              onErrorRef.current(message);
              throw err;
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

  if (!clientId) {
    return (
      <div className="funding-box">
        <button type="button" className="btn primary" disabled>
          Fund milestone
        </button>
        <p className="hint">
          PayPal is not configured — set NEXT_PUBLIC_PAYPAL_CLIENT_ID to enable
          funding.
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
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
