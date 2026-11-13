// Mistral chat API with retry/backoff on rate limits. Takes its settings as arguments so it
// works both in Next.js (env vars) and Devvit (app settings, platform fetch).

import type { ChatMessage, Llm } from "./types";

export type MistralOptions = {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetch?: typeof fetch;
  /** Waits before each retry of a 429/5xx. */
  retryDelaysMs?: number[];
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createMistral(opts: MistralOptions): Llm {
  const base = (opts.baseUrl ?? "https://api.mistral.ai/v1").replace(/\/$/, "");
  const model = opts.model ?? "mistral-small-latest";
  const delays = opts.retryDelaysMs ?? [1000, 2000, 4000];

  async function post(body: unknown): Promise<Response> {
    const doFetch = opts.fetch ?? globalThis.fetch;
    for (let attempt = 0; ; attempt++) {
      const res = await doFetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify(body),
      });
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= delays.length) return res;
      const retryAfter = Number(res.headers.get("retry-after"));
      await res.body?.cancel();
      await sleep(retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : delays[attempt]);
    }
  }

  async function complete(extra: Record<string, unknown>): Promise<string> {
    const res = await post({ model, ...extra });
    if (!res.ok) throw new Error(`Mistral chat failed: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content;
    if (typeof text !== "string") throw new Error("Mistral returned no content");
    return text;
  }

  return {
    async json<T>(messages: ChatMessage[]): Promise<T> {
      const text = await complete({ messages, temperature: 0.1, max_tokens: 300, response_format: { type: "json_object" } });
      return JSON.parse(text) as T;
    },
    text: (messages) => complete({ messages, temperature: 0.6, max_tokens: 500 }),
  };
}
