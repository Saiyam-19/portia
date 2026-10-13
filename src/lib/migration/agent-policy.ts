import { isStepCount } from "ai";

export const MIGRATION_AGENT_MAX_STEPS = 12;
export const MIGRATION_AGENT_MAX_OUTPUT_TOKENS = 4_096;

export const MIGRATION_CHAT_TIMEOUT = {
  totalMs: 240_000,
  stepMs: 180_000,
  firstChunkMs: 60_000,
  // The SDK's chunk timer also runs while nested tools execute. A healthy
  // specialist can use up to 120s; bound the whole step instead of its silence.
} as const;

export const MIGRATION_AGENT_POLICY = {
  stopWhen: isStepCount(MIGRATION_AGENT_MAX_STEPS),
  maxRetries: 0,
  maxOutputTokens: MIGRATION_AGENT_MAX_OUTPUT_TOKENS,
} as const;
