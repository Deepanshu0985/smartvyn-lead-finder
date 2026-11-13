// The Devvit app uses the same subreddits, keywords and scoring as the Next.js app
// (../../shared/config.ts). Only the per-run caps differ: a scheduled task has to finish
// quickly, so each run is small and runs more often instead.
import { config, type Config } from "../../shared/config";

export const devvitConfig: Config = {
  ...config,
  maxAiCallsPerRun: 6,
  maxLeadsPerRun: 5,
};
