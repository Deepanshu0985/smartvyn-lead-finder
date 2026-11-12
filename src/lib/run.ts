// Wires the real services (Reddit, Mistral, Supabase, Telegram) into the pipeline.

import "server-only";
import { config } from "../config";
import { classifyPost, draftReply, type Llm } from "./classify";
import { chatJSON, chatText, hasMistralKey } from "./mistral";
import { runPipeline, type RunSummary } from "./pipeline";
import { fetchNewPosts } from "./reddit";
import { getStore } from "./store";
import { hasTelegram, sendLeads } from "./telegram";

const g = globalThis as typeof globalThis & { __finderRunning?: boolean };

export async function runFinder(): Promise<RunSummary> {
  if (!hasMistralKey()) throw new Error("MISTRAL_API_KEY is not set");
  // One run at a time per server instance, so overlapping triggers cannot double-send.
  if (g.__finderRunning) throw new Error("A run is already in progress");
  g.__finderRunning = true;
  try {
    const llm: Llm = { json: chatJSON, text: chatText };
    return await runPipeline(
      {
        fetchPosts: () => fetchNewPosts(config.subreddits, config.postsPerSubreddit),
        classify: (post) => classifyPost(post, llm),
        draft: (post, c) => draftReply(post, c, config, llm),
        store: getStore(),
        notify: (leads) =>
          hasTelegram()
            ? sendLeads(leads, Date.now())
            : Promise.resolve({ sent: [], error: "Telegram is not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID); leads are on the dashboard only" }),
        now: Date.now,
      },
      config,
    );
  } finally {
    g.__finderRunning = false;
  }
}
