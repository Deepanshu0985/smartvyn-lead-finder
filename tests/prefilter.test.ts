import { describe, expect, it } from "vitest";
import { config } from "../shared/config";
import { prefilter } from "../shared/prefilter";
import { fixturePosts, NOW_MS } from "./helpers";

describe("prefilter", () => {
  const kept = prefilter(fixturePosts(), config, NOW_MS);
  const ids = kept.map((c) => c.post.id);

  it("keeps fresh posts that match a keyword", () => {
    expect(new Set(ids)).toEqual(new Set(["a1", "a4", "a6", "a7", "a8", "a9", "b2", "b4"]));
  });

  it("drops other freelancers' [For Hire] posts", () => {
    expect(ids).not.toContain("a2");
  });

  it("drops posts with no keyword", () => {
    expect(ids).not.toContain("a3");
    expect(ids).not.toContain("a5");
  });

  it("drops posts older than the age limit", () => {
    expect(ids).not.toContain("b1");
  });

  it("drops stickied and NSFW posts", () => {
    expect(ids).not.toContain("b3");
    expect(ids).not.toContain("b5");
  });

  it("on hiring boards, needs a [Hiring]/[Task] tag even when a keyword matches", () => {
    const untagged = { ...fixturePosts().find((p) => p.id === "a1")!, id: "x1", title: "Chatbot developer needed" };
    expect(prefilter([untagged], config, NOW_MS)).toHaveLength(0);
    const tagged = { ...untagged, title: "[Task] Chatbot developer needed" };
    expect(prefilter([tagged], config, NOW_MS)).toHaveLength(1);
  });

  it("accepts a hiring flair instead of a title tag", () => {
    const flaired = { ...fixturePosts().find((p) => p.id === "a1")!, id: "x2", title: "Chatbot developer needed", flair: "Hiring" };
    expect(prefilter([flaired], config, NOW_MS)).toHaveLength(1);
  });

  it("puts the best keyword matches first, newest first on ties", () => {
    const hits = kept.map((c) => c.keywordHits);
    expect([...hits].sort((a, b) => b - a)).toEqual(hits);
  });

  it("skips removed and deleted posts", () => {
    const removed = { ...fixturePosts().find((p) => p.id === "a4")!, id: "x3", body: "[removed]" };
    expect(prefilter([removed], config, NOW_MS)).toHaveLength(0);
  });
});
