import { describe, expect, it } from "vitest";
import { redisStore } from "../src/redis-store";
import type { StoredPost } from "../../shared/types";
import { fakeRedis } from "./helpers";

const post = (id: string, over: Partial<StoredPost> = {}): StoredPost => ({
  id, subreddit: "forhire", title: id, url: `https://x/${id}`, author: "u", body: "", postedAt: new Date(1_791_000_000_000).toISOString(),
  type: "client_lead", score: 80, service: "chatbot", reason: "r", draft: "d", status: "new", notified: false, ...over,
});

describe("redisStore", () => {
  it("remembers every processed post, ignored ones included, for 14 days", async () => {
    const { redis, setCalls } = fakeRedis();
    const s = redisStore(redis, () => 1_000_000);
    await s.saveMany([post("a"), post("b", { status: "ignored", type: "irrelevant", score: 5 })]);
    expect(await s.seenIds(["a", "b", "zzz"])).toEqual(new Set(["a", "b"]));
    expect(setCalls.map((c) => c.key)).toEqual(["seen:a", "seen:b"]);
    expect(setCalls[0].expiration?.getTime()).toBe(1_000_000 + 14 * 86_400_000);
  });

  it("keeps only real leads in the leads hash", async () => {
    const { redis, hashes } = fakeRedis();
    const s = redisStore(redis);
    await s.saveMany([post("a"), post("b", { status: "ignored" })]);
    expect(Object.keys(hashes.get("leads") ?? {})).toEqual(["a"]);
  });

  it("ignores unsafe ids when asked what has been seen", async () => {
    const { redis } = fakeRedis();
    expect(await redisStore(redis).seenIds(["bad id", "x);y"])).toEqual(new Set());
  });

  it("lists unsent leads best first and honours the score floor and limit", async () => {
    const { redis } = fakeRedis();
    const s = redisStore(redis);
    await s.saveMany([post("a", { score: 70 }), post("b", { score: 95 }), post("c", { score: 50 }), post("d", { score: 85 })]);
    expect((await s.unnotified(60, 2)).map((p) => p.id)).toEqual(["b", "d"]);
  });

  it("stops offering a lead once it has been sent", async () => {
    const { redis } = fakeRedis();
    const s = redisStore(redis);
    await s.saveMany([post("a"), post("b")]);
    await s.markNotified(["a"]);
    expect((await s.unnotified(0, 10)).map((p) => p.id)).toEqual(["b"]);
  });

  it("changes a lead's status", async () => {
    const { redis } = fakeRedis();
    const s = redisStore(redis);
    await s.saveMany([post("a")]);
    await s.setStatus("a", "replied");
    expect((await s.list("replied", 10)).map((p) => p.id)).toEqual(["a"]);
    expect(await s.list("new", 10)).toEqual([]);
  });

  it("prunes leads older than the cutoff", async () => {
    const { redis } = fakeRedis();
    const s = redisStore(redis);
    const old = new Date(1_000).toISOString();
    await s.saveMany([post("old", { postedAt: old }), post("fresh")]);
    await s.prune(1_791_000_000_000 - 86_400_000);
    expect((await s.list("new", 10)).map((p) => p.id)).toEqual(["fresh"]);
  });

  it("skips a corrupt entry instead of breaking the run", async () => {
    const { redis, hashes } = fakeRedis();
    const s = redisStore(redis);
    await s.saveMany([post("a")]);
    hashes.get("leads")!.broken = "{not json";
    expect((await s.list("new", 10)).map((p) => p.id)).toEqual(["a"]);
  });
});
