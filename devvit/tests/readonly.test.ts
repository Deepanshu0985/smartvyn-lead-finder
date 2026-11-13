// The hard rule of this project: it never writes to Reddit. These tests fail if the Devvit app
// or the shared code ever uses a Reddit write method.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../", import.meta.url).pathname; // devvit/
const REPO = new URL("../../", import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const devvitSources = files(join(ROOT, "src")).map((p) => ({ path: relative(REPO, p), text: readFileSync(p, "utf8") }));
const sharedSources = files(join(REPO, "shared")).map((p) => ({ path: relative(REPO, p), text: readFileSync(p, "utf8") }));
const all = [...devvitSources, ...sharedSources];

// The only Reddit client methods this app is allowed to call.
const ALLOWED = new Set(["getNewPosts", "searchPosts"]);

describe("read-only guarantee (Devvit app)", () => {
  it("scans a meaningful amount of source", () => {
    expect(devvitSources.length).toBeGreaterThanOrEqual(6);
    expect(sharedSources.length).toBeGreaterThanOrEqual(8);
  });

  it("calls only getNewPosts and searchPosts on the Reddit client", () => {
    const used = new Set<string>();
    for (const s of devvitSources) for (const m of s.text.matchAll(/(?<![.\w/])reddit\.(\w+)/g)) used.add(m[1]);
    expect([...used].sort()).toEqual([...ALLOWED].sort());
  });

  it("never mentions a Reddit write method anywhere", () => {
    const write = /\b(submitPost|submitComment|submitCustomPost|submitLink|upvote|downvote|sendPrivateMessage\w*|subscribeToSubreddit|crosspost|setPostFlair|banUser|removePost|createModNote|addRemovalNote)\b/;
    expect(all.filter((s) => write.test(s.text)).map((s) => s.path)).toEqual([]);
  });

  it("only touches Devvit's platform clients from the server entry point", () => {
    const importers = devvitSources.filter((s) => s.text.includes("@devvit/")).map((s) => s.path);
    expect(importers).toEqual(["devvit/src/server/index.ts"]);
  });

  it("does not use the app's Reddit permissions to act as a user", () => {
    const config = readFileSync(join(ROOT, "devvit.json"), "utf8");
    expect(config).not.toMatch(/asUser|SUBMIT_POST|SUBMIT_COMMENT|SUBSCRIBE_TO_SUBREDDIT/);
  });
});
