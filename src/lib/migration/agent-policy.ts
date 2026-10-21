import { isStepCount } from "ai";

export const MIGRATION_AGENT_MAX_STEPS = 12;
export const MIGRATION_AGENT_MAX_OUTPUT_TOKENS = 4_096;

// Enforced on provider output before conversation publication buffering.
export const MIGRATION_PROVIDER_FIRST_OUTPUT_MS = 60_000;

export type ModelTransportPolicy = Readonly<{
  maxRecoveryDispatchesPerRun: number;
  firstOutputMs: number;
  progressIdleMs: number;
  cleanEofMs: number;
  attemptMs: number;
  cleanupMs: number;
}>;

/** Separate from SDK retries: an interrupted paid dispatch may have unknown cost.
 * Production does not issue a hidden recovery call. Any future nonzero policy
 * requires an explicit release/billing guard, not just a shorter timeout. */
export const MIGRATION_TRANSPORT_POLICY: ModelTransportPolicy = Object.freeze({
  maxRecoveryDispatchesPerRun: 0,
  firstOutputMs: MIGRATION_PROVIDER_FIRST_OUTPUT_MS,
  progressIdleMs: 15_000,
  cleanEofMs: 15_000,
  attemptMs: 90_000,
  cleanupMs: 1_000,
});

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
