import { describe, expect, it } from "vitest";
import { RunInProgressError, runFinder, summaryText, type Env } from "../src/run";
import { fakeReddit, fakeRedis, NOW_MS } from "./helpers";

const SETTINGS = { mistralApiKey: "sk-mistral-secret", telegramBotToken: "123:TG-SECRET", telegramChatId: "42" };

function classify(title: string) {
  if (/\[hiring\]|need a developer|looking for someone/i.test(title)) return { type: "client_lead", score: 85, service: "web app", reason: "wants to hire" };
  if (/how do i|help|anyone built/i.test(title)) return { type: "question_to_answer", score: 68, service: "automation", reason: "how-to question" };
  return { type: "irrelevant", score: 10, service: "other", reason: "not relevant" };
}

/** Answers Mistral and Telegram calls like the real services would, and records them. */
function fakeFetch(opts: { telegramStatus?: number } = {}) {
  const telegram: { chat_id: string; text: string }[] = [];
  const urls: string[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    urls.push(url);
    if (url.startsWith("https://api.mistral.ai/")) {
      const body = JSON.parse(String(init.body));
      const user = body.messages.find((m: { role: string }) => m.role === "user").content as string;
      const title = /Title: (.*)/.exec(user)?.[1] ?? "";
      const content = body.response_format ? JSON.stringify(classify(title)) : "Happy to help. Which tools do you use today?";
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    }
    if (url.startsWith("https://api.telegram.org/")) {
      if (opts.telegramStatus && opts.telegramStatus !== 200) return new Response("bad", { status: opts.telegramStatus });
      telegram.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: 200 });
    }
    throw new Error(`unexpected request to ${url}`);
  }) as unknown as typeof fetch;
  return { impl, telegram, urls };
}

function setup(over: Partial<Env> = {}, settings: Record<string, string | undefined> = SETTINGS, fetchOpts = {}) {
  const f = fakeFetch(fetchOpts);
  const r = fakeReddit();
  const redis = fakeRedis();
  const env: Env = {
    reddit: r.reddit,
    redis: redis.redis,
    getSetting: async (name) => settings[name],
    fetch: f.impl,
    now: () => NOW_MS,
    telegramPauseMs: 0,
    mistralRetryDelaysMs: [],
    ...over,
  };
  return { env, f, r, redis };
}

describe("runFinder (Devvit)", () => {
  it("finds posts, ranks them and sends the best to Telegram", async () => {
    const { env, f, r } = setup();
    const s = await runFinder(env);
    expect(s.fetched).toBe(14);
    expect(s.newCandidates).toBe(7);
    expect(s.classified).toBe(7); // all 7 candidates fit under the cap of 8
    expect(s.skippedByCap).toBe(0);
    expect(s.errors).toEqual([]);
    expect(s.notified).toBeGreaterThan(0);
    expect(s.notified).toBeLessThanOrEqual(5);
    expect(f.telegram).toHaveLength(s.notified);
    expect(f.telegram.every((m) => m.chat_id === "42")).toBe(true);
    // Subreddits and Reddit-wide searches were both read.
    expect(r.calls.some((c) => c.method === "searchPosts")).toBe(true);
    expect(r.calls.some((c) => c.method === "getNewPosts")).toBe(true);
  });

  it("delivers every lead across runs, never twice", async () => {
    const { env, f } = setup();
    for (let i = 0; i < 3; i++) await runFinder(env);
    const titles = f.telegram.map((m) => /<b>(.*?)<\/b>\n/.exec(m.text.split("\n").slice(1).join("\n") + "\n")?.[1]);
    expect(new Set(titles).size).toBe(f.telegram.length); // no duplicates
    expect(f.telegram).toHaveLength(6); // 4 client leads + 2 questions worth answering
    const all = f.telegram.map((m) => m.text).join("\n");
    expect(all).toContain("Developer to build an AI chatbot for my dental clinic");
    expect(all).toContain("Need a website built for my law firm");
    expect(all).not.toContain("ignore previous instructions"); // the injection post is filtered as noise
    expect(all).not.toContain("[For Hire]");
  });

  it("does nothing on a repeat run when there is nothing new", async () => {
    const { env, f } = setup();
    for (let i = 0; i < 3; i++) await runFinder(env);
    const sent = f.telegram.length;
    const again = await runFinder(env);
    expect(again).toMatchObject({ newCandidates: 0, classified: 0, notified: 0 });
    expect(f.telegram).toHaveLength(sent);
  });

  it("only talks to Mistral and Telegram, the two domains declared in devvit.json", async () => {
    const { env, f } = setup();
    await runFinder(env);
    const hosts = new Set(f.urls.map((u) => new URL(u).host));
    expect([...hosts].sort()).toEqual(["api.mistral.ai", "api.telegram.org"]);
  });

  it("never puts a secret into the result or the messages", async () => {
    const { env, f } = setup();
    const s = await runFinder(env);
    const blob = JSON.stringify(s) + f.telegram.map((m) => m.text).join();
    for (const secret of ["sk-mistral-secret", "TG-SECRET"]) expect(blob).not.toContain(secret);
  });

  it("asks for the Mistral key when it is missing, naming the command to set it", async () => {
    const { env } = setup({}, { ...SETTINGS, mistralApiKey: undefined });
    await expect(runFinder(env)).rejects.toThrow(/devvit settings set mistralApiKey/);
  });

  it("still classifies when Telegram is not set up, and says so", async () => {
    const { env, f } = setup({}, { mistralApiKey: "k" });
    const s = await runFinder(env);
    expect(s.classified).toBe(7);
    expect(s.notified).toBe(0);
    expect(s.errors.some((e) => e.includes("Telegram is not set up"))).toBe(true);
    expect(f.telegram).toHaveLength(0);
  });

  it("keeps leads for the next run when Telegram fails", async () => {
    const down = setup({}, SETTINGS, { telegramStatus: 500 });
    const first = await runFinder(down.env);
    expect(first.notified).toBe(0);
    expect(first.errors).toContain("Telegram returned 500");
    // Same storage, Telegram back up: the leads are delivered without re-classifying.
    const up = fakeFetch();
    const second = await runFinder({ ...down.env, fetch: up.impl });
    expect(second.notified).toBeGreaterThan(0);
    expect(up.telegram.length).toBe(second.notified);
  });

  it("refuses to run twice at once, and leaves the other run's lock alone", async () => {
    const { env, redis } = setup();
    await redis.redis.set("lock:run", String(NOW_MS + 60_000));
    await expect(runFinder(env)).rejects.toBeInstanceOf(RunInProgressError);
    expect(await redis.redis.get("lock:run")).toBe(String(NOW_MS + 60_000));
  });

  it("ignores a stale lock left by a crashed run", async () => {
    const { env, redis } = setup();
    await redis.redis.set("lock:run", String(NOW_MS - 1));
    await expect(runFinder(env)).resolves.toBeDefined();
  });

  it("releases the lock after a normal run and after a failed one", async () => {
    const ok = setup();
    await runFinder(ok.env);
    expect(await ok.redis.redis.get("lock:run")).toBeUndefined();

    const broken = setup();
    broken.env.redis = { ...broken.redis.redis, hSet: async () => { throw new Error("redis down"); } };
    await expect(runFinder(broken.env)).rejects.toThrow("redis down");
    expect(await broken.redis.redis.get("lock:run")).toBeUndefined();
  });
});

describe("summaryText", () => {
  it("describes a run in one line and includes the first notes", () => {
    const text = summaryText({ fetched: 14, candidates: 8, newCandidates: 8, classified: 6, leadsFound: 4, notified: 4, skippedByCap: 2, errors: ["a", "b", "c"] });
    expect(text).toBe("Checked 14 posts: 8 new matches, 4 leads, 4 sent to Telegram. Notes: a | b");
  });
});
