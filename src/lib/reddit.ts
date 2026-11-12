// READ-ONLY Reddit access. This module never posts, comments, votes or messages:
//   - the only POST is the OAuth token request (app-only "client credentials", which
//     cannot act as a user at all);
//   - everything else is a GET of a public listing.
// tests/readonly.test.ts fails the build if a write endpoint ever appears in src/.

import "server-only";
import { readFile } from "node:fs/promises";
import type { RedditPost } from "./types";

const USER_AGENT =
  process.env.REDDIT_USER_AGENT || "web:smartvyn-lead-finder:v0.1 (read-only lead finder by Smartvyn)";

type Listing = {
  data?: {
    children?: {
      data?: {
        id?: string;
        subreddit?: string;
        title?: string;
        selftext?: string;
        author?: string;
        permalink?: string;
        created_utc?: number;
        link_flair_text?: string | null;
        stickied?: boolean;
        over_18?: boolean;
      };
    }[];
  };
};

/** Turns Reddit's listing JSON into our post shape, dropping anything malformed. */
export function parseListing(json: unknown): RedditPost[] {
  const children = (json as Listing)?.data?.children;
  if (!Array.isArray(children)) return [];
  const posts: RedditPost[] = [];
  for (const child of children) {
    const d = child?.data;
    if (!d?.id || !d.title || typeof d.created_utc !== "number" || !d.permalink) continue;
    if (!/^[a-z0-9_]{1,20}$/i.test(d.id)) continue;
    posts.push({
      id: d.id,
      subreddit: d.subreddit ?? "",
      title: d.title,
      body: d.selftext ?? "",
      author: d.author ?? "",
      url: `https://www.reddit.com${d.permalink}`,
      createdUtc: d.created_utc,
      flair: d.link_flair_text ?? "",
      stickied: Boolean(d.stickied),
      over18: Boolean(d.over_18),
    });
  }
  return posts;
}

let token: { value: string; expiresAt: number } | null = null;

export function hasRedditCredentials(): boolean {
  return Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
}

/** App-only OAuth token. Needs a Reddit "script" or "web" app (see README). */
async function accessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const basic = Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Reddit token request failed: ${res.status}`);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Reddit token response had no access_token");
  token = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return token.value;
}

async function get(url: string, headers: Record<string, string>): Promise<Response> {
  return fetch(url, { method: "GET", headers: { "User-Agent": USER_AGENT, ...headers }, cache: "no-store" });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type FetchResult = { posts: RedditPost[]; errors: string[] };

/**
 * Reads the newest posts from each subreddit, politely: one request at a time with a
 * pause between them, stopping early if Reddit says to slow down.
 */
export async function fetchNewPosts(subreddits: string[], limit: number): Promise<FetchResult> {
  const fixture = process.env.REDDIT_FIXTURE_FILE;
  if (fixture) {
    // Local testing without touching Reddit: a saved listing, filtered per subreddit.
    const all = parseListing(JSON.parse(await readFile(fixture, "utf8")));
    return { posts: all.filter((p) => subreddits.some((s) => s.toLowerCase() === p.subreddit.toLowerCase())), errors: [] };
  }

  const posts: RedditPost[] = [];
  const errors: string[] = [];
  const authed = hasRedditCredentials();

  for (const sub of subreddits) {
    if (!/^[A-Za-z0-9_]{2,21}$/.test(sub)) {
      errors.push(`r/${sub}: invalid subreddit name`);
      continue;
    }
    try {
      const res = authed
        ? await get(`https://oauth.reddit.com/r/${sub}/new?limit=${limit}&raw_json=1`, {
            Authorization: `Bearer ${await accessToken()}`,
          })
        : await get(`https://www.reddit.com/r/${sub}/new.json?limit=${limit}&raw_json=1`, {});

      if (res.status === 429) {
        errors.push(`r/${sub}: rate limited by Reddit, stopping this run early`);
        break;
      }
      if (!res.ok) {
        errors.push(`r/${sub}: Reddit returned ${res.status}`);
        continue;
      }
      posts.push(...parseListing(await res.json()));
    } catch (err) {
      errors.push(`r/${sub}: ${err instanceof Error ? err.message : "request failed"}`);
    }
    await sleep(authed ? 400 : 1200);
  }
  return { posts, errors };
}
