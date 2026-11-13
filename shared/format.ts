// Turns a lead into a Telegram message. Pure, so it is shared and easy to test.

import type { StoredPost } from "./types";

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
  const draft = p.draft
    ? `\n\n✍️ <b>Draft reply</b> (tap to copy)\n<pre>${escapeHtml(p.draft.slice(0, 2200))}</pre>`
    : "\n\n(No draft this time. Write your own.)";
  return (
    [
      `${icon} <b>${p.score}</b> · ${LABEL[p.type]} · r/${escapeHtml(p.subreddit)} · ${timeAgo(p.postedAt, nowMs)}`,
      `<b>${escapeHtml(p.title.slice(0, 250))}</b>`,
      `Service: ${escapeHtml(p.service)}`,
      `Why: ${escapeHtml(p.reason)}`,
    ].join("\n") + draft
  );
}
