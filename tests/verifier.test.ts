import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MILESTONE1_CHECKLIST, SAMPLE_DELIVERABLE_NOTE } from "../lib/constants";
import { AiNotConfigured, chatJson } from "../lib/ai-client";
import { verifyDeliverable } from "../lib/verifier";
import type { ItemVerdict } from "../lib/types";

const AI_ENV_KEYS = ["AI_API_KEY", "AI_BASE_URL", "AI_MODEL"] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of AI_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of AI_ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

function sampleInput() {
  return {
    checklist: MILESTONE1_CHECKLIST,
    deliveryNote: SAMPLE_DELIVERABLE_NOTE,
    extractedText: "",
  };
}

const LLM_VERDICTS: ItemVerdict["verdict"][] = [
  "pass",
  "pass",
  "fail",
  "pass",
  "unclear",
];

function validLlmPayload() {
  return {
    items: MILESTONE1_CHECKLIST.map((requirement, i) => ({
      requirement,
      verdict: LLM_VERDICTS[i],
      evidence: `llm evidence ${i + 1}`,
    })),
    // Deliberately wrong: verifyDeliverable must recompute via computeScore.
    score: 999,
    summary: "LLM summary text",
  };
}

describe("chatJson (AI client seam)", () => {
  it("throws AiNotConfigured when AI_API_KEY is unset (read at call time)", async () => {
    const err = await chatJson("prompt").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiNotConfigured);
    expect((err as Error).name).toBe("AiNotConfigured");
    expect((err as Error).message).toMatch(/AI_API_KEY/);

    // Setting the key on a later call changes the outcome: env is re-read.
    process.env.AI_API_KEY = "test-key";
    const err2 = await chatJson("prompt").catch((e: unknown) => e);
    expect(err2).toBeInstanceOf(AiNotConfigured);
    expect((err2 as Error).message).toMatch(/AI_BASE_URL/);
  });
});

describe("verifyDeliverable — deterministic fallback", () => {
  it("no AI key → provider fallback and the seeded sample scores at least 80", async () => {
    const result = await verifyDeliverable(sampleInput());

    expect(result.provider).toBe("fallback");
    expect(result.items).toHaveLength(MILESTONE1_CHECKLIST.length);
    expect(result.items.map((i) => i.requirement)).toEqual(MILESTONE1_CHECKLIST);
    expect(result.score).toBe(80);
    expect(result.score).toBeGreaterThanOrEqual(80);
    // Sample covers exactly 4 of 5 requirements; lockups item is unclear.
    expect(result.items.filter((i) => i.verdict === "pass")).toHaveLength(4);
    expect(result.items[4].verdict).toBe("unclear");
    expect(result.items.every((i) => i.verdict !== "fail")).toBe(true);
    expect(result.summary).toBeTruthy();
  });

  it("fallback never emits fail: text matching nothing marks every item unclear", async () => {
    const result = await verifyDeliverable({
      checklist: MILESTONE1_CHECKLIST,
      deliveryNote: "zzz qqq",
      extractedText: "",
    });

    expect(result.provider).toBe("fallback");
    expect(result.items.every((i) => i.verdict === "unclear")).toBe(true);
    expect(result.score).toBe(0);
  });

  it("fallback matches keywords in extractedText as well as the delivery note", async () => {
    const result = await verifyDeliverable({
      checklist: ["Editable vector source files delivered in SVG format"],
      deliveryNote: "",
      extractedText: "Attached are the editable vector files.",
    });

    expect(result.provider).toBe("fallback");
    expect(result.items).toEqual([
      expect.objectContaining({ verdict: "pass" }),
    ]);
    expect(result.score).toBe(100);
  });

  it("an LLM seam that throws (e.g. no key) falls back instead of throwing", async () => {
    const throwing = vi.fn(async (): Promise<unknown> => {
      throw new AiNotConfigured("AI_API_KEY is not set");
    });

    const result = await verifyDeliverable(sampleInput(), throwing);

    expect(result.provider).toBe("fallback");
    expect(result.score).toBe(80);
  });
});

describe("verifyDeliverable — LLM path", () => {
  it("valid full JSON → provider llm, its verdicts, and a code-computed score", async () => {
    const payload = validLlmPayload();
    // Shuffle item order: coverage is by requirement, output follows checklist order.
    payload.items = [...payload.items].reverse();
    let capturedPrompt = "";
    const stub = vi.fn(async (prompt: string): Promise<unknown> => {
      capturedPrompt = prompt;
      return payload;
    });

    const result = await verifyDeliverable(
      { ...sampleInput(), filename: "logo-concepts.svg" },
      stub,
    );

    expect(stub).toHaveBeenCalledTimes(1);
    const prompt = capturedPrompt;
    expect(prompt).toContain(MILESTONE1_CHECKLIST[0]);
    expect(prompt).toContain(SAMPLE_DELIVERABLE_NOTE);
    expect(prompt).toContain("logo-concepts.svg");

    expect(result.provider).toBe("llm");
    expect(result.items.map((i) => i.requirement)).toEqual(MILESTONE1_CHECKLIST);
    expect(result.items.map((i) => i.verdict)).toEqual(LLM_VERDICTS);
    expect(result.items[0].evidence).toBe("llm evidence 1");
    // 3 pass of 5 → 60, not the LLM-supplied 999.
    expect(result.score).toBe(60);
    expect(result.summary).toBe("LLM summary text");
  });

  it("LLM stub returning an item subset falls back (never throws)", async () => {
    const payload = validLlmPayload();
    payload.items = payload.items.slice(0, 3);
    const stub = vi.fn(async (): Promise<unknown> => payload);

    const result = await verifyDeliverable(sampleInput(), stub);

    expect(result.provider).toBe("fallback");
    expect(result.items).toHaveLength(MILESTONE1_CHECKLIST.length);
    expect(result.score).toBe(80);
  });

  it("LLM stub returning an extra item falls back", async () => {
    const payload = validLlmPayload();
    payload.items = [
      ...payload.items,
      { requirement: "An invented extra requirement", verdict: "pass", evidence: "x" },
    ];
    const stub = vi.fn(async (): Promise<unknown> => payload);

    const result = await verifyDeliverable(sampleInput(), stub);

    expect(result.provider).toBe("fallback");
    expect(result.score).toBe(80);
  });

  it("LLM stub duplicating one item and omitting another falls back", async () => {
    const payload = validLlmPayload();
    payload.items = [
      payload.items[0],
      payload.items[0],
      payload.items[1],
      payload.items[2],
      payload.items[3],
    ];
    const stub = vi.fn(async (): Promise<unknown> => payload);

    const result = await verifyDeliverable(sampleInput(), stub);

    expect(result.provider).toBe("fallback");
    expect(result.score).toBe(80);
  });

  it("LLM stub with a paraphrased requirement (not exact coverage) falls back", async () => {
    const payload = validLlmPayload();
    payload.items = payload.items.map((item, i) =>
      i === 0 ? { ...item, requirement: "Two logo ideas were provided" } : item,
    );
    const stub = vi.fn(async (): Promise<unknown> => payload);

    const result = await verifyDeliverable(sampleInput(), stub);

    expect(result.provider).toBe("fallback");
  });

  it("LLM stub with an item missing evidence falls back (evidence is not fabricated)", async () => {
    const payload = validLlmPayload();
    delete (payload.items[1] as { evidence?: string }).evidence;
    const stub = vi.fn(async (): Promise<unknown> => payload);

    const result = await verifyDeliverable(sampleInput(), stub);

    expect(result.provider).toBe("fallback");
    expect(result.score).toBe(80);
  });

  it("LLM stub with non-string evidence falls back", async () => {
    const payload = validLlmPayload();
    (payload.items[0] as { evidence: unknown }).evidence = 42;
    const stub = vi.fn(async (): Promise<unknown> => payload);

    const result = await verifyDeliverable(sampleInput(), stub);

    expect(result.provider).toBe("fallback");
    expect(result.score).toBe(80);
  });

  it("LLM stub with empty-string evidence falls back", async () => {
    const payload = validLlmPayload();
    payload.items[2].evidence = "   ";
    const stub = vi.fn(async (): Promise<unknown> => payload);

    const result = await verifyDeliverable(sampleInput(), stub);

    expect(result.provider).toBe("fallback");
    expect(result.score).toBe(80);
  });

  it("LLM stub returning a bare items array (no wrapping object) falls back", async () => {
    const payload = validLlmPayload();
    const stub = vi.fn(async (): Promise<unknown> => payload.items);

    const result = await verifyDeliverable(sampleInput(), stub);

    expect(result.provider).toBe("fallback");
    expect(result.score).toBe(80);
  });

  it("LLM stub with an invalid verdict value falls back", async () => {
    const payload = validLlmPayload();
    (payload.items[0] as { verdict: string }).verdict = "great";
    const stub = vi.fn(async (): Promise<unknown> => payload);

    const result = await verifyDeliverable(sampleInput(), stub);

    expect(result.provider).toBe("fallback");
  });

  it.each([
    ["a non-JSON string", "this is not json"],
    ["null", null],
    ["an object without items", { score: 42 }],
    ["items that are not an array", { items: "nope" }],
  ])("unparseable LLM output (%s) falls back", async (_label, raw) => {
    const stub = vi.fn(async (): Promise<unknown> => raw);

    const result = await verifyDeliverable(sampleInput(), stub);

    expect(result.provider).toBe("fallback");
    expect(result.items.every((i) => i.verdict !== "fail")).toBe(true);
    expect(result.score).toBe(80);
  });

  it("an LLM seam that rejects (provider error) falls back instead of throwing", async () => {
    const stub = vi.fn(async (): Promise<unknown> => {
      throw new Error("provider unavailable");
    });

    await expect(verifyDeliverable(sampleInput(), stub)).resolves.toMatchObject({
      provider: "fallback",
      score: 80,
    });
  });
});
