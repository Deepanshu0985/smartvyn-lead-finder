import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { escapeHtml, formatLead, sendLeads, timeAgo } from "../src/lib/telegram";
import type { StoredPost } from "../src/lib/types";
import { NOW_MS } from "./helpers";

const lead = (over: Partial<StoredPost> = {}): StoredPost => ({
  id: "a1", subreddit: "forhire", title: "[Hiring] Chatbot <dev> & more", url: "https://www.reddit.com/r/forhire/comments/a1/post/",
  author: "u", body: "", postedAt: new Date(NOW_MS - 25 * 60_000).toISOString(), type: "client_lead", score: 92,
  service: "chatbot", reason: "Wants a <b>chatbot</b>", draft: "Hi <there> & welcome", status: "new", notified: false, ...over,
});

describe("formatting", () => {
  it("escapes HTML in every user-controlled field", () => {
    const text = formatLead(lead(), NOW_MS);
    expect(text).toContain("Chatbot &lt;dev&gt; &amp; more");
    expect(text).toContain("Wants a &lt;b&gt;chatbot&lt;/b&gt;");
    expect(text).toContain("Hi &lt;there&gt; &amp; welcome");
    expect(text).not.toMatch(/<dev>|<there>/);
  });

  it("shows score, type, subreddit and age", () => {
    expect(formatLead(lead(), NOW_MS)).toContain("<b>92</b> · Client lead · r/forhire · 25m ago");
  });

  it("stays under Telegram's 4096 character limit even with maximum-length fields", () => {
    const text = formatLead(lead({ title: "T".repeat(1000), reason: "R".repeat(240), draft: "D".repeat(1500) }), NOW_MS);
    expect(text.length).toBeLessThan(4096);
  });

  it("says so when there is no draft", () => {
    expect(formatLead(lead({ draft: "" }), NOW_MS)).toContain("No draft this time");
  });

  it("formats ages", () => {
    const at = (mins: number) => new Date(NOW_MS - mins * 60_000).toISOString();
    expect(timeAgo(at(5), NOW_MS)).toBe("5m ago");
    expect(timeAgo(at(180), NOW_MS)).toBe("3h ago");
    expect(timeAgo(at(60 * 72), NOW_MS)).toBe("3d ago");
  });

  it("escapeHtml handles the three special characters", () => {
    expect(escapeHtml("<&>")).toBe("&lt;&amp;&gt;");
  });
});

describe("sendLeads", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "123:SECRET";
    process.env.TELEGRAM_CHAT_ID = "42";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts one message per lead with an Open post button", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendLeads([lead({ id: "a1" }), lead({ id: "a2" })], NOW_MS);
    expect(result).toEqual({ sent: ["a1", "a2"] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/bot123:SECRET/sendMessage");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ chat_id: "42", parse_mode: "HTML", disable_web_page_preview: true });
    expect(body.reply_markup.inline_keyboard[0][0].url).toBe("https://www.reddit.com/r/forhire/comments/a1/post/");
  });

  it("stops at the first failure and never leaks the token in the error", async () => {
    let n = 0;
    vi.stubGlobal("fetch", async () => new Response("bot123:SECRET is invalid", { status: ++n === 1 ? 200 : 401 }));
    const result = await sendLeads([lead({ id: "a1" }), lead({ id: "a2" }), lead({ id: "a3" })], NOW_MS);
    expect(result.sent).toEqual(["a1"]);
    expect(result.error).toBe("Telegram returned 401");
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  it("reports network errors", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    expect(await sendLeads([lead()], NOW_MS)).toEqual({ sent: [], error: "Telegram request failed: offline" });
  });
});
