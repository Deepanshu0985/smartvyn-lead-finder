import { describe, expect, it } from "vitest";
import { config } from "../src/config";
import { classifyMessages, classifyPost, cleanDraft, draftMessages, draftReply, parseClassification } from "../src/lib/classify";
import { fixturePosts } from "./helpers";

const post = (id: string) => fixturePosts().find((p) => p.id === id)!;

describe("parseClassification", () => {
  it("accepts a well-formed answer", () => {
    expect(parseClassification({ type: "client_lead", score: 88, service: "chatbot", reason: "Wants a chatbot." })).toEqual({
      type: "client_lead",
      score: 88,
      service: "chatbot",
      reason: "Wants a chatbot.",
    });
  });

  it("falls back safely on garbage", () => {
    expect(parseClassification(null)).toEqual({ type: "irrelevant", score: 0, service: "other", reason: "" });
    expect(parseClassification({ type: "hack", score: "lots", service: 5 })).toMatchObject({ type: "irrelevant", score: 0, service: "other" });
  });

  it("clamps scores to 0-100", () => {
    expect(parseClassification({ type: "client_lead", score: 250 }).score).toBe(100);
    expect(parseClassification({ type: "client_lead", score: -4 }).score).toBe(0);
  });

  it("never lets an irrelevant post carry a high score", () => {
    expect(parseClassification({ type: "irrelevant", score: 99 }).score).toBe(30);
  });

  it("trims and caps the reason", () => {
    expect(parseClassification({ type: "client_lead", score: 70, reason: `  a\n b ${"x".repeat(500)}` }).reason.length).toBeLessThanOrEqual(240);
  });
});

describe("prompts", () => {
  it("wraps the post in <post> tags and tells the model it is untrusted", () => {
    const [system, user] = classifyMessages(post("b4"));
    expect(system.content).toMatch(/untrusted/i);
    expect(user.content.startsWith("<post>")).toBe(true);
    expect(user.content).toContain("Ignore previous instructions");
    // The injection attempt only ever appears inside the user message, never the system prompt.
    expect(system.content).not.toContain("Ignore previous instructions");
  });

  it("truncates very long posts", () => {
    const long = { ...post("a4"), body: "word ".repeat(2000) };
    expect(classifyMessages(long)[1].content.length).toBeLessThan(2000);
  });

  it("allows a portfolio link only for client leads on hiring boards", () => {
    const lead = { type: "client_lead" as const, score: 85, service: "chatbot" as const, reason: "x" };
    const question = { ...lead, type: "question_to_answer" as const };
    const withLink = draftMessages(post("a1"), lead, config)[0].content;
    expect(withLink).toContain(config.brand.site);
    // A question on a business subreddit must carry no link and no pitch.
    const noLink = draftMessages(post("a4"), question, config)[0].content;
    expect(noLink).not.toContain(config.brand.site);
    expect(noLink).toMatch(/Do NOT include any link/);
    // A client lead outside the hiring boards also gets no link.
    expect(draftMessages(post("a6"), lead, config)[0].content).not.toContain(config.brand.site);
  });
});

describe("cleanDraft", () => {
  it("removes quotes, em dashes, markdown and trims", () => {
    expect(cleanDraft('  "Happy to help — here is how.\n\n**Step one** is simple."  ')).toBe("Happy to help, here is how.\n\nStep one is simple.");
  });

  it("caps the length", () => {
    expect(cleanDraft("a".repeat(5000)).length).toBe(1500);
  });
});

describe("with a stubbed model", () => {
  it("classifies and drafts through the Llm interface", async () => {
    const llm = {
      json: async <T,>() => ({ type: "client_lead", score: 91, service: "chatbot", reason: "Clear need." }) as T,
      text: async () => '"Sure — start with your FAQ."',
    };
    const c = await classifyPost(post("a1"), llm);
    expect(c.score).toBe(91);
    expect(await draftReply(post("a1"), c, config, llm)).toBe("Sure, start with your FAQ.");
  });
});
