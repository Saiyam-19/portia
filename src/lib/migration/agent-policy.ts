import { isStepCount } from "ai";

export const MIGRATION_AGENT_MAX_STEPS = 12;
export const MIGRATION_AGENT_MAX_OUTPUT_TOKENS = 4_096;

// Enforced on provider output before conversation publication buffering.
export const MIGRATION_PROVIDER_FIRST_OUTPUT_MS = 60_000;

export const MIGRATION_CHAT_TIMEOUT = {
  totalMs: 240_000,
  stepMs: 180_000,
  // Bound the whole step so useful tool work is not treated as provider silence.
} as const;

export const MIGRATION_AGENT_POLICY = {
  stopWhen: isStepCount(MIGRATION_AGENT_MAX_STEPS),
  maxRetries: 0,
  maxOutputTokens: MIGRATION_AGENT_MAX_OUTPUT_TOKENS,
} as const;
