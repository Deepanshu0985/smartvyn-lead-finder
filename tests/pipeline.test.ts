import { describe, expect, it } from "vitest";
import { config, type Config } from "../shared/config";
import { runPipeline, type Deps } from "../shared/pipeline";
import { memoryStore } from "../src/lib/store";
import type { Classification, RedditPost, StoredPost } from "../shared/types";
import { fixturePosts, NOW_MS } from "./helpers";

const LEADS = new Set(["a1", "a6", "a9", "b2"]);
const QUESTIONS = new Set(["a4"]);

function verdict(post: RedditPost): Classification {
  if (LEADS.has(post.id)) return { type: "client_lead", score: 85, service: "chatbot", reason: "wants to hire" };
  if (QUESTIONS.has(post.id)) return { type: "question_to_answer", score: 68, service: "automation", reason: "how-to" };
  return { type: "irrelevant", score: 10, service: "other", reason: "not relevant" };
}

function setup(overrides: Partial<Deps> = {}, cfg: Config = config) {
  const calls = { classify: [] as string[], draft: [] as string[], notified: [] as string[][] };
  const store = memoryStore(new Map());
  const deps: Deps = {
    fetchPosts: async () => ({ posts: fixturePosts(), errors: [] }),
    classify: async (p) => {
      calls.classify.push(p.id);
      return verdict(p);
    },
    draft: async (p) => {
      calls.draft.push(p.id);
      return `draft for ${p.id}`;
    },
    store,
    notify: async (leads: StoredPost[]) => {
      calls.notified.push(leads.map((l) => l.id));
      return { sent: leads.map((l) => l.id) };
    },
    now: () => NOW_MS,
    ...overrides,
  };
  return { deps, calls, store, run: () => runPipeline(deps, cfg) };
}

describe("runPipeline", () => {
  it("fetches, filters, classifies, drafts and notifies the best leads", async () => {
    const { run, calls, store } = setup();
    const s = await run();

    expect(s).toMatchObject({ fetched: 14, candidates: 7, newCandidates: 7, classified: 7, leadsFound: 5, notified: 5, skippedByCap: 0, errors: [] });
    // Drafts are only written for leads, never for irrelevant posts.
    expect(new Set(calls.draft)).toEqual(new Set([...LEADS, ...QUESTIONS]));
    expect(new Set(calls.notified[0])).toEqual(new Set([...LEADS, ...QUESTIONS]));
    // Irrelevant posts are remembered (so they are not re-checked) but kept off the list.
    expect(await store.seenIds(["a7", "a8"])).toEqual(new Set(["a7", "a8"]));
    expect((await store.list("ignored", 50)).map((p) => p.id).sort()).toEqual(["a7", "a8"]);
  });

  it("sends the best match first", async () => {
    const { run, calls } = setup();
    await run();
    expect(calls.notified[0].at(-1)).toBe("a4"); // the only 68; the 85s come first
  });

  it("never processes or sends the same post twice", async () => {
    const { run, calls } = setup();
    await run();
    const classifiedFirst = calls.classify.length;
    const second = await run();
    expect(calls.classify.length).toBe(classifiedFirst);
    expect(second).toMatchObject({ newCandidates: 0, classified: 0, notified: 0 });
    expect(calls.notified).toHaveLength(1);
  });

  it("caps AI calls per run and picks up the rest next time", async () => {
    const { run, calls } = setup({}, { ...config, maxAiCallsPerRun: 3 });
    const first = await run();
    expect(first).toMatchObject({ classified: 3, skippedByCap: 4 });
    const second = await run();
    expect(second.classified).toBe(3);
    expect(new Set(calls.classify).size).toBe(6); // no repeats across runs
  });

  it("does not save a post whose classification failed, so it is retried", async () => {
    let fail = true;
    const { run, calls } = setup({
      classify: async (p) => {
        calls.classify.push(p.id);
        if (p.id === "a1" && fail) throw new Error("Mistral chat failed: 429");
        return verdict(p);
      },
    });
    const first = await run();
    expect(first.errors.some((e) => e.includes("a1") && e.includes("429"))).toBe(true);
    expect(first.classified).toBe(6);

    fail = false;
    const second = await run();
    expect(second).toMatchObject({ newCandidates: 1, classified: 1, leadsFound: 1 });
    expect(calls.classify.filter((id) => id === "a1")).toHaveLength(2);
  });

  it("reports many identical failures as one line, not one per post", async () => {
    const { run } = setup({
      classify: async () => {
        throw new Error("PERMISSION_DENIED: domain api.mistral.ai is not allowed");
      },
    });
    const s = await run();
    expect(s.classified).toBe(0);
    expect(s.errors).toHaveLength(1);
    expect(s.errors[0]).toMatch(/^classify failed for 7 posts \(.+, \.\.\.\): PERMISSION_DENIED: domain api\.mistral\.ai is not allowed$/);
    // Nothing was saved, so every post is retried once the problem is fixed.
    expect((await run()).newCandidates).toBe(7);
  });

  it("keeps different failures on separate lines", async () => {
    const { run } = setup({
      classify: async (p) => {
        throw new Error(p.id === "a1" ? "429 slow down" : "403 forbidden");
      },
    });
    expect((await run()).errors).toHaveLength(2);
  });

  it("still notifies when only the draft fails, and says there is no draft", async () => {
    const { run, store } = setup({
      draft: async (p) => {
        if (p.id === "a1") throw new Error("boom");
        return "ok";
      },
    });
    const s = await run();
    expect(s.notified).toBe(5);
    expect(s.errors.some((e) => e.startsWith("draft failed for 1 post (a1)"))).toBe(true);
    expect((await store.list("new", 50)).find((p) => p.id === "a1")?.draft).toBe("");
  });

  it("retries delivery on the next run when notifying fails", async () => {
    let up = false;
    const { run, calls } = setup({
      notify: async (leads) => {
        calls.notified.push(leads.map((l) => l.id));
        return up ? { sent: leads.map((l) => l.id) } : { sent: [], error: "Telegram returned 500" };
      },
    });
    const first = await run();
    expect(first.notified).toBe(0);
    expect(first.errors).toContain("Telegram returned 500");

    up = true;
    const second = await run();
    expect(second.notified).toBe(5);
    expect(second.classified).toBe(0); // no re-classification, just delivery
  });

  it("sends at most maxLeadsPerRun per run, the rest next time", async () => {
    const { run, calls } = setup({}, { ...config, maxLeadsPerRun: 2 });
    expect((await run()).notified).toBe(2);
    expect((await run()).notified).toBe(2);
    expect((await run()).notified).toBe(1);
    expect(new Set(calls.notified.flat()).size).toBe(5);
  });

  it("does not send leads that have gone stale", async () => {
    const { run, deps, store } = setup();
    await store.saveMany([
      {
        id: "old1", subreddit: "forhire", title: "old", url: "u", author: "a", body: "",
        postedAt: new Date(NOW_MS - 40 * 3_600_000).toISOString(),
        type: "client_lead", score: 90, service: "chatbot", reason: "", draft: "", status: "new", notified: false,
      },
    ]);
    const calls: string[][] = [];
    deps.notify = async (leads) => {
      calls.push(leads.map((l) => l.id));
      return { sent: leads.map((l) => l.id) };
    };
    await run();
    expect(calls.flat()).not.toContain("old1");
  });

  it("reports subreddit fetch errors without failing the run", async () => {
    const { run } = setup({ fetchPosts: async () => ({ posts: fixturePosts(), errors: ["r/forhire: Reddit returned 403"] }) });
    const s = await run();
    expect(s.errors).toContain("r/forhire: Reddit returned 403");
    expect(s.notified).toBe(5);
  });

  it("copes with an empty fetch", async () => {
    const { run } = setup({ fetchPosts: async () => ({ posts: [], errors: [] }) });
    expect(await run()).toMatchObject({ fetched: 0, classified: 0, notified: 0 });
  });
});
