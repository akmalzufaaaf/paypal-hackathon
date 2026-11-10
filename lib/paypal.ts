import { randomUUID } from "node:crypto";

/**
 * Server-only PayPal sandbox REST client.
 *
 * Env is read at call time (never at import time) so tests and route
 * handlers can control PAYPAL_API_BASE / PAYPAL_CLIENT_ID /
 * PAYPAL_CLIENT_SECRET via process.env.
 */

const DEFAULT_API_BASE = "https://api-m.sandbox.paypal.com";

export class PayPalError extends Error {
  readonly status: number;
  readonly details?: unknown;
  readonly debugId?: string;

  constructor(
    name: string,
    message: string,
    status: number,
    details?: unknown,
    debugId?: string,
  ) {
    super(message);
    this.name = name;
    this.status = status;
    this.details = details;
    this.debugId = debugId;
  }
}

type PayPalErrorBody = {
  name?: string;
  message?: string;
  error?: string;
  error_description?: string;
  details?: unknown;
  debug_id?: string;
};

function apiBase(): string {
  return (process.env.PAYPAL_API_BASE ?? DEFAULT_API_BASE).replace(/\/$/, "");
}

function toPayPalError(status: number, data: unknown, rawText: string): PayPalError {
  if (data && typeof data === "object") {
    const body = data as PayPalErrorBody;
    const name = body.name ?? body.error;
    const message = body.message ?? body.error_description;
    if (name || message) {
      return new PayPalError(
        name ?? "PAYPAL_ERROR",
        message ?? name ?? `PayPal request failed (${status})`,
        status,
        body.details,
        body.debug_id,
      );
    }
  }
  return new PayPalError(
    "PAYPAL_ERROR",
    rawText ? `PayPal request failed (${status}): ${rawText}` : `PayPal request failed (${status})`,
    status,
  );
}

async function parseBody(res: Response): Promise<{ data: unknown; text: string }> {
  const text = await res.text();
  if (!text) return { data: null, text };
  try {
    return { data: JSON.parse(text) as unknown, text };
  } catch {
    return { data: null, text };
  }
}

// Token cache for this module instance, keyed by base + client id so a
// changed env never reuses a token minted for different credentials.
let cachedToken: { key: string; accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new PayPalError(
      "MISSING_CREDENTIALS",
      "PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set",
      0,
    );
  }

  const base = apiBase();
  const key = `${base}|${clientId}`;
  if (cachedToken && cachedToken.key === key && Date.now() < cachedToken.expiresAt) {
    return cachedToken.accessToken;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const { data, text } = await parseBody(res);
  if (!res.ok) throw toPayPalError(res.status, data, text);

  const token = data as { access_token?: string; expires_in?: number } | null;
  if (!token?.access_token) {
    throw new PayPalError(
      "INVALID_RESPONSE",
      "PayPal token response had no access_token",
      res.status,
    );
  }
  const expiresInSeconds = typeof token.expires_in === "number" ? token.expires_in : 0;
  cachedToken = {
    key,
    accessToken: token.access_token,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };
  return token.access_token;
}

async function paypalFetch(
  path: string,
  options: { method?: string; body?: unknown; requestId?: string } = {},
): Promise<{ data: unknown; status: number }> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  if (options.requestId) headers["PayPal-Request-Id"] = options.requestId;

  const res = await fetch(`${apiBase()}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const { data, text } = await parseBody(res);
  if (!res.ok) throw toPayPalError(res.status, data, text);
  return { data, status: res.status };
}

function missingId(kind: string, status: number): PayPalError {
  return new PayPalError(
    "INVALID_RESPONSE",
    `PayPal response had no ${kind} id`,
    status,
  );
}

export async function createOrder(
  amountCents: number,
  referenceId: string,
  requestId: string,
): Promise<{ orderId: string }> {
  const { data, status } = await paypalFetch("/v2/checkout/orders", {
    method: "POST",
    requestId,
    body: {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: referenceId,
          amount: { currency_code: "USD", value: (amountCents / 100).toFixed(2) },
        },
      ],
    },
  });
  const id = (data as { id?: string } | null)?.id;
  if (!id) throw missingId("order", status);
  return { orderId: id };
}

export async function authorizeOrder(
  orderId: string,
): Promise<{ authorizationId: string; status: string }> {
  const { data, status } = await paypalFetch(
    `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`,
    { method: "POST", requestId: randomUUID(), body: {} },
  );
  const authorization = (
    data as {
      purchase_units?: Array<{
        payments?: { authorizations?: Array<{ id?: string; status?: string }> };
      }>;
    } | null
  )?.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!authorization?.id) throw missingId("authorization", status);
  return { authorizationId: authorization.id, status: authorization.status ?? "" };
}

export async function captureAuthorization(
  authorizationId: string,
  requestId: string,
): Promise<{ captureId: string; status: string }> {
  const { data, status } = await paypalFetch(
    `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`,
    { method: "POST", requestId, body: { final_capture: true } },
  );
  const capture = data as { id?: string; status?: string } | null;
  if (!capture?.id) throw missingId("capture", status);
  return { captureId: capture.id, status: capture.status ?? "" };
}

export async function voidAuthorization(authorizationId: string): Promise<void> {
  await paypalFetch(
    `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`,
    { method: "POST", requestId: randomUUID() },
  );
}

export async function getOrder(orderId: string): Promise<{ status: string }> {
  const { data, status } = await paypalFetch(
    `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
  );
  const orderStatus = (data as { status?: string } | null)?.status;
  if (!orderStatus) {
    throw new PayPalError("INVALID_RESPONSE", "PayPal response had no order status", status);
  }
  return { status: orderStatus };
}
