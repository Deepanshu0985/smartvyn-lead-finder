// One run of the lead finder inside Devvit. All platform pieces (Reddit client, Redis, settings,
// fetch) are passed in, so the whole run can be tested without Reddit.

import { classifyPost, draftReply } from "../../shared/classify";
import type { Config } from "../../shared/config";
import { createMistral } from "../../shared/mistral-client";
import { runPipeline, type RunSummary } from "../../shared/pipeline";
import { sendLeads } from "../../shared/telegram-client";
import { devvitConfig } from "./config";
import { fetchPosts, type RedditLike } from "./reddit-source";
import { redisStore, type RedisLike } from "./redis-store";

export type Env = {
  reddit: RedditLike;
  redis: RedisLike;
  /** Reads a global app setting (set with `npx devvit settings set <name>`). */
  getSetting: (name: string) => Promise<string | undefined>;
  fetch?: typeof fetch;
  now?: () => number;
  /** Test hooks: shorten the waits between Telegram messages and Mistral retries. */
  telegramPauseMs?: number;
  mistralRetryDelaysMs?: number[];
};

const LOCK = "lock:run";
const LOCK_MS = 4 * 60_000;

export class RunInProgressError extends Error {
  constructor() {
    super("A run is already in progress");
  }
}

export async function runFinder(env: Env, cfg: Config = devvitConfig): Promise<RunSummary> {
  const now = env.now ?? Date.now;

  const apiKey = (await env.getSetting("mistralApiKey"))?.trim();
  if (!apiKey) throw new Error("Setting mistralApiKey is not set. Run: npx devvit settings set mistralApiKey");
  const token = (await env.getSetting("telegramBotToken"))?.trim();
  const chatId = (await env.getSetting("telegramChatId"))?.trim();

  // One run at a time, so a manual run cannot overlap the schedule and double-send.
  const held = Number(await env.redis.get(LOCK));
  if (held > now()) throw new RunInProgressError();
  await env.redis.set(LOCK, String(now() + LOCK_MS), { expiration: new Date(now() + LOCK_MS) });

  try {
    const llm = createMistral({ apiKey, fetch: env.fetch, retryDelaysMs: env.mistralRetryDelaysMs });
    return await runPipeline(
      {
        fetchPosts: () => fetchPosts(env.reddit, cfg),
        classify: (post) => classifyPost(post, llm),
        draft: (post, c) => draftReply(post, c, cfg, llm),
        store: redisStore(env.redis, now),
        notify: (leads) =>
          token && chatId
            ? sendLeads(leads, now(), { token, chatId, fetch: env.fetch, pauseMs: env.telegramPauseMs })
            : Promise.resolve({ sent: [], error: "Telegram is not set up (settings telegramBotToken and telegramChatId)" }),
        now,
      },
      cfg,
    );
  } finally {
    await env.redis.del(LOCK);
  }
}

export function summaryText(s: RunSummary): string {
  const base = `Checked ${s.fetched} posts: ${s.newCandidates} new matches, ${s.leadsFound} leads, ${s.notified} sent to Telegram.`;
  return s.errors.length ? `${base} Notes: ${s.errors.slice(0, 2).join(" | ")}` : base;
}
