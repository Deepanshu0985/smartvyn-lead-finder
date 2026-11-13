// Maps Devvit's internal endpoints to actions. Kept free of platform imports so it is testable.
// Devvit POSTs JSON to these paths and expects a JSON body back.

import type { RunSummary } from "../../shared/pipeline";
import { RunInProgressError, summaryText } from "./run";

export type Response = { status: number; body: Record<string, unknown> };

/** Runs the finder and writes what happened to the app log (`devvit logs` / playtest), including how long it took. */
async function loggedRun(label: string, run: () => Promise<RunSummary>, log: (message: string) => void): Promise<RunSummary> {
  const started = Date.now();
  log(`[${label}] run started`);
  try {
    const summary = await run();
    log(`[${label}] run finished in ${Date.now() - started}ms: ${JSON.stringify(summary)}`);
    return summary;
  } catch (err) {
    log(`[${label}] run failed after ${Date.now() - started}ms: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

export async function handleRequest(
  method: string | undefined,
  path: string | undefined,
  run: () => Promise<RunSummary>,
  log: (message: string) => void = console.log,
): Promise<Response> {
  if (method !== "POST") return { status: 405, body: { error: "Method not allowed" } };
  const route = (path ?? "").split("?")[0];

  if (route === "/internal/cron/find-leads") {
    try {
      return { status: 200, body: { status: "ok", summary: await loggedRun("cron", run, log) } };
    } catch (err) {
      return {
        status: err instanceof RunInProgressError ? 409 : 500,
        body: { error: err instanceof Error ? err.message : "Run failed" },
      };
    }
  }

  if (route === "/internal/menu/run-now") {
    // Menu handlers answer with a toast shown to whoever clicked the menu item.
    try {
      return { status: 200, body: { showToast: { text: summaryText(await loggedRun("menu", run, log)), appearance: "success" } } };
    } catch (err) {
      return { status: 200, body: { showToast: err instanceof Error ? err.message : "Run failed" } };
    }
  }

  return { status: 404, body: { error: "Not found" } };
}
