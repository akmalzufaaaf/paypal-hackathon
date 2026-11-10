/**
 * PayPal sandbox spike (Task 1, run manually).
 *
 * Flow 1: create order (intent AUTHORIZE, $10.00) -> human approves via the
 * printed approve link with a sandbox buyer account -> authorize -> capture.
 * Flow 2: same, but ends in void instead of capture.
 *
 * Usage:
 *   PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... node scripts/paypal-spike.mjs
 * (PowerShell: $env:PAYPAL_CLIENT_ID="..."; $env:PAYPAL_CLIENT_SECRET="...")
 * Optional: PAYPAL_API_BASE (default https://api-m.sandbox.paypal.com)
 */
import { randomUUID } from "node:crypto";

const apiBase = (
  process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com"
).replace(/\/$/, "");
const AMOUNT = { currency_code: "USD", value: "10.00" };
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function paypal(path, { method = "GET", token, body, requestId } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (requestId) headers["PayPal-Request-Id"] = requestId;

  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const detail =
      data && typeof data === "object"
        ? (data.message ?? JSON.stringify(data))
        : String(data ?? "");
    throw new Error(
      `PayPal ${method} ${path} failed (${res.status}): ${detail}`,
    );
  }
  return data;
}

async function getAccessToken(clientId, clientSecret) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.access_token) {
    throw new Error(
      `PayPal token request failed (${res.status}): ${data?.error_description ?? data?.error ?? "no access_token in response"}`,
    );
  }
  return data.access_token;
}

async function createOrder(token, label) {
  const order = await paypal("/v2/checkout/orders", {
    method: "POST",
    token,
    requestId: randomUUID(),
    body: {
      intent: "AUTHORIZE",
      purchase_units: [
        { reference_id: `rilis-spike-${label}`, amount: AMOUNT },
      ],
      application_context: {
        brand_name: "Rilis spike",
        shipping_preference: "NO_SHIPPING",
        user_action: "CONTINUE",
        return_url: "https://example.com/return",
        cancel_url: "https://example.com/cancel",
      },
    },
  });
  const approveLink = order.links?.find(
    (link) => link.rel === "approve" || link.rel === "payer-action",
  )?.href;
  console.log(`\n[${label}] Order created: ${order.id} (status ${order.status})`);
  if (approveLink) {
    console.log(`[${label}] Approve with a sandbox buyer account: ${approveLink}`);
  } else {
    console.log(`[${label}] No approve link in response:`, JSON.stringify(order.links));
  }
  return order.id;
}

async function waitForApproval(token, orderId, label) {
  console.log(`[${label}] Waiting for approval (polling order status)...`);
  const deadline = Date.now() + APPROVAL_TIMEOUT_MS;
  for (;;) {
    const order = await paypal(`/v2/checkout/orders/${orderId}`, { token });
    if (order.status === "APPROVED" || order.status === "COMPLETED") {
      console.log(`[${label}] Order ${orderId} is ${order.status}.`);
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `[${label}] Timed out after 10 minutes waiting for approval of order ${orderId} (last status: ${order.status}).`,
      );
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

async function authorizeOrder(token, orderId, label) {
  const result = await paypal(`/v2/checkout/orders/${orderId}/authorize`, {
    method: "POST",
    token,
    requestId: randomUUID(),
    body: {},
  });
  const authorization =
    result.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!authorization?.id) {
    throw new Error(
      `[${label}] Authorize response had no authorization ID: ${JSON.stringify(result)}`,
    );
  }
  console.log(
    `[${label}] Authorized: authorization ${authorization.id} (status ${authorization.status})`,
  );
  return authorization.id;
}

async function runFlow(token, label, ending) {
  const orderId = await createOrder(token, label);
  await waitForApproval(token, orderId, label);
  const authorizationId = await authorizeOrder(token, orderId, label);

  if (ending === "capture") {
    const capture = await paypal(
      `/v2/payments/authorizations/${authorizationId}/capture`,
      {
        method: "POST",
        token,
        requestId: randomUUID(),
        body: { amount: AMOUNT, final_capture: true },
      },
    );
    console.log(
      `[${label}] Captured $10.00: capture ${capture.id} (status ${capture.status})`,
    );
    return { orderId, authorizationId, captureId: capture.id };
  }

  await paypal(`/v2/payments/authorizations/${authorizationId}/void`, {
    method: "POST",
    token,
    requestId: randomUUID(),
  });
  console.log(`[${label}] Voided authorization ${authorizationId}.`);
  return { orderId, authorizationId };
}

async function main() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error(
      "Missing PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET: set both in your environment (see .env.example) before running the spike.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`PayPal spike against ${apiBase}`);
  const token = await getAccessToken(clientId, clientSecret);
  console.log("Access token acquired.");

  const captured = await runFlow(token, "capture", "capture");
  const voided = await runFlow(token, "void", "void");

  console.log("\nSpike complete. Record these IDs:");
  console.log(`  capture flow: order=${captured.orderId} authorization=${captured.authorizationId} capture=${captured.captureId}`);
  console.log(`  void flow:    order=${voided.orderId} authorization=${voided.authorizationId} (voided)`);
}

main().catch((error) => {
  console.error(`PayPal spike failed: ${error.message}`);
  process.exitCode = 1;
});
