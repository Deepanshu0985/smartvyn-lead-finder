"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { COOKIE, safeEqual, sessionToken } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { runFinder } from "@/lib/run";
import { getStore } from "@/lib/store";
import type { Status } from "@shared/types";

async function signedIn(): Promise<boolean> {
  // Server actions are public endpoints, so every one re-checks the session.
  const session = (await cookies()).get(COOKIE)?.value;
  const token = sessionToken();
  return Boolean(session && token && session === token);
}

export async function login(_prev: string | null, formData: FormData): Promise<string | null> {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return "Set DASHBOARD_PASSWORD in your environment to enable the dashboard.";

  const ip = clientIp(new Request("http://local", { headers: await headers() }));
  if (!rateLimit(`login:${ip}`, 10, 15 * 60_000)) return "Too many attempts. Try again later.";

  if (!safeEqual(String(formData.get("password") ?? ""), password)) return "Wrong password.";

  (await cookies()).set(COOKIE, sessionToken()!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/dashboard",
    maxAge: 60 * 60 * 12,
  });
  redirect("/dashboard");
}

export async function logout() {
  (await cookies()).delete({ name: COOKIE, path: "/dashboard" });
  redirect("/dashboard");
}

const SETTABLE: Status[] = ["new", "replied", "skipped"];

export async function setStatus(formData: FormData) {
  if (!(await signedIn())) return;
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as Status;
  if (!SETTABLE.includes(status)) return;
  await getStore().setStatus(id, status);
  revalidatePath("/dashboard");
}

/** Runs the finder right now, so you can try it without waiting for the schedule. */
export async function runNow(): Promise<string> {
  if (!(await signedIn())) return "Please sign in again.";
  try {
    const s = await runFinder();
    revalidatePath("/dashboard");
    const issues = s.errors.length ? ` Notes: ${s.errors.slice(0, 3).join(" | ")}` : "";
    return `Fetched ${s.fetched} posts, ${s.newCandidates} new matches, ${s.classified} checked, ${s.leadsFound} leads, ${s.notified} sent to Telegram.${issues}`;
  } catch (err) {
    return `Run failed: ${err instanceof Error ? err.message : "unknown error"}`;
  }
}
