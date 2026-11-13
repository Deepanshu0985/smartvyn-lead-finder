import { readFileSync } from "node:fs";
import type { PostLike, RedditLike } from "../src/reddit-source";
import type { RedisLike } from "../src/redis-store";

/** The fixed "now" the shared fixture was written against (unix seconds). */
export const REFERENCE = 1791000000;
export const NOW_MS = REFERENCE * 1000;

type RawChild = {
  data: {
    id: string; subreddit: string; title: string; selftext: string; author: string; permalink: string;
    created_utc: number; link_flair_text: string | null; stickied: boolean; over_18: boolean;
  };
};

/** The shared Reddit fixture, shaped like Devvit `Post` objects (ids prefixed t3_). */
export function fixturePostLikes(): PostLike[] {
  const raw = JSON.parse(readFileSync(new URL("../../fixtures/reddit-sample.json", import.meta.url), "utf8"));
  return (raw.data.children as RawChild[]).map(({ data: d }) => ({
    id: `t3_${d.id}`,
    subredditName: d.subreddit,
    title: d.title,
    body: d.selftext,
    authorName: d.author,
    permalink: d.permalink,
    createdAt: new Date(d.created_utc * 1000),
    stickied: d.stickied,
    nsfw: d.over_18,
    removed: false,
    flair: d.link_flair_text ? { text: d.link_flair_text } : undefined,
  }));
}

export type Call = { method: "getNewPosts" | "searchPosts"; options: Record<string, unknown> };

/** A fake Devvit `reddit` client over the fixture: subreddit listings, and a search that returns everything. */
export function fakeReddit(posts = fixturePostLikes(), opts: { failOn?: string } = {}) {
  const calls: Call[] = [];
  const reddit: RedditLike = {
    getNewPosts(options) {
      calls.push({ method: "getNewPosts", options });
      return {
        get: async () => {
          if (opts.failOn === options.subredditName) throw new Error("403 Forbidden");
          return posts.filter((p) => p.subredditName.toLowerCase() === options.subredditName.toLowerCase());
        },
      };
    },
    searchPosts(options) {
      calls.push({ method: "searchPosts", options });
      return { get: async () => [] };
    },
  };
  return { reddit, calls };
}

/** An in-memory stand-in for Devvit's Redis, recording the options it was given. */
export function fakeRedis() {
  const strings = new Map<string, { value: string; expiration?: Date }>();
  const hashes = new Map<string, Record<string, string>>();
  const setCalls: { key: string; expiration?: Date }[] = [];
  const redis: RedisLike = {
    async get(key) {
      return strings.get(key)?.value;
    },
    async set(key, value, options) {
      setCalls.push({ key, expiration: options?.expiration });
      strings.set(key, { value, expiration: options?.expiration });
      return "OK";
    },
    async del(...keys) {
      for (const k of keys) strings.delete(k);
    },
    async mGet(keys) {
      return keys.map((k) => strings.get(k)?.value ?? null);
    },
    async hSet(key, fv) {
      hashes.set(key, { ...(hashes.get(key) ?? {}), ...fv });
      return Object.keys(fv).length;
    },
    async hGetAll(key) {
      return { ...(hashes.get(key) ?? {}) };
    },
    async hDel(key, fields) {
      const h = hashes.get(key) ?? {};
      let n = 0;
      for (const f of fields) if (f in h) { delete h[f]; n++; }
      return n;
    },
  };
  return { redis, strings, hashes, setCalls };
}
