// Devvit's built-in Redis as the finder's storage, so no external database is needed.
//   seen:<id>   "1", expires after 14 days: posts already processed (leads and noise alike)
//   leads       hash of id -> JSON of every lead worth showing (status new/replied/skipped)

import type { Status, Store, StoredPost } from "../../shared/types";

/** The parts of Devvit's `redis` client that we use. */
export type RedisLike = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, options?: { expiration?: Date }): Promise<string>;
  del(...keys: string[]): Promise<void>;
  mGet(keys: string[]): Promise<(string | null | undefined)[]>;
  hSet(key: string, fieldValues: { [field: string]: string }): Promise<number>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hDel(key: string, fields: string[]): Promise<number>;
};

const SEEN_DAYS = 14;
const LEADS = "leads";
const SAFE_ID = /^[a-z0-9_]{1,20}$/i;
const seenKey = (id: string) => `seen:${id}`;

const byScore = (a: StoredPost, b: StoredPost) => b.score - a.score || Date.parse(b.postedAt) - Date.parse(a.postedAt);

export function redisStore(redis: RedisLike, now: () => number = Date.now): Store {
  async function allLeads(): Promise<StoredPost[]> {
    const raw = await redis.hGetAll(LEADS);
    const out: StoredPost[] = [];
    for (const value of Object.values(raw)) {
      try {
        out.push(JSON.parse(value) as StoredPost);
      } catch {
        // A corrupt entry is skipped rather than breaking the whole run.
      }
    }
    return out;
  }

  const write = (posts: StoredPost[]) =>
    posts.length ? redis.hSet(LEADS, Object.fromEntries(posts.map((p) => [p.id, JSON.stringify(p)]))) : Promise.resolve(0);

  return {
    async seenIds(ids) {
      const safe = ids.filter((id) => SAFE_ID.test(id));
      if (!safe.length) return new Set();
      const values = await redis.mGet(safe.map(seenKey));
      return new Set(safe.filter((_, i) => Boolean(values[i])));
    },

    async saveMany(posts) {
      const expiration = new Date(now() + SEEN_DAYS * 86_400_000);
      for (const p of posts) await redis.set(seenKey(p.id), "1", { expiration });
      await write(posts.filter((p) => p.status !== "ignored"));
    },

    async markNotified(ids) {
      const wanted = new Set(ids);
      await write((await allLeads()).filter((p) => wanted.has(p.id)).map((p) => ({ ...p, notified: true })));
    },

    async unnotified(minScore, limit) {
      return (await allLeads())
        .filter((p) => p.status === "new" && !p.notified && p.score >= minScore)
        .sort(byScore)
        .slice(0, limit);
    },

    async list(status: Status, limit) {
      return (await allLeads()).filter((p) => p.status === status).sort(byScore).slice(0, limit);
    },

    async setStatus(id, status) {
      const post = (await allLeads()).find((p) => p.id === id);
      if (post) await write([{ ...post, status }]);
    },

    async prune(cutoffMs) {
      const stale = (await allLeads()).filter((p) => Date.parse(p.postedAt) < cutoffMs).map((p) => p.id);
      if (stale.length) await redis.hDel(LEADS, stale);
    },
  };
}
