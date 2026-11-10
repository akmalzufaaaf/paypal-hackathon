import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type RecordedCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  signal: unknown;
};

type Handler = (call: RecordedCall) => unknown;

const BASE = "https://api-m.sandbox.paypal.com";

const TOKEN = { access_token: "TOKEN-1", token_type: "Bearer", expires_in: 3600 };
const ORDER = { id: "ORDER-123", status: "CREATED" };
const AUTHORIZE = {
  id: "ORDER-123",
  status: "COMPLETED",
  purchase_units: [
    { payments: { authorizations: [{ id: "AUTH-456", status: "CREATED" }] } },
  ],
};
const CAPTURE = { id: "CAP-789", status: "COMPLETED" };
const ERROR_422 = {
  name: "UNPROCESSABLE_ENTITY",
  message: "The requested action could not be performed, semantically incorrect, or failed business validation.",
  details: [{ issue: "INSTRUMENT_DECLINED", description: "The instrument presented was declined." }],
  debug_id: "debug-1",
};

function jsonResponse(status: number, body?: unknown) {
  const text = body === undefined ? "" : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => (text ? JSON.parse(text) : null),
  };
}

function defaultHandler(call: RecordedCall): unknown {
  const { url, method } = call;
  if (url.endsWith("/v1/oauth2/token")) return jsonResponse(200, TOKEN);
  if (method === "POST" && url.endsWith("/v2/checkout/orders")) return jsonResponse(201, ORDER);
  if (method === "POST" && url.endsWith("/authorize")) return jsonResponse(200, AUTHORIZE);
  if (method === "POST" && url.endsWith("/capture")) return jsonResponse(201, CAPTURE);
  if (method === "POST" && url.endsWith("/void")) return jsonResponse(204);
  if (method === "GET" && url.includes("/v2/checkout/orders/")) return jsonResponse(200, { id: "ORDER-123", status: "APPROVED" });
  return jsonResponse(404, { name: "RESOURCE_NOT_FOUND", message: "not found" });
}

let calls: RecordedCall[] = [];

function stubFetch(handler: Handler = defaultHandler) {
  calls = [];
  const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
    const call: RecordedCall = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? init.body : undefined,
      signal: init?.signal,
    };
    calls.push(call);
    return handler(call);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function loadClient() {
  return import("../lib/paypal");
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  process.env.PAYPAL_CLIENT_ID = "client-id-123";
  process.env.PAYPAL_CLIENT_SECRET = "client-secret-456";
  process.env.PAYPAL_API_BASE = BASE;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OAuth token", () => {
  it("requests a token with Basic auth and client_credentials grant", async () => {
    stubFetch();
    const { createOrder } = await loadClient();
    await createOrder(20000, "milestone-1", "req-create-1");

    const tokenCall = calls.find((c) => c.url.endsWith("/v1/oauth2/token"));
    expect(tokenCall).toBeDefined();
    expect(tokenCall!.url).toBe(`${BASE}/v1/oauth2/token`);
    expect(tokenCall!.method).toBe("POST");
    const expectedBasic = Buffer.from("client-id-123:client-secret-456").toString("base64");
    expect(tokenCall!.headers.Authorization).toBe(`Basic ${expectedBasic}`);
    expect(tokenCall!.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(tokenCall!.body).toBe("grant_type=client_credentials");

    const orderCall = calls.find((c) => c.url.endsWith("/v2/checkout/orders"));
    expect(orderCall!.headers.Authorization).toBe("Bearer TOKEN-1");
  });

  it("caches the token until expiry and refetches after expiry", async () => {
    let tokenCount = 0;
    stubFetch((call) => {
      if (call.url.endsWith("/v1/oauth2/token")) {
        tokenCount += 1;
        return jsonResponse(200, { ...TOKEN, access_token: `TOKEN-${tokenCount}`, expires_in: tokenCount === 1 ? 0 : 3600 });
      }
      return defaultHandler(call);
    });
    const { createOrder } = await loadClient();

    await createOrder(20000, "m1", "req-1");
    await createOrder(20000, "m1", "req-2");
    // First token had expires_in 0 (already expired) -> second call refetched.
    expect(tokenCount).toBe(2);

    await createOrder(20000, "m1", "req-3");
    // Second token is valid for 3600s -> still cached.
    expect(tokenCount).toBe(2);
  });

  it("reads PAYPAL_API_BASE and credentials at call time, not import time", async () => {
    stubFetch();
    const client = await loadClient();
    await client.createOrder(20000, "m1", "req-1");
    expect(calls[0].url).toBe(`${BASE}/v1/oauth2/token`);

    calls = [];
    process.env.PAYPAL_API_BASE = "https://example.test/paypal/";
    process.env.PAYPAL_CLIENT_ID = "other-id";
    await client.createOrder(20000, "m1", "req-2");
    expect(calls[0].url).toBe("https://example.test/paypal/v1/oauth2/token");
    const expectedBasic = Buffer.from("other-id:client-secret-456").toString("base64");
    expect(calls[0].headers.Authorization).toBe(`Basic ${expectedBasic}`);
  });
});

describe("createOrder", () => {
  it('posts intent AUTHORIZE with USD amount "200.00" for 20000 cents', async () => {
    stubFetch();
    const { createOrder } = await loadClient();
    const result = await createOrder(20000, "milestone-1", "req-create-1");
    expect(result).toEqual({ orderId: "ORDER-123" });

    const call = calls.find((c) => c.url.endsWith("/v2/checkout/orders"));
    expect(call).toBeDefined();
    expect(call!.method).toBe("POST");
    expect(call!.headers["PayPal-Request-Id"]).toBe("req-create-1");
    expect(JSON.parse(call!.body!)).toEqual({
      intent: "AUTHORIZE",
      purchase_units: [
        { reference_id: "milestone-1", amount: { currency_code: "USD", value: "200.00" } },
      ],
    });
  });

  it("formats odd cents with toFixed(2)", async () => {
    stubFetch();
    const { createOrder } = await loadClient();
    await createOrder(199, "m1", "req-1");
    const call = calls.find((c) => c.url.endsWith("/v2/checkout/orders"));
    expect(JSON.parse(call!.body!).purchase_units[0].amount.value).toBe("1.99");
  });

  it("rejects an empty requestId without making any fetch call", async () => {
    stubFetch();
    const { createOrder, PayPalError } = await loadClient();
    const err = await createOrder(20000, "m1", "").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect((err as Error).message).toMatch(/request.?id/i);
    expect(calls).toHaveLength(0);
  });

  it("throws PayPalError (never returns an undefined id) when a 2xx order response has no id", async () => {
    stubFetch((call) => {
      if (call.url.endsWith("/v1/oauth2/token")) return jsonResponse(200, TOKEN);
      if (call.url.endsWith("/v2/checkout/orders")) return jsonResponse(201, { status: "CREATED" });
      return defaultHandler(call);
    });
    const { createOrder, PayPalError } = await loadClient();
    const err = await createOrder(20000, "m1", "req-1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect((err as Error).message).toMatch(/order id/i);
  });
});

describe("authorizeOrder", () => {
  it("parses the authorization id and status from purchase_units[0].payments.authorizations[0]", async () => {
    stubFetch();
    const { authorizeOrder } = await loadClient();
    const result = await authorizeOrder("ORDER-123");
    expect(result).toEqual({ authorizationId: "AUTH-456", status: "CREATED" });

    const call = calls.find((c) => c.url.endsWith("/v2/checkout/orders/ORDER-123/authorize"));
    expect(call).toBeDefined();
    expect(call!.method).toBe("POST");
    expect(call!.headers.Authorization).toBe("Bearer TOKEN-1");
    expect(call!.headers["PayPal-Request-Id"]).toBeTruthy();
  });

  it("sends the same deterministic PayPal-Request-Id on retry for the same order", async () => {
    stubFetch();
    const { authorizeOrder } = await loadClient();
    await authorizeOrder("ORDER-123");
    await authorizeOrder("ORDER-123");
    const authCalls = calls.filter((c) => c.url.endsWith("/authorize"));
    expect(authCalls).toHaveLength(2);
    expect(authCalls[0].headers["PayPal-Request-Id"]).toBe("authorize:ORDER-123");
    expect(authCalls[1].headers["PayPal-Request-Id"]).toBe(authCalls[0].headers["PayPal-Request-Id"]);
  });

  it("throws PayPalError when the authorize response has no authorization status", async () => {
    stubFetch((call) => {
      if (call.url.endsWith("/v1/oauth2/token")) return jsonResponse(200, TOKEN);
      if (call.url.endsWith("/authorize")) return jsonResponse(200, { id: "ORDER-123", status: "COMPLETED", purchase_units: [{ payments: { authorizations: [{ id: "AUTH-456" }] } }] });
      return defaultHandler(call);
    });
    const { authorizeOrder, PayPalError } = await loadClient();
    const err = await authorizeOrder("ORDER-123").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect((err as InstanceType<typeof PayPalError>).name).toBe("INVALID_RESPONSE");
    expect((err as Error).message).toMatch(/authorization status/i);
  });

  it("throws PayPalError when the authorize response has no authorization", async () => {
    stubFetch((call) => {
      if (call.url.endsWith("/v1/oauth2/token")) return jsonResponse(200, TOKEN);
      if (call.url.endsWith("/authorize")) return jsonResponse(200, { id: "ORDER-123", status: "COMPLETED", purchase_units: [{ payments: {} }] });
      return defaultHandler(call);
    });
    const { authorizeOrder, PayPalError } = await loadClient();
    const err = await authorizeOrder("ORDER-123").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect((err as Error).message).toMatch(/authorization id/i);
  });
});

describe("captureAuthorization", () => {
  it("sends the given PayPal-Request-Id and parses capture id/status", async () => {
    stubFetch();
    const { captureAuthorization } = await loadClient();
    const result = await captureAuthorization("AUTH-456", "req-capture-1");
    expect(result).toEqual({ captureId: "CAP-789", status: "COMPLETED" });

    const call = calls.find((c) => c.url.endsWith("/v2/payments/authorizations/AUTH-456/capture"));
    expect(call).toBeDefined();
    expect(call!.method).toBe("POST");
    expect(call!.headers["PayPal-Request-Id"]).toBe("req-capture-1");
  });

  it("rejects an empty requestId without making any fetch call", async () => {
    stubFetch();
    const { captureAuthorization, PayPalError } = await loadClient();
    const err = await captureAuthorization("AUTH-456", "").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect((err as Error).message).toMatch(/request.?id/i);
    expect(calls).toHaveLength(0);
  });

  it("throws PayPalError when a 2xx capture response has no status", async () => {
    stubFetch((call) => {
      if (call.url.endsWith("/v1/oauth2/token")) return jsonResponse(200, TOKEN);
      if (call.url.endsWith("/capture")) return jsonResponse(201, { id: "CAP-789" });
      return defaultHandler(call);
    });
    const { captureAuthorization, PayPalError } = await loadClient();
    const err = await captureAuthorization("AUTH-456", "req-1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect((err as InstanceType<typeof PayPalError>).name).toBe("INVALID_RESPONSE");
    expect((err as Error).message).toMatch(/capture status/i);
  });

  it("throws PayPalError when a 2xx capture response has no id", async () => {
    stubFetch((call) => {
      if (call.url.endsWith("/v1/oauth2/token")) return jsonResponse(200, TOKEN);
      if (call.url.endsWith("/capture")) return jsonResponse(201, { status: "COMPLETED" });
      return defaultHandler(call);
    });
    const { captureAuthorization, PayPalError } = await loadClient();
    const err = await captureAuthorization("AUTH-456", "req-1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect((err as Error).message).toMatch(/capture id/i);
  });
});

describe("voidAuthorization and getOrder", () => {
  it("voids with a PayPal-Request-Id and resolves on 204", async () => {
    stubFetch();
    const { voidAuthorization } = await loadClient();
    await expect(voidAuthorization("AUTH-456")).resolves.toBeUndefined();
    const call = calls.find((c) => c.url.endsWith("/v2/payments/authorizations/AUTH-456/void"));
    expect(call).toBeDefined();
    expect(call!.method).toBe("POST");
    expect(call!.headers["PayPal-Request-Id"]).toBeTruthy();
  });

  it("sends the same deterministic PayPal-Request-Id on retry for the same authorization", async () => {
    stubFetch();
    const { voidAuthorization } = await loadClient();
    await voidAuthorization("AUTH-456");
    await voidAuthorization("AUTH-456");
    const voidCalls = calls.filter((c) => c.url.endsWith("/void"));
    expect(voidCalls).toHaveLength(2);
    expect(voidCalls[0].headers["PayPal-Request-Id"]).toBe("void:AUTH-456");
    expect(voidCalls[1].headers["PayPal-Request-Id"]).toBe(voidCalls[0].headers["PayPal-Request-Id"]);
  });

  it("getOrder returns the order status", async () => {
    stubFetch();
    const { getOrder } = await loadClient();
    await expect(getOrder("ORDER-123")).resolves.toEqual({ status: "APPROVED" });
    const call = calls.find((c) => c.method === "GET" && c.url.endsWith("/v2/checkout/orders/ORDER-123"));
    expect(call).toBeDefined();
  });

  it("getOrder throws PayPalError when a 2xx response has no status", async () => {
    stubFetch((call) => {
      if (call.url.endsWith("/v1/oauth2/token")) return jsonResponse(200, TOKEN);
      if (call.method === "GET") return jsonResponse(200, { id: "ORDER-123" });
      return defaultHandler(call);
    });
    const { getOrder, PayPalError } = await loadClient();
    const err = await getOrder("ORDER-123").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PayPalError);
  });
});

describe("PayPalError", () => {
  it("throws PayPalError carrying the PayPal name/message on a 422", async () => {
    stubFetch((call) => {
      if (call.url.endsWith("/v1/oauth2/token")) return jsonResponse(200, TOKEN);
      if (call.url.endsWith("/capture")) return jsonResponse(422, ERROR_422);
      return defaultHandler(call);
    });
    const { captureAuthorization, PayPalError } = await loadClient();
    const err = await captureAuthorization("AUTH-456", "req-capture-1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PayPalError);
    const paypalErr = err as InstanceType<typeof PayPalError>;
    expect(paypalErr.name).toBe("UNPROCESSABLE_ENTITY");
    expect(paypalErr.message).toBe(ERROR_422.message);
    expect(paypalErr.status).toBe(422);
  });

  it("wraps a network failure on the token request as PayPalError NETWORK_ERROR", async () => {
    stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    const { createOrder, PayPalError } = await loadClient();
    const err = await createOrder(20000, "m1", "req-1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PayPalError);
    const paypalErr = err as InstanceType<typeof PayPalError>;
    expect(paypalErr.name).toBe("NETWORK_ERROR");
    expect(paypalErr.status).toBe(0);
    expect(paypalErr.message).toBe("PayPal request failed: fetch failed");
  });

  it("wraps a network failure on an API call as PayPalError NETWORK_ERROR", async () => {
    stubFetch((call) => {
      if (call.url.endsWith("/v1/oauth2/token")) return jsonResponse(200, TOKEN);
      throw new TypeError("fetch failed: socket hang up");
    });
    const { createOrder, PayPalError } = await loadClient();
    const err = await createOrder(20000, "m1", "req-1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PayPalError);
    const paypalErr = err as InstanceType<typeof PayPalError>;
    expect(paypalErr.name).toBe("NETWORK_ERROR");
    expect(paypalErr.status).toBe(0);
    expect(paypalErr.message).toContain("PayPal request failed:");
    expect(paypalErr.message).toContain("socket hang up");
  });

  it("maps a fetch timeout/abort to PayPalError NETWORK_ERROR and passes abort signals", async () => {
    stubFetch((call) => {
      if (call.url.endsWith("/v1/oauth2/token")) return jsonResponse(200, TOKEN);
      throw new DOMException(
        "The operation was aborted due to timeout",
        "TimeoutError",
      );
    });
    const { createOrder, PayPalError } = await loadClient();
    const err = await createOrder(20000, "m1", "req-1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PayPalError);
    const paypalErr = err as InstanceType<typeof PayPalError>;
    expect(paypalErr.name).toBe("NETWORK_ERROR");
    expect(paypalErr.status).toBe(0);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const call of calls) {
      expect(call.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("throws PayPalError when the token request fails", async () => {
    stubFetch((call) => {
      if (call.url.endsWith("/v1/oauth2/token")) {
        return jsonResponse(401, { error: "invalid_client", error_description: "Client Authentication failed" });
      }
      return defaultHandler(call);
    });
    const { createOrder, PayPalError } = await loadClient();
    const err = await createOrder(20000, "m1", "req-1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect((err as InstanceType<typeof PayPalError>).name).toBe("invalid_client");
    expect((err as Error).message).toBe("Client Authentication failed");
  });
});
