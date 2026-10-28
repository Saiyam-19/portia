import { isStepCount } from "ai";

export const MIGRATION_AGENT_MAX_STEPS = 12;
export const MIGRATION_AGENT_MAX_OUTPUT_TOKENS = 8_192;

export const MIGRATION_CHAT_TIMEOUT = {
  totalMs: 240_000,
  stepMs: 180_000,
  firstChunkMs: 60_000,
} as const;

export const MIGRATION_AGENT_POLICY = {
  stopWhen: isStepCount(MIGRATION_AGENT_MAX_STEPS),
  maxRetries: 0,
  maxOutputTokens: MIGRATION_AGENT_MAX_OUTPUT_TOKENS,
  timeout: MIGRATION_CHAT_TIMEOUT,
} as const;
