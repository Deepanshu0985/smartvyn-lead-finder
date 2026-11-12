import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

export const COOKIE = "finder_session";

export function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

/** The session cookie holds a hash of the password, never the password itself. */
export function sessionToken(): string | null {
  const password = process.env.DASHBOARD_PASSWORD;
  return password ? digest(`finder-dashboard:${password}`).toString("hex") : null;
}

/** True when the Authorization header carries the shared CRON_SECRET. */
export function cronAuthorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  return safeEqual(header, `Bearer ${secret}`);
}
