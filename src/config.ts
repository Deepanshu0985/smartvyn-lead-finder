// Everything you are likely to tune lives here: where to look, what to look for,
// and how picky to be. Edit this file, commit, and the next run uses it.

export const config = {
  /** Subreddits to check on every run (without the "r/"). */
  subreddits: [
    // Hiring boards: people who want to pay for work.
    "forhire",
    "hireaprogrammer",
    "freelance_forhire",
    "jobbit",
    // Where small-business owners and founders ask for help.
    "smallbusiness",
    "Entrepreneur",
    "startups",
    "SaaS",
    "sweatystartup",
    "IndianStartups",
    "StartUpIndia",
    // Where AI and automation questions get asked.
    "automation",
    "n8n",
    "AI_Agents",
    "ChatGPT",
  ],

  /**
   * Hiring boards tag client posts "[Hiring]" and freelancers' ads "[For Hire]".
   * On these boards only [Hiring]/[Task] posts that also match a keyword are kept.
   */
  hiringBoards: ["forhire", "hireaprogrammer", "freelance_forhire", "jobbit"],

  /**
   * Cheap first filter: a post must contain at least one of these (case-insensitive)
   * before any AI is used. Keep them specific to what Smartvyn sells.
   */
  keywords: [
    "chatbot",
    "chat bot",
    "ai agent",
    "automation",
    "automate",
    "n8n",
    "zapier",
    "make.com",
    "workflow",
    "whatsapp bot",
    "lead follow",
    "website",
    "web app",
    "mobile app",
    "mvp",
    "saas",
    "developer",
    "looking for someone to build",
    "need someone to build",
    "need a dev",
    "custom software",
    "integrate ai",
    "openai",
    "llm",
    "crm",
  ],

  /** Posts whose title matches any of these are other freelancers advertising. Always skipped. */
  skipTitlePatterns: [/\[\s*for\s*hire\s*\]/i, /\bfor hire\b/i, /\[\s*hire\s*me\s*\]/i, /\bavailable for (work|hire)\b/i],

  /** Ignore posts older than this. Fresh posts are the whole point. */
  maxPostAgeHours: 24,

  /** How many of the newest posts to read from each subreddit. */
  postsPerSubreddit: 25,

  /** Hard cap on AI classifications per run, so a busy day cannot run up the Mistral bill. */
  maxAiCallsPerRun: 20,

  /** Posts scoring at least this (0-100) get a drafted reply and are sent to you. */
  minScoreToNotify: 60,

  /** At most this many leads are sent to Telegram per run (best first). */
  maxLeadsPerRun: 8,

  /**
   * Where a link to the portfolio is acceptable in a draft.
   * Hiring boards: yes, when the poster is asking for a developer. Everywhere else: never.
   */
  linksAllowedIn: ["forhire", "hireaprogrammer", "freelance_forhire", "jobbit"],

  /** Delete ignored (irrelevant) posts after this many days to keep the table small. */
  pruneIgnoredAfterDays: 30,

  brand: {
    name: "Smartvyn",
    site: "https://smartvyn.vercel.app",
  },
};

export type Config = typeof config;
