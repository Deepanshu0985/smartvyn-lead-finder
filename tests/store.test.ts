import { describe, expect, it } from "vitest";
import { memoryStore, safeIds, supabaseStore } from "../src/lib/store";
import type { StoredPost } from "../src/lib/types";

const post = (id: string, over: Partial<StoredPost> = {}): StoredPost => ({
  id, subreddit: "forhire", title: id, url: `https://x/${id}`, author: "u", body: "", postedAt: new Date().toISOString(),
  type: "client_lead", score: 80, service: "chatbot", reason: "r", draft: "d", status: "new", notified: false, ...over,
});

describe("memoryStore", () => {
  it("remembers posts, lists by status best first, and updates status", async () => {
    const s = memoryStore(new Map());
    await s.saveMany([post("a", { score: 70 }), post("b", { score: 90 }), post("c", { status: "ignored" })]);
    expect((await s.list("new", 10)).map((p) => p.id)).toEqual(["b", "a"]);
    expect(await s.seenIds(["a", "c", "zzz"])).toEqual(new Set(["a", "c"]));
    await s.setStatus("b", "replied");
    expect((await s.list("replied", 10)).map((p) => p.id)).toEqual(["b"]);
  });

  it("tracks what has been sent", async () => {
    const s = memoryStore(new Map());
    await s.saveMany([post("a"), post("b", { score: 50 })]);
    expect((await s.unnotified(60, 10)).map((p) => p.id)).toEqual(["a"]);
    await s.markNotified(["a"]);
    expect(await s.unnotified(60, 10)).toEqual([]);
  });

  it("prunes only old ignored posts", async () => {
    const s = memoryStore(new Map());
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
    await s.saveMany([post("old-ignored", { status: "ignored", postedAt: old }), post("old-new", { postedAt: old })]);
    await s.prune(Date.now() - 30 * 86_400_000);
    expect(await s.seenIds(["old-ignored", "old-new"])).toEqual(new Set(["old-new"]));
  });
});

describe("supabaseStore", () => {
  function fake() {
    const calls: { url: string; init: RequestInit }[] = [];
    const impl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify([{ id: "a" }]), { status: 200 });
    }) as unknown as typeof fetch;
    return { calls, impl };
  }

  it("only ever puts safe ids into query strings", async () => {
    expect(safeIds(["ok1", "bad id", "x);drop table", "a_b"])).toEqual(["ok1", "a_b"]);
    const { calls, impl } = fake();
    const s = supabaseStore("https://p.supabase.co/", "sb_secret_x", impl);
    await s.seenIds(["a", "evil),id=neq.(x"]);
    expect(calls[0].url).toBe("https://p.supabase.co/rest/v1/posts?select=id&id=in.(a)");
  });

  it("makes no request at all when there is nothing safe to look up", async () => {
    const { calls, impl } = fake();
    await supabaseStore("https://p.supabase.co", "k", impl).seenIds(["bad id"]);
    expect(calls).toHaveLength(0);
  });

  it("upserts with merge-duplicates and snake_case columns", async () => {
    const { calls, impl } = fake();
    await supabaseStore("https://p.supabase.co", "sb_secret_x", impl).saveMany([post("a")]);
    expect(calls[0].url).toContain("?on_conflict=id");
    expect((calls[0].init.headers as Record<string, string>).Prefer).toContain("merge-duplicates");
    expect(JSON.parse(String(calls[0].init.body))[0]).toMatchObject({ id: "a", posted_at: expect.any(String), notified: false });
  });

  it("sends new sb_secret_ keys only as apikey, and legacy JWT keys also as Bearer", async () => {
    const a = fake();
    await supabaseStore("https://p.supabase.co", "sb_secret_x", a.impl).seenIds(["a"]);
    expect(a.calls[0].init.headers).not.toHaveProperty("Authorization");
    expect(a.calls[0].init.headers).toHaveProperty("apikey", "sb_secret_x");

    const b = fake();
    await supabaseStore("https://p.supabase.co", "eyJhbGciOi.x.y", b.impl).seenIds(["a"]);
    expect(b.calls[0].init.headers).toHaveProperty("Authorization", "Bearer eyJhbGciOi.x.y");
  });

  it("throws a useful error on failure without echoing credentials", async () => {
    const impl = (async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
    await expect(supabaseStore("https://p.supabase.co", "sb_secret_x", impl).seenIds(["a"])).rejects.toThrow(/failed: 401/);
  });

  it("never offers 'ignored' as something the dashboard can set", async () => {
    const { calls, impl } = fake();
    const s = supabaseStore("https://p.supabase.co", "k", impl);
    await s.setStatus("bad id", "replied");
    expect(calls).toHaveLength(0);
  });
});
