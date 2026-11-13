import { describe, expect, it } from "vitest";
import { config } from "../shared/config";
import { prefilter } from "../shared/prefilter";
import { fixturePosts, NOW_MS } from "./helpers";

describe("prefilter", () => {
  const kept = prefilter(fixturePosts(), config, NOW_MS);
  const ids = kept.map((c) => c.post.id);

  it("keeps fresh posts that match a keyword", () => {
    expect(new Set(ids)).toEqual(new Set(["a1", "a4", "a6", "a7", "a8", "a9", "b2"]));
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

  it("puts [Hiring] posts and clear requests first, newest first on ties", () => {
    const priorities = kept.map((c) => c.priority);
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities);
    expect(["a1", "a9"]).toContain(ids[0]); // the [Hiring] posts lead
  });

  it("drops a post that only mentions a topic without asking for anything", () => {
    const musing = { ...fixturePosts().find((p) => p.id === "a4")!, id: "x4", title: "We launched our new website today", body: "Sharing our launch story." };
    expect(prefilter([musing], config, NOW_MS)).toHaveLength(0);
    // ...but a question about the same topic stays.
    expect(prefilter([{ ...musing, title: "Is our new website any good?" }], config, NOW_MS)).toHaveLength(1);
  });

  it("keeps a post whose body says what the poster wants", () => {
    const wants = { ...fixturePosts().find((p) => p.id === "a4")!, id: "x5", title: "Website for my gym", body: "I am looking for someone to build it." };
    expect(prefilter([wants], config, NOW_MS)).toHaveLength(1);
  });

  it("skips removed and deleted posts", () => {
    const removed = { ...fixturePosts().find((p) => p.id === "a4")!, id: "x3", body: "[removed]" };
    expect(prefilter([removed], config, NOW_MS)).toHaveLength(0);
  });
});
