// Sends leads to your phone via a Telegram bot (create one with @BotFather, free).
// Takes its settings as arguments so it works both in Next.js (env vars) and Devvit (app settings).

import { formatLead } from "./format";
import type { StoredPost } from "./types";

export type TelegramOptions = {
  token: string;
  chatId: string;
  apiBase?: string;
  fetch?: typeof fetch;
  /** Pause between messages (Telegram allows about one per second per chat). */
  pauseMs?: number;
};

export type SendResult = { sent: string[]; error?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sends leads in order and stops at the first failure so unsent ones are retried next run. */
export async function sendLeads(leads: StoredPost[], nowMs: number, opts: TelegramOptions): Promise<SendResult> {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const base = opts.apiBase ?? "https://api.telegram.org";
  const sent: string[] = [];
  for (const lead of leads) {
    const res = await doFetch(`${base}/bot${opts.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: opts.chatId,
        text: formatLead(lead, nowMs),
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: [[{ text: "Open post on Reddit", url: lead.url }]] },
      }),
    }).catch((err: unknown) => err as Error);

    if (res instanceof Error) return { sent, error: `Telegram request failed: ${res.message}` };
    if (!res.ok) {
      // Never echo the response body: it can contain the bot token in some error shapes.
      return { sent, error: `Telegram returned ${res.status}` };
    }
    sent.push(lead.id);
    await sleep(opts.pauseMs ?? 400);
  }
  return { sent };
}
