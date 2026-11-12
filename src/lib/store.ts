// Where seen posts and leads are kept. Supabase when SUPABASE_URL and SUPABASE_SECRET_KEY
// are set (required on Vercel, where memory does not survive between runs); otherwise an
// in-memory store so local development works with zero setup.

import "server-only";
import type { Status, StoredPost } from "./types";

export type Store = {
  /** Which of these post ids we have already processed. */
  seenIds(ids: string[]): Promise<Set<string>>;
  saveMany(posts: StoredPost[]): Promise<void>;
  markNotified(ids: string[]): Promise<void>;
  /** Leads that scored well enough to send but have not been sent yet (e.g. Telegram was down). */
  unnotified(minScore: number, limit: number): Promise<StoredPost[]>;
  list(status: Status, limit: number): Promise<StoredPost[]>;
  setStatus(id: string, status: Status): Promise<void>;
  /** Deletes ignored posts that were posted before this time (unix ms). */
  prune(cutoffMs: number): Promise<void>;
};

const SAFE_ID = /^[a-z0-9_]{1,20}$/i;
export const safeIds = (ids: string[]) => ids.filter((id) => SAFE_ID.test(id));

// ---- memory ---------------------------------------------------------------

const g = globalThis as typeof globalThis & { __finderMemory?: Map<string, StoredPost> };

export function memoryStore(map: Map<string, StoredPost> = (g.__finderMemory ??= new Map())): Store {
  const byScore = (a: StoredPost, b: StoredPost) => b.score - a.score || Date.parse(b.postedAt) - Date.parse(a.postedAt);
  return {
    async seenIds(ids) {
      return new Set(ids.filter((id) => map.has(id)));
    },
    async saveMany(posts) {
      for (const p of posts) map.set(p.id, p);
    },
    async markNotified(ids) {
      for (const id of ids) {
        const p = map.get(id);
        if (p) p.notified = true;
      }
    },
    async unnotified(minScore, limit) {
      return [...map.values()]
        .filter((p) => p.status === "new" && !p.notified && p.score >= minScore)
        .sort(byScore)
        .slice(0, limit);
    },
    async list(status, limit) {
      return [...map.values()].filter((p) => p.status === status).sort(byScore).slice(0, limit);
    },
    async setStatus(id, status) {
      const p = map.get(id);
      if (p) p.status = status;
    },
    async prune(cutoffMs) {
      for (const [id, p] of map) if (p.status === "ignored" && Date.parse(p.postedAt) < cutoffMs) map.delete(id);
    },
  };
}

// ---- supabase (PostgREST over fetch) -----------------------------------------

type Row = {
  id: string;
  subreddit: string;
  title: string;
  url: string;
  author: string;
  body: string;
  posted_at: string;
  type: StoredPost["type"];
  score: number;
  service: StoredPost["service"];
  reason: string;
  draft: string;
  status: Status;
  notified: boolean;
};

const toRow = (p: StoredPost): Row => ({
  id: p.id,
  subreddit: p.subreddit,
  title: p.title,
  url: p.url,
  author: p.author,
  body: p.body,
  posted_at: p.postedAt,
  type: p.type,
  score: p.score,
  service: p.service,
  reason: p.reason,
  draft: p.draft,
  status: p.status,
  notified: p.notified,
});

const fromRow = (r: Row): StoredPost => ({
  id: r.id,
  subreddit: r.subreddit,
  title: r.title,
  url: r.url,
  author: r.author,
  body: r.body,
  postedAt: r.posted_at,
  type: r.type,
  score: r.score,
  service: r.service,
  reason: r.reason,
  draft: r.draft,
  status: r.status,
  notified: r.notified,
});

export function supabaseStore(url: string, key: string, fetchImpl: typeof fetch = fetch): Store {
  const base = `${url.replace(/\/$/, "")}/rest/v1/posts`;
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  // Legacy service_role keys are JWTs and also go in Authorization; new sb_secret_ keys must not.
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetchImpl(`${base}${path}`, { ...init, headers: { ...headers, ...init.headers }, cache: "no-store" });
    if (!res.ok) throw new Error(`Supabase ${init.method ?? "GET"} ${path.split("?")[0] || "/"} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res;
  }
  const order = "order=score.desc,posted_at.desc";

  return {
    async seenIds(ids) {
      const safe = safeIds(ids);
      if (!safe.length) return new Set();
      const rows = (await (await call(`?select=id&id=in.(${safe.join(",")})`)).json()) as { id: string }[];
      return new Set(rows.map((r) => r.id));
    },
    async saveMany(posts) {
      if (!posts.length) return;
      await call("?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(posts.map(toRow)),
      });
    },
    async markNotified(ids) {
      const safe = safeIds(ids);
      if (!safe.length) return;
      await call(`?id=in.(${safe.join(",")})`, { method: "PATCH", body: JSON.stringify({ notified: true }) });
    },
    async unnotified(minScore, limit) {
      const rows = (await (await call(`?status=eq.new&notified=eq.false&score=gte.${Math.floor(minScore)}&${order}&limit=${Math.floor(limit)}`)).json()) as Row[];
      return rows.map(fromRow);
    },
    async list(status, limit) {
      const rows = (await (await call(`?status=eq.${status}&${order}&limit=${Math.floor(limit)}`)).json()) as Row[];
      return rows.map(fromRow);
    },
    async setStatus(id, status) {
      if (!safeIds([id]).length) return;
      await call(`?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    },
    async prune(cutoffMs) {
      const cutoff = new Date(cutoffMs).toISOString();
      await call(`?status=eq.ignored&posted_at=lt.${encodeURIComponent(cutoff)}`, { method: "DELETE" });
    },
  };
}

export function storageMode(): "supabase" | "memory" {
  return process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY ? "supabase" : "memory";
}

export function getStore(): Store {
  return storageMode() === "supabase"
    ? supabaseStore(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!)
    : memoryStore();
}
