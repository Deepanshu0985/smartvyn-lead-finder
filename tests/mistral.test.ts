import { describe, expect, it } from "vitest";
import { createMistral } from "../shared/mistral-client";

const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

function fakeFetch(responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return responses.shift() ?? new Response("exhausted", { status: 500 });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

describe("createMistral", () => {
  it("sends the key, model and JSON mode, and parses the reply", async () => {
    const { calls, impl } = fakeFetch([ok('{"a":1}')]);
    const llm = createMistral({ apiKey: "k", fetch: impl, retryDelaysMs: [] });
    expect(await llm.json<{ a: number }>([{ role: "user", content: "hi" }])).toEqual({ a: 1 });
    expect(calls[0].url).toBe("https://api.mistral.ai/v1/chat/completions");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer k");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({ model: "mistral-small-latest", response_format: { type: "json_object" } });
  });

  it("returns plain text for drafts without JSON mode", async () => {
    const { calls, impl } = fakeFetch([ok("hello")]);
    const llm = createMistral({ apiKey: "k", fetch: impl, retryDelaysMs: [] });
    expect(await llm.text([{ role: "user", content: "hi" }])).toBe("hello");
    expect(JSON.parse(String(calls[0].init.body))).not.toHaveProperty("response_format");
  });

  it("retries rate limits and server errors, then succeeds", async () => {
    const { calls, impl } = fakeFetch([new Response("slow down", { status: 429 }), new Response("oops", { status: 503 }), ok("done")]);
    const llm = createMistral({ apiKey: "k", fetch: impl, retryDelaysMs: [0, 0, 0] });
    expect(await llm.text([])).toBe("done");
    expect(calls).toHaveLength(3);
  });

  it("gives up after the retries and says why, without leaking the key", async () => {
    const { calls, impl } = fakeFetch([new Response("no", { status: 429 }), new Response("no", { status: 429 }), new Response("no", { status: 429 })]);
    const llm = createMistral({ apiKey: "sk-secret", fetch: impl, retryDelaysMs: [0, 0] });
    const err = await llm.text([]).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/failed: 429/);
    expect((err as Error).message).not.toContain("sk-secret");
    expect(calls).toHaveLength(3);
  });

  it("does not retry a client error such as a bad key", async () => {
    const { calls, impl } = fakeFetch([new Response("unauthorized", { status: 401 })]);
    const llm = createMistral({ apiKey: "bad", fetch: impl, retryDelaysMs: [0, 0] });
    await expect(llm.text([])).rejects.toThrow(/401/);
    expect(calls).toHaveLength(1);
  });

  it("throws when the reply has no content", async () => {
    const { impl } = fakeFetch([new Response(JSON.stringify({ choices: [] }), { status: 200 })]);
    await expect(createMistral({ apiKey: "k", fetch: impl, retryDelaysMs: [] }).text([])).rejects.toThrow(/no content/);
  });

  it("honours a custom base URL and model", async () => {
    const { calls, impl } = fakeFetch([ok("x")]);
    await createMistral({ apiKey: "k", baseUrl: "http://localhost:8787/v1/", model: "m", fetch: impl, retryDelaysMs: [] }).text([]);
    expect(calls[0].url).toBe("http://localhost:8787/v1/chat/completions");
    expect(JSON.parse(String(calls[0].init.body)).model).toBe("m");
  });
});
