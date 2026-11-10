/**
 * Server-only optional LLM chat client (OpenAI-compatible shape).
 *
 * Env is read at call time (never at import time) so tests and route
 * handlers can control AI_API_KEY / AI_BASE_URL / AI_MODEL via
 * process.env. Callers (the verifier) treat every failure here as
 * "no LLM available" and fall back deterministically.
 */

export class AiNotConfigured extends Error {
  constructor(message = "AI_API_KEY is not set") {
    super(message);
    this.name = "AiNotConfigured";
  }
}

export class AiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "AiError";
    this.status = status;
  }
}

function requiredEnv(name: "AI_API_KEY" | "AI_BASE_URL" | "AI_MODEL"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new AiNotConfigured(`${name} is not set`);
  }
  return value;
}

/** Strip a leading/trailing markdown code fence, if present. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const firstNewline = trimmed.indexOf("\n");
  if (firstNewline === -1) return trimmed;
  const withoutOpening = trimmed.slice(firstNewline + 1);
  return withoutOpening.replace(/```\s*$/, "").trim();
}

function parseJsonText(text: string, what: string): unknown {
  try {
    return JSON.parse(stripCodeFence(text)) as unknown;
  } catch {
    throw new AiError(`AI ${what} was not valid JSON`);
  }
}

type ChatCompletion = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

function contentToText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content
      .map((part) =>
        part && typeof part === "object" && "text" in part
          ? String((part as { text: unknown }).text)
          : "",
      )
      .filter(Boolean);
    return parts.length > 0 ? parts.join("") : null;
  }
  return null;
}

/**
 * POST `prompt` to the configured OpenAI-compatible chat endpoint and
 * return the model's reply parsed as JSON. Throws `AiNotConfigured`
 * when any of AI_API_KEY / AI_BASE_URL / AI_MODEL is unset, and
 * `AiError` for transport, HTTP, or JSON failures. Never returns an
 * unparsed string: an OpenAI-shaped reply's message content is parsed,
 * a non-chat-shaped JSON body is returned as-is.
 */
export async function chatJson(prompt: string): Promise<unknown> {
  const apiKey = requiredEnv("AI_API_KEY");
  const baseUrl = requiredEnv("AI_BASE_URL").replace(/\/+$/, "");
  const model = requiredEnv("AI_MODEL");
  // Contract: AI_BASE_URL is canonically an OpenAI-compatible provider
  // BASE URL (e.g. https://provider.example/v1), and chatJson POSTs to
  // {AI_BASE_URL}/chat/completions. A base already ending in
  // /chat/completions is used verbatim — never double-appended.
  const url = baseUrl.endsWith("/chat/completions")
    ? baseUrl
    : `${baseUrl}/chat/completions`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      }),
    });
  } catch (err) {
    throw new AiError(
      `AI request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const text = await res.text();
  if (!res.ok) {
    throw new AiError(
      `AI request failed (${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
      res.status,
    );
  }

  const data = parseJsonText(text, "response");
  const choices = (data as ChatCompletion | null)?.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const content = contentToText(choices[0]?.message?.content);
    if (content === null) {
      throw new AiError("AI response had no message content");
    }
    return parseJsonText(content, "message content");
  }
  return data;
}
