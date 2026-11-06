import { expect, it } from 'vitest';
import { buildTurnInput, INSTRUCTIONS } from '../../src/lib/agent/prompt';
import { chatRequestSchema } from '../../src/lib/chat/contracts';

const file = { id: 'artifact123', name: 'Contract.pdf', mimeType: 'application/pdf', size: 100, revision: 1 };

it('accepts an attachment-only turn and rejects an empty turn', () => {
  const base = { conversationId: 'conversation1', requestId: crypto.randomUUID(), modelAlias: 'model-1' };
  expect(chatRequestSchema.safeParse({ ...base, attachmentIds: [file.id] }).success).toBe(true);
  expect(chatRequestSchema.safeParse(base).success).toBe(false);
});

it('appends file references without inserting content or changing system instructions', () => {
  const before = INSTRUCTIONS;
  const input = buildTurnInput({ today: '2026-11-04', memory: null, message: 'Read the contract', formReply: null, files: { files: [file], removed: ['oldfile'] } });
  expect(input).toContain('/files/artifact123.md');
  expect(input).toContain('Contract.pdf');
  expect(input).toContain('/files/oldfile.md');
  expect(INSTRUCTIONS).toBe(before);
  expect(input.endsWith('Read the contract')).toBe(true);
});
