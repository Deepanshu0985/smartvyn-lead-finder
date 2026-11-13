// One run of the lead finder: fetch -> pre-filter -> skip seen -> AI classify -> AI draft
// -> store -> notify. Everything external is injected, so the whole flow is testable
// without touching Reddit, Mistral, Telegram or a database.

import type { Config } from "./config";
import { prefilter } from "./prefilter";
import type { Classification, RedditPost, Store, StoredPost } from "./types";

export type Deps = {
  fetchPosts: () => Promise<{ posts: RedditPost[]; errors: string[] }>;
  classify: (post: RedditPost) => Promise<Classification>;
  draft: (post: RedditPost, c: Classification) => Promise<string>;
  store: Store;
  /** Sends leads somewhere you will see them. Returns the ids that were delivered. */
  notify: (leads: StoredPost[]) => Promise<{ sent: string[]; error?: string }>;
  now: () => number;
};

export type RunSummary = {
  fetched: number;
  candidates: number;
  newCandidates: number;
  classified: number;
  leadsFound: number;
  notified: number;
  skippedByCap: number;
  errors: string[];
};

/** Runs `fn` over `items` with at most `limit` in flight, keeping results in order. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 200);

/** Turns many identical failures into one line: "classify failed for 8 posts (a, b, c, ...): <reason>". */
function collapse(kind: string, failures: Map<string, string[]>): string[] {
  return [...failures].map(([message, ids]) => {
    const shown = ids.slice(0, 3).join(", ") + (ids.length > 3 ? ", ..." : "");
    return `${kind} failed for ${ids.length} post${ids.length === 1 ? "" : "s"} (${shown}): ${message}`;
  });
}

export async function runPipeline(deps: Deps, cfg: Config): Promise<RunSummary> {
  const nowMs = deps.now();
  const summary: RunSummary = {
    fetched: 0,
    candidates: 0,
    newCandidates: 0,
    classified: 0,
    leadsFound: 0,
    notified: 0,
    skippedByCap: 0,
    errors: [],
  };

  const { posts, errors } = await deps.fetchPosts();
  summary.fetched = posts.length;
  summary.errors.push(...errors);

  const candidates = prefilter(posts, cfg, nowMs);
  summary.candidates = candidates.length;

  const seen = await deps.store.seenIds(candidates.map((c) => c.post.id));
  const fresh = candidates.filter((c) => !seen.has(c.post.id));
  summary.newCandidates = fresh.length;

  const batch = fresh.slice(0, cfg.maxAiCallsPerRun);
  summary.skippedByCap = fresh.length - batch.length;

  const classifyFailures = new Map<string, string[]>();
  const draftFailures = new Map<string, string[]>();
  const noteFailure = (into: Map<string, string[]>, message: string, id: string) =>
    into.set(message, [...(into.get(message) ?? []), id]);

  const results = await pool(batch, 3, async ({ post }): Promise<StoredPost | null> => {
    let c: Classification;
    try {
      c = await deps.classify(post);
    } catch (err) {
      // Not saved, so the post is tried again on the next run.
      noteFailure(classifyFailures, errText(err), post.id);
      return null;
    }
    summary.classified++;

    const isLead = c.type !== "irrelevant" && c.score >= cfg.minScoreToNotify;
    let draft = "";
    if (isLead) {
      try {
        draft = await deps.draft(post, c);
      } catch (err) {
        noteFailure(draftFailures, errText(err), post.id);
      }
    }
    return {
      id: post.id,
      subreddit: post.subreddit,
      title: post.title,
      url: post.url,
      author: post.author,
      body: post.body.slice(0, 4000),
      postedAt: new Date(post.createdUtc * 1000).toISOString(),
      type: c.type,
      score: c.score,
      service: c.service,
      reason: c.reason,
      draft,
      status: isLead ? "new" : "ignored",
      notified: false,
    };
  });

  summary.errors.push(...collapse("classify", classifyFailures), ...collapse("draft", draftFailures));

  const stored = results.filter((r): r is StoredPost => r !== null);
  await deps.store.saveMany(stored);
  summary.leadsFound = stored.filter((p) => p.status === "new").length;

  // Also picks up leads from earlier runs that could not be sent (e.g. Telegram was down),
  // but never anything that has gone stale.
  const maxAgeMs = cfg.maxPostAgeHours * 1.5 * 3_600_000;
  const pending = (await deps.store.unnotified(cfg.minScoreToNotify, cfg.maxLeadsPerRun)).filter(
    (p) => nowMs - Date.parse(p.postedAt) <= maxAgeMs,
  );
  if (pending.length) {
    const { sent, error } = await deps.notify(pending);
    if (error) summary.errors.push(error);
    await deps.store.markNotified(sent);
    summary.notified = sent.length;
  }

  await deps.store.prune(nowMs - cfg.pruneIgnoredAfterDays * 86_400_000).catch((err) => summary.errors.push(`prune: ${errText(err)}`));
  return summary;
}
