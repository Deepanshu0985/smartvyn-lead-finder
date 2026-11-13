// READ-ONLY. Fetches posts through Devvit's Reddit client using only two methods:
// getNewPosts (a subreddit's newest posts) and searchPosts (a Reddit-wide search, newest first).
// tests/readonly.test.ts fails if any other `reddit.` method is ever used in src/.

import type { Config } from "../../shared/config";
import type { RedditPost } from "../../shared/types";

/** The parts of a Devvit `Post` that we read. */
export type PostLike = {
  id: string;
  subredditName: string;
  title: string;
  body: string | undefined;
  authorName: string;
  permalink: string;
  createdAt: Date;
  stickied: boolean;
  nsfw: boolean;
  removed: boolean;
  flair: { text?: string | undefined } | undefined;
};

type ListingLike = { get(count: number): Promise<PostLike[]> };

/** The two read-only methods of Devvit's `reddit` client that this app is allowed to use. */
export type RedditLike = {
  getNewPosts(options: { subredditName: string; limit: number; pageSize: number }): ListingLike;
  searchPosts(options: { query: string; sort: "new"; timeframe: "day"; limit: number; pageSize: number }): ListingLike;
};

const SAFE_ID = /^[a-z0-9_]{1,20}$/i;

/** Converts a Devvit post (ids look like "t3_abc123") into the shape the shared pipeline uses. */
export function toRedditPost(p: PostLike): RedditPost | null {
  const id = p.id.replace(/^t3_/, "");
  if (!SAFE_ID.test(id) || !p.title || !p.permalink) return null;
  const when = p.createdAt instanceof Date ? p.createdAt.getTime() : NaN;
  if (!Number.isFinite(when)) return null;
  return {
    id,
    subreddit: p.subredditName,
    title: p.title,
    body: p.removed ? "[removed]" : (p.body ?? ""),
    author: p.authorName,
    url: p.permalink.startsWith("http") ? p.permalink : `https://www.reddit.com${p.permalink}`,
    createdUtc: Math.floor(when / 1000),
    flair: p.flair?.text ?? "",
    stickied: p.stickied,
    over18: p.nsfw,
  };
}

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 160);

/** Runs `tasks` with at most `limit` in flight. */
async function inBatches<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < tasks.length; i += limit) {
    out.push(...(await Promise.all(tasks.slice(i, i + limit).map((t) => t()))));
  }
  return out;
}

export async function fetchPosts(
  reddit: RedditLike,
  cfg: Pick<Config, "subreddits" | "searchQueries" | "postsPerSubreddit">,
): Promise<{ posts: RedditPost[]; errors: string[] }> {
  const n = cfg.postsPerSubreddit;
  const sources: { label: string; load: () => Promise<PostLike[]> }[] = [
    ...cfg.subreddits.map((subredditName) => ({
      label: `r/${subredditName}`,
      load: () => reddit.getNewPosts({ subredditName, limit: n, pageSize: n }).get(n),
    })),
    ...cfg.searchQueries.map((query) => ({
      label: `search "${query.slice(0, 30)}"`,
      load: () => reddit.searchPosts({ query, sort: "new", timeframe: "day", limit: n, pageSize: n }).get(n),
    })),
  ];

  const errors: string[] = [];
  const results = await inBatches(
    sources.map((s) => async () => {
      try {
        return await s.load();
      } catch (err) {
        errors.push(`${s.label}: ${errText(err)}`);
        return [];
      }
    }),
    4,
  );

  // A post can show up both in a subreddit listing and in a search: keep one copy.
  const byId = new Map<string, RedditPost>();
  for (const list of results) {
    for (const raw of list) {
      const post = toRedditPost(raw);
      if (post && !byId.has(post.id)) byId.set(post.id, post);
    }
  }
  return { posts: [...byId.values()], errors };
}
