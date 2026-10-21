import { z } from "zod";

export const MEMORY_VALUE_BYTES = 1024;
export const SCRATCHPAD_BYTES = 6000;

const utf8Length = (value: string) => new TextEncoder().encode(value).byteLength;
export const validMemoryValue = (value: string) => value.trim().length > 0 && !value.includes("\0") && utf8Length(value) <= MEMORY_VALUE_BYTES;
export const validScratchpad = (value: string) => (value.length === 0 || value.trim().length > 0) && !value.includes("\0") && utf8Length(value) <= SCRATCHPAD_BYTES;

export const memoryKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,79}$/);
export const memoryValueSchema = z.string().min(1).max(MEMORY_VALUE_BYTES).refine(validMemoryValue, `Memory value must contain text, exclude NUL, and fit ${MEMORY_VALUE_BYTES} UTF-8 bytes.`);
export const scratchpadSchema = z.string().max(SCRATCHPAD_BYTES).refine(validScratchpad, `Working notes must be empty or contain text, exclude NUL, and fit ${SCRATCHPAD_BYTES} UTF-8 bytes.`);
export const supportRetrySchema = z.string().min(1).max(100).optional();
