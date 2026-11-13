// Cheap, free checks that run before any AI call. Everything here is pure so it is
// easy to test.

import type { Config } from "./config";
import type { RedditPost } from "./types";

export type Candidate = { post: RedditPost; keywordHits: number };

const lower = (s: string) => s.toLowerCase();

export function isHiringBoard(post: RedditPost, cfg: Pick<Config, "hiringBoards">): boolean {
  return cfg.hiringBoards.some((b) => lower(b) === lower(post.subreddit));
}

export function countKeywordHits(post: RedditPost, keywords: string[]): number {
  const text = lower(`${post.title}\n${post.body}`);
  return keywords.filter((k) => text.includes(lower(k))).length;
}

/** "[Hiring]" or "[Task]" tags are how hiring boards mark posts from people who will pay. */
function hasHiringTag(post: RedditPost): boolean {
  return /\[\s*(hiring|task)\s*\]/i.test(post.title) || /^(hiring|task)$/i.test(post.flair.trim());
}

export function prefilter(
  posts: RedditPost[],
  cfg: Pick<Config, "keywords" | "skipTitlePatterns" | "maxPostAgeHours" | "hiringBoards">,
  nowMs: number,
): Candidate[] {
  const maxAgeMs = cfg.maxPostAgeHours * 3_600_000;
  const out: Candidate[] = [];

  for (const post of posts) {
    if (post.stickied || post.over18) continue;
    if (!post.title || post.body === "[removed]" || post.body === "[deleted]") continue;
    if (nowMs - post.createdUtc * 1000 > maxAgeMs) continue;
    if (cfg.skipTitlePatterns.some((re) => re.test(post.title))) continue;

    const keywordHits = countKeywordHits(post, cfg.keywords);
    if (keywordHits === 0) continue;
    // On hiring boards only posts from people who will pay are worth a look.
    if (isHiringBoard(post, cfg) && !hasHiringTag(post)) continue;

    out.push({ post, keywordHits });
  }

  // Best-matching, then newest, first: if the AI cap is hit, the cut ones are the weakest.
  return out.sort((a, b) => b.keywordHits - a.keywordHits || b.post.createdUtc - a.post.createdUtc);
}
