import { cronAuthorized } from "@/lib/auth";
import { runFinder } from "@/lib/run";

export const dynamic = "force-dynamic";
// Reading ~15 subreddits politely plus up to 20 AI calls takes a while.
export const maxDuration = 300;

async function handle(request: Request) {
  if (!process.env.CRON_SECRET) {
    return Response.json({ error: "CRON_SECRET is not set on the server." }, { status: 500 });
  }
  if (!cronAuthorized(request.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return Response.json({ ok: true, summary: await runFinder() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Run failed";
    return Response.json({ ok: false, error: message }, { status: message.includes("already in progress") ? 409 : 500 });
  }
}

// GET so Vercel Cron can call it; POST for the GitHub Actions schedule and curl.
export const GET = handle;
export const POST = handle;
