// Everything you are likely to tune lives here: where to look, what to look for,
// and how picky to be. Edit this file, commit, and the next run uses it.

export const config = {
  /** Subreddits to check on every run (without the "r/"). */
  subreddits: [
    // Hiring boards: people who want to pay for work.
    "forhire",
    "hireaprogrammer",
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
  hiringBoards: ["forhire", "hireaprogrammer", "jobbit"],

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

  /**
   * Reddit-wide searches (used by the Devvit app, which can search all of Reddit rather than
   * only the subreddits above). Each is run newest-first over the last day.
   */
  searchQueries: [
    '"need a chatbot" OR "chatbot for my" OR "build a chatbot"',
    '"looking for a developer" OR "need a developer" OR "hire a developer"',
    '"automate my" OR "automate our" OR "automation for my"',
    '"need a website" OR "build me a website" OR "need an app built"',
    '"build an MVP" OR "need an MVP" OR "AI agent for my"',
  ],

  /**
   * Signs that the poster WANTS something (help, a developer, advice), as opposed to just
   * mentioning a topic. A post outside the hiring boards must contain a topic keyword AND one of
   * these (or a "?" in the title) before any AI is used on it.
   */
  intentSignals: [
    "looking for",
    "looking to hire",
    "need a ",
    "need an ",
    "need someone",
    "need help",
    "help",
    "any idea",
    "need to ",
    "hire",
    "hiring",
    "recommend",
    "how do i",
    "how can i",
    "how to",
    "anyone",
    "can someone",
    "can anyone",
    "who can",
    "any tool",
    "any way",
    "want to build",
    "want to automate",
    "help me",
    "help with",
    "advice",
    "suggestions",
    "struggling",
    "budget",
    "freelancer",
    "quote",
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
  linksAllowedIn: ["forhire", "hireaprogrammer", "jobbit"],

  /** Delete ignored (irrelevant) posts after this many days to keep the table small. */
  pruneIgnoredAfterDays: 30,

  brand: {
    name: "Smartvyn",
    site: "https://smartvyn.vercel.app",
  },
};

export type Config = typeof config;
