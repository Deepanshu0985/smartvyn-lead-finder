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

  it("logs when a run starts and finishes, with how long it took and the counts", async () => {
    const lines: string[] = [];
    await handleRequest("POST", "/internal/cron/find-leads", async () => summary, (m) => lines.push(m));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("[cron] run started");
    expect(lines[1]).toMatch(/^\[cron\] run finished in \d+ms: .*"fetched":3/);
  });

  it("logs the reason when a run fails, for both the schedule and the menu", async () => {
    const lines: string[] = [];
    const fail = async () => { throw new Error("Telegram returned 401"); };
    await handleRequest("POST", "/internal/cron/find-leads", fail, (m) => lines.push(m));
    await handleRequest("POST", "/internal/menu/run-now", fail, (m) => lines.push(m));
    expect(lines.filter((l) => l.includes("run failed after") && l.endsWith("Telegram returned 401"))).toHaveLength(2);
  });

  it("logs nothing for requests that do not start a run", async () => {
    const lines: string[] = [];
    await handleRequest("GET", "/internal/cron/find-leads", async () => summary, (m) => lines.push(m));
    await handleRequest("POST", "/nope", async () => summary, (m) => lines.push(m));
    expect(lines).toEqual([]);
  });

  it("ignores a query string", async () => {
    expect((await handleRequest("POST", "/internal/cron/find-leads?x=1", async () => summary)).status).toBe(200);
  });
});
