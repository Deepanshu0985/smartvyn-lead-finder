import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/routes";
import { RunInProgressError } from "../src/run";

const summary = { fetched: 3, candidates: 2, newCandidates: 2, classified: 2, leadsFound: 1, notified: 1, skippedByCap: 0, errors: [] };

describe("handleRequest", () => {
  it("runs the finder for the scheduled task and returns the summary", async () => {
    const r = await handleRequest("POST", "/internal/cron/find-leads", async () => summary);
    expect(r).toEqual({ status: 200, body: { status: "ok", summary } });
  });

  it("answers the menu item with a toast for the moderator who clicked it", async () => {
    const r = await handleRequest("POST", "/internal/menu/run-now", async () => summary);
    expect(r.status).toBe(200);
    expect(r.body.showToast).toEqual({ text: "Checked 3 posts: 2 new matches, 1 leads, 1 sent to Telegram.", appearance: "success" });
  });

  it("shows a menu error as a toast instead of failing silently", async () => {
    const r = await handleRequest("POST", "/internal/menu/run-now", async () => {
      throw new Error("Setting mistralApiKey is not set");
    });
    expect(r).toEqual({ status: 200, body: { showToast: "Setting mistralApiKey is not set" } });
  });

  it("returns 500 for a failed scheduled run, 409 if one is already running", async () => {
    expect((await handleRequest("POST", "/internal/cron/find-leads", async () => { throw new Error("boom"); })).status).toBe(500);
    expect((await handleRequest("POST", "/internal/cron/find-leads", async () => { throw new RunInProgressError(); })).status).toBe(409);
  });

  it("rejects other methods and unknown paths without running anything", async () => {
    let ran = false;
    const run = async () => { ran = true; return summary; };
    expect((await handleRequest("GET", "/internal/cron/find-leads", run)).status).toBe(405);
    expect((await handleRequest("POST", "/internal/nope", run)).status).toBe(404);
    expect((await handleRequest("POST", undefined, run)).status).toBe(404);
    expect(ran).toBe(false);
  });

  it("ignores a query string", async () => {
    expect((await handleRequest("POST", "/internal/cron/find-leads?x=1", async () => summary)).status).toBe(200);
  });
});
