// The Devvit app uses the same subreddits, keywords and scoring as the Next.js app
// (../../shared/config.ts). Only the per-run caps differ: a scheduled task has to finish
// quickly, so each run is small and runs more often instead.
import { config, type Config } from "../../shared/config";

export const devvitConfig: Config = {
  ...config,
  // Replying to a day-old post is worth little, and a short window keeps the first run's backlog small.
  maxPostAgeHours: 8,
  maxAiCallsPerRun: 8,
  maxLeadsPerRun: 5,
};
