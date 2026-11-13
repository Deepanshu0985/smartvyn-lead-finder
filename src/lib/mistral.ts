// Mistral for the Next.js app: reads its settings from environment variables.

import "server-only";
import { createMistral } from "@shared/mistral-client";
import type { Llm } from "@shared/types";

export function hasMistralKey(): boolean {
  return Boolean(process.env.MISTRAL_API_KEY);
}

export function mistralFromEnv(): Llm {
  return createMistral({
    apiKey: process.env.MISTRAL_API_KEY ?? "",
    baseUrl: process.env.MISTRAL_API_BASE,
    model: process.env.MISTRAL_CHAT_MODEL,
  });
}
