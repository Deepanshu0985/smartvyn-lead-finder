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
