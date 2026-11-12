// Sends leads to your phone via a Telegram bot (create one with @BotFather, free).

import "server-only";
import type { StoredPost } from "./types";

const API_BASE = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";

export function hasTelegram(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function timeAgo(iso: string, nowMs: number): string {
  const mins = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

const LABEL: Record<StoredPost["type"], string> = {
  client_lead: "Client lead",
  question_to_answer: "Question to answer",
  irrelevant: "Other",
};

/** One Telegram message per lead. Telegram caps messages at 4096 characters. */
export function formatLead(p: StoredPost, nowMs: number): string {
  const icon = p.type === "client_lead" ? "🔥" : "💬";
  const draft = p.draft ? `\n\n✍️ <b>Draft reply</b> (tap to copy)\n<pre>${escapeHtml(p.draft.slice(0, 2200))}</pre>` : "\n\n(No draft this time. Write your own.)";
  return [
    `${icon} <b>${p.score}</b> · ${LABEL[p.type]} · r/${escapeHtml(p.subreddit)} · ${timeAgo(p.postedAt, nowMs)}`,
    `<b>${escapeHtml(p.title.slice(0, 250))}</b>`,
    `Service: ${escapeHtml(p.service)}`,
    `Why: ${escapeHtml(p.reason)}`,
  ].join("\n") + draft;
}

export type SendResult = { sent: string[]; error?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sends leads in order and stops at the first failure so unsent ones are retried next run. */
export async function sendLeads(leads: StoredPost[], nowMs: number): Promise<SendResult> {
  const sent: string[] = [];
  for (const lead of leads) {
    const res = await fetch(`${API_BASE}/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
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
    await sleep(400);
  }
  return { sent };
}
