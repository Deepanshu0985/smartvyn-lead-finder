// Telegram for the Next.js app: reads its settings from environment variables.

import "server-only";
import { sendLeads as send, type SendResult } from "@shared/telegram-client";
import type { StoredPost } from "@shared/types";

export type { SendResult };

export function hasTelegram(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export function sendLeads(leads: StoredPost[], nowMs: number): Promise<SendResult> {
  return send(leads, nowMs, {
    token: process.env.TELEGRAM_BOT_TOKEN ?? "",
    chatId: process.env.TELEGRAM_CHAT_ID ?? "",
    apiBase: process.env.TELEGRAM_API_BASE,
  });
}
