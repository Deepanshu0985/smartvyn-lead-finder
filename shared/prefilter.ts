// Cheap, free checks that run before any AI call. Everything here is pure so it is
// easy to test.

import type { Config } from "./config";
import type { RedditPost } from "./types";

export type Candidate = {
  post: RedditPost;
  keywordHits: number;
  /** How many "I want something" phrases the post contains. */
  intentHits: number;
  /** Higher = checked by the AI first when the per-run cap cuts the list. */
  priority: number;
};

const lower = (s: string) => s.toLowerCase();

export function isHiringBoard(post: RedditPost, cfg: Pick<Config, "hiringBoards">): boolean {
  return cfg.hiringBoards.some((b) => lower(b) === lower(post.subreddit));
}

export function countKeywordHits(post: RedditPost, keywords: string[]): number {
  const text = lower(`${post.title}\n${post.body}`);
  return keywords.filter((k) => text.includes(lower(k))).length;
}

export function countIntentHits(post: RedditPost, signals: string[]): number {
  const text = lower(`${post.title}\n${post.body}`);
  return signals.filter((k) => text.includes(lower(k))).length;
}

/** "[Hiring]" or "[Task]" tags are how hiring boards mark posts from people who will pay. */
function hasHiringTag(post: RedditPost): boolean {
  return /\[\s*(hiring|task)\s*\]/i.test(post.title) || /^(hiring|task)$/i.test(post.flair.trim());
}

export function prefilter(
  posts: RedditPost[],
  cfg: Pick<Config, "keywords" | "intentSignals" | "skipTitlePatterns" | "maxPostAgeHours" | "hiringBoards">,
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

    const hiringBoard = isHiringBoard(post, cfg);
    const tagged = hasHiringTag(post);
    // On hiring boards only posts from people who will pay are worth a look.
    if (hiringBoard && !tagged) continue;

    // Elsewhere, a topic keyword alone is not enough (most posts that mention "website" want nothing):
    // the poster must also ask for something.
    const intentHits = countIntentHits(post, cfg.intentSignals);
    const asksQuestion = post.title.includes("?");
    if (!tagged && intentHits === 0 && !asksQuestion) continue;

    // Posts tagged [Hiring] come first, then those that clearly ask for something.
    const priority = (tagged ? 6 : 0) + intentHits * 2 + (asksQuestion ? 1 : 0) + keywordHits;
    out.push({ post, keywordHits, intentHits, priority });
  }

  // If the per-run AI cap cuts the list, the cut ones are the weakest; ties go to the newest.
  return out.sort((a, b) => b.priority - a.priority || b.post.createdUtc - a.post.createdUtc);
}
