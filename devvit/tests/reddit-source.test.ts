import { describe, expect, it } from "vitest";
import { devvitConfig } from "../src/config";
import { fetchPosts, toRedditPost, type PostLike } from "../src/reddit-source";
import { fakeReddit, fixturePostLikes } from "./helpers";

const base: PostLike = {
  id: "t3_abc123", subredditName: "forhire", title: "[Hiring] bot", body: "text", authorName: "u",
  permalink: "/r/forhire/comments/abc123/hiring_bot/", createdAt: new Date(1_791_000_000_000),
  stickied: false, nsfw: false, removed: false, flair: { text: "Hiring" },
};

describe("toRedditPost", () => {
  it("strips the t3_ prefix, builds the full URL and keeps the flair", () => {
    expect(toRedditPost(base)).toEqual({
      id: "abc123", subreddit: "forhire", title: "[Hiring] bot", body: "text", author: "u",
      url: "https://www.reddit.com/r/forhire/comments/abc123/hiring_bot/", createdUtc: 1_791_000_000,
      flair: "Hiring", stickied: false, over18: false,
    });
  });

  it("keeps absolute permalinks as they are", () => {
    expect(toRedditPost({ ...base, permalink: "https://www.reddit.com/r/x/comments/abc123/" })?.url).toBe("https://www.reddit.com/r/x/comments/abc123/");
  });

  it("marks removed posts so the pre-filter drops them", () => {
    expect(toRedditPost({ ...base, removed: true })?.body).toBe("[removed]");
  });

  it("drops anything malformed instead of throwing", () => {
    expect(toRedditPost({ ...base, id: "t3_bad id!" })).toBeNull();
    expect(toRedditPost({ ...base, title: "" })).toBeNull();
    expect(toRedditPost({ ...base, permalink: "" })).toBeNull();
    expect(toRedditPost({ ...base, createdAt: new Date("nope") })).toBeNull();
  });
});

describe("fetchPosts", () => {
  it("reads every configured subreddit and every search, newest first over the last day", async () => {
    const { reddit, calls } = fakeReddit();
    await fetchPosts(reddit, devvitConfig);
    const subs = calls.filter((c) => c.method === "getNewPosts");
    const searches = calls.filter((c) => c.method === "searchPosts");
    expect(subs.map((c) => c.options.subredditName)).toEqual(devvitConfig.subreddits);
    expect(searches).toHaveLength(devvitConfig.searchQueries.length);
    for (const s of searches) expect(s.options).toMatchObject({ sort: "new", timeframe: "day", limit: 25 });
    // Search is Reddit-wide: it never restricts to one subreddit.
    for (const s of searches) expect(s.options).not.toHaveProperty("subredditName");
  });

  it("returns the fixture posts without duplicates", async () => {
    const { reddit } = fakeReddit();
    const { posts, errors } = await fetchPosts(reddit, devvitConfig);
    expect(errors).toEqual([]);
    expect(new Set(posts.map((p) => p.id)).size).toBe(posts.length);
    expect(posts.map((p) => p.id)).toContain("a1");
  });

  it("keeps one copy of a post that appears in both a listing and a search", async () => {
    const all = fixturePostLikes();
    const reddit = {
      getNewPosts: () => ({ get: async () => [all[0]] }),
      searchPosts: () => ({ get: async () => [all[0]] }),
    };
    const { posts } = await fetchPosts(reddit, { subreddits: ["forhire"], searchQueries: ["x"], postsPerSubreddit: 25 });
    expect(posts).toHaveLength(1);
  });

  it("reports a failing source and carries on with the rest", async () => {
    const { reddit } = fakeReddit(undefined, { failOn: "forhire" });
    const { posts, errors } = await fetchPosts(reddit, devvitConfig);
    expect(errors).toEqual(["r/forhire: 403 Forbidden"]);
    expect(posts.some((p) => p.subreddit === "n8n")).toBe(true);
  });
});
