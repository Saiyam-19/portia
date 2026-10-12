import { isStepCount } from "ai";

export const MIGRATION_AGENT_MAX_STEPS = 12;
export const MIGRATION_AGENT_MAX_OUTPUT_TOKENS = 4_096;

export const MIGRATION_AGENT_POLICY = {
  stopWhen: isStepCount(MIGRATION_AGENT_MAX_STEPS),
  maxRetries: 0,
  maxOutputTokens: MIGRATION_AGENT_MAX_OUTPUT_TOKENS,
} as const;
