// The hard rule of this project: it never writes to Reddit. These tests fail the build if a
// Reddit write endpoint ever shows up in the source.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../", import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

// The Next.js app and the code it shares with the Devvit app.
const sources = [...files(join(ROOT, "src")), ...files(join(ROOT, "shared"))].map((path) => ({
  path: relative(ROOT, path),
  text: readFileSync(path, "utf8"),
}));

describe("read-only guarantee", () => {
  it("scans a meaningful amount of source", () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  it("never references a Reddit write endpoint", () => {
    const forbidden = /\/api\/(comment|submit|vote|compose|del|editusertext|friend|subscribe|report|hide|save|unsave|sendreplies|set_contest_mode|lock|approve|remove)\b/i;
    const hits = sources.filter((s) => forbidden.test(s.text)).map((s) => s.path);
    expect(hits).toEqual([]);
  });

  it("only talks to Reddit from src/lib/reddit.ts", () => {
    const hits = sources.filter((s) => /reddit\.com\/api|oauth\.reddit\.com/.test(s.text)).map((s) => s.path);
    expect(hits).toEqual(["src/lib/reddit.ts"]);
  });

  it("makes exactly one Reddit POST: the app-only token request", () => {
    const reddit = sources.find((s) => s.path === "src/lib/reddit.ts")!.text;
    expect(reddit.match(/method:\s*"POST"/g)).toHaveLength(1);
    expect(reddit).toMatch(/api\/v1\/access_token[\s\S]{0,200}method:\s*"POST"/);
    expect(reddit).toContain("grant_type=client_credentials");
    // Every other Reddit request is a GET.
    expect(reddit).toMatch(/method:\s*"GET"/);
    expect(reddit).not.toMatch(/method:\s*"(PUT|PATCH|DELETE)"/);
  });

  it("does not request user-level OAuth scopes or grants", () => {
    const hits = sources.filter((s) => /grant_type=(password|authorization_code|refresh_token)|scope=[^"]*(submit|edit|vote|privatemessages|identity)/i.test(s.text)).map((s) => s.path);
    expect(hits).toEqual([]);
  });
});
