// Thin wrapper over the Mistral chat API with retry/backoff on rate limits.

import "server-only";

const API_BASE = process.env.MISTRAL_API_BASE || "https://api.mistral.ai/v1";
export const CHAT_MODEL = process.env.MISTRAL_CHAT_MODEL || "mistral-small-latest";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function hasMistralKey(): boolean {
  return Boolean(process.env.MISTRAL_API_KEY);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function post(body: unknown, delays = [1000, 2000, 4000]): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` },
      body: JSON.stringify(body),
    });
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= delays.length) return res;
    const retryAfter = Number(res.headers.get("retry-after"));
    await res.body?.cancel();
    await sleep(retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : delays[attempt]);
  }
}

async function complete(body: Record<string, unknown>): Promise<string> {
  const res = await post({ model: CHAT_MODEL, ...body });
  if (!res.ok) throw new Error(`Mistral chat failed: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = json.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("Mistral returned no content");
  return text;
}

/** Asks for a JSON object and parses it. */
export async function chatJSON<T>(messages: ChatMessage[]): Promise<T> {
  const text = await complete({
    messages,
    temperature: 0.1,
    max_tokens: 300,
    response_format: { type: "json_object" },
  });
  return JSON.parse(text) as T;
}

/** Plain-text completion, used for the drafted replies. */
export async function chatText(messages: ChatMessage[]): Promise<string> {
  return complete({ messages, temperature: 0.6, max_tokens: 500 });
}
