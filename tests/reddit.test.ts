import { afterEach, describe, expect, it } from "vitest";
import { fetchNewPosts, parseListing } from "../src/lib/reddit";
import { FIXTURE_PATH, fixturePosts } from "./helpers";

describe("parseListing", () => {
  it("parses the fixture into posts with full URLs", () => {
    const posts = fixturePosts();
    expect(posts).toHaveLength(14);
    expect(posts[0]).toMatchObject({
      id: "a1",
      subreddit: "forhire",
      url: "https://www.reddit.com/r/forhire/comments/a1/post/",
      stickied: false,
    });
  });

  it("drops malformed entries and unsafe ids instead of throwing", () => {
    const listing = {
      data: {
        children: [
          { data: { id: "ok1", title: "t", created_utc: 1, permalink: "/r/x/comments/ok1/" } },
          { data: { id: "bad id; drop", title: "t", created_utc: 1, permalink: "/r/x/" } },
          { data: { title: "no id", created_utc: 1, permalink: "/r/x/" } },
          { data: { id: "nodate", title: "t", permalink: "/r/x/" } },
          null,
        ],
      },
    };
    expect(parseListing(listing).map((p) => p.id)).toEqual(["ok1"]);
    expect(parseListing(null)).toEqual([]);
    expect(parseListing({ data: {} })).toEqual([]);
  });
});

describe("fetchNewPosts (fixture mode)", () => {
  afterEach(() => {
    delete process.env.REDDIT_FIXTURE_FILE;
  });

  it("reads the fixture instead of the network and filters by subreddit", async () => {
    process.env.REDDIT_FIXTURE_FILE = FIXTURE_PATH;
    const { posts, errors } = await fetchNewPosts(["forhire", "n8n"], 25);
    expect(errors).toEqual([]);
    expect(new Set(posts.map((p) => p.subreddit))).toEqual(new Set(["forhire", "n8n"]));
    expect(posts).toHaveLength(5);
  });
});
