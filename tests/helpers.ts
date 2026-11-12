import { readFileSync } from "node:fs";
import { parseListing } from "../src/lib/reddit";
import type { RedditPost } from "../src/lib/types";

/** The fixed "now" the fixture was written against (unix seconds). */
export const REFERENCE = 1791000000;
export const NOW_MS = REFERENCE * 1000;

export const FIXTURE_PATH = new URL("../fixtures/reddit-sample.json", import.meta.url).pathname;

export function fixturePosts(): RedditPost[] {
  return parseListing(JSON.parse(readFileSync(FIXTURE_PATH, "utf8")));
}
