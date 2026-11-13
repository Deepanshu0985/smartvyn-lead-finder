export type RedditPost = {
  /** Reddit's short id, e.g. "1abc2de". */
  id: string;
  subreddit: string;
  title: string;
  body: string;
  author: string;
  /** Full link to the post, ready to open in a browser. */
  url: string;
  /** Unix seconds. */
  createdUtc: number;
  flair: string;
  stickied: boolean;
  over18: boolean;
};

export type PostType = "client_lead" | "question_to_answer" | "irrelevant";

export const SERVICES = [
  "chatbot",
  "automation",
  "website",
  "web app",
  "mobile app",
  "ai integration",
  "other",
] as const;
export type Service = (typeof SERVICES)[number];

export type Classification = {
  type: PostType;
  /** 0-100: how good a use of the owner's time this post is. */
  score: number;
  service: Service;
  reason: string;
};

/** new = waiting for you, replied/skipped = you decided, ignored = AI says not relevant. */
export type Status = "new" | "replied" | "skipped" | "ignored";

export type StoredPost = {
  id: string;
  subreddit: string;
  title: string;
  url: string;
  author: string;
  body: string;
  /** ISO time the post was created on Reddit. */
  postedAt: string;
  type: PostType;
  score: number;
  service: Service;
  reason: string;
  draft: string;
  status: Status;
  notified: boolean;
};

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** The two things the finder needs from a language model. */
export type Llm = {
  /** Asks for a JSON object and parses it. */
  json: <T>(messages: ChatMessage[]) => Promise<T>;
  /** Plain-text completion, used for the drafted replies. */
  text: (messages: ChatMessage[]) => Promise<string>;
};

/** Where seen posts and leads are kept (memory, Supabase or Redis). */
export type Store = {
  /** Which of these post ids we have already processed. */
  seenIds(ids: string[]): Promise<Set<string>>;
  saveMany(posts: StoredPost[]): Promise<void>;
  markNotified(ids: string[]): Promise<void>;
  /** Leads that scored well enough to send but have not been sent yet (e.g. Telegram was down). */
  unnotified(minScore: number, limit: number): Promise<StoredPost[]>;
  list(status: Status, limit: number): Promise<StoredPost[]>;
  setStatus(id: string, status: Status): Promise<void>;
  /** Deletes ignored posts that were posted before this time (unix ms). */
  prune(cutoffMs: number): Promise<void>;
};
