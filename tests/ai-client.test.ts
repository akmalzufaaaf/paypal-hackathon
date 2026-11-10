import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiError, chatJson } from "../lib/ai-client";

type RecordedCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
};

const AI_ENV_KEYS = ["AI_API_KEY", "AI_BASE_URL", "AI_MODEL"] as const;
const savedEnv: Record<string, string | undefined> = {};

let calls: RecordedCall[] = [];

function jsonResponse(status: number, body: unknown) {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  };
}

function chatResponse(content: string) {
  return jsonResponse(200, { choices: [{ message: { content } }] });
}

function stubFetch(response: unknown) {
  calls = [];
  const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  for (const key of AI_ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }
  process.env.AI_API_KEY = "test-ai-key";
  process.env.AI_BASE_URL = "https://provider.example/v1";
  process.env.AI_MODEL = "test-model-1";
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of AI_ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

describe("chatJson request contract", () => {
  it("POSTs to {AI_BASE_URL}/chat/completions for a bare base URL", async () => {
    stubFetch(chatResponse('{"items":[],"summary":"ok"}'));

    await chatJson("verify this");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://provider.example/v1/chat/completions");
    expect(calls[0].method).toBe("POST");
  });

  it("does not double-append when AI_BASE_URL already ends with /chat/completions", async () => {
    process.env.AI_BASE_URL = "https://provider.example/v1/chat/completions";
    stubFetch(chatResponse('{"items":[],"summary":"ok"}'));

    await chatJson("verify this");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://provider.example/v1/chat/completions");
    expect(calls[0].method).toBe("POST");
  });

  it("sends the Bearer key and a JSON body containing model and messages", async () => {
    stubFetch(chatResponse('{"items":[],"summary":"ok"}'));

    await chatJson("verify this deliverable");

    expect(calls[0].headers.Authorization).toBe("Bearer test-ai-key");
    expect(calls[0].headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(calls[0].body!) as {
      model?: unknown;
      messages?: unknown;
    };
    expect(body.model).toBe("test-model-1");
    expect(body.messages).toEqual([
      { role: "user", content: "verify this deliverable" },
    ]);
  });
});

describe("chatJson response parsing", () => {
  it("parses choices[0].message.content as JSON", async () => {
    stubFetch(
      chatResponse('{"items":[{"requirement":"r","verdict":"pass","evidence":"e"}],"summary":"done"}'),
    );

    await expect(chatJson("prompt")).resolves.toEqual({
      items: [{ requirement: "r", verdict: "pass", evidence: "e" }],
      summary: "done",
    });
  });

  it("parses fenced-JSON message content", async () => {
    stubFetch(chatResponse('```json\n{"items":[],"summary":"fenced"}\n```'));

    await expect(chatJson("prompt")).resolves.toEqual({
      items: [],
      summary: "fenced",
    });
  });

  it("rejects with AiError on a non-2xx HTTP response", async () => {
    stubFetch(jsonResponse(500, { error: "provider exploded" }));

    const err = await chatJson("prompt").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiError);
    expect((err as InstanceType<typeof AiError>).status).toBe(500);
    expect((err as Error).message).toMatch(/500/);
  });
});
