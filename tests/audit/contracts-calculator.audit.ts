import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrationChatRequestSchema } from '../../src/lib/migration/contracts';
import { calculateExactExpression } from '../../src/lib/portia/exact-expression';
import { checkedFacts } from '../../src/lib/memory/format';

afterEach(() => vi.unstubAllGlobals());
const question = { kind: 'question', requestId: '12345678-1234-4234-9234-123456789012', modelAlias: 'model-1', conversationId: null, expectedRevision: null, question: 'Estimate' };

describe('hostile request boundaries', () => {
  it.each([
    ['empty', { question: '' }], ['whitespace', { question: ' \n\t ' }],
    ['oversized', { question: 'x'.repeat(4001) }], ['forged history', { messages: [] }],
    ['forged owner', { ownerId: 'victim' }], ['unknown model', { modelAlias: 'private-model-id' }],
    ['negative revision', { expectedRevision: -1 }], ['fractional revision', { expectedRevision: 1.2 }],
    ['bad request id', { requestId: 'repeat' }], ['empty conversation', { conversationId: '' }],
    ['oversized conversation', { conversationId: 'x'.repeat(201) }], ['null question', { question: null }],
  ])('rejects %s', (_name, patch) => expect(migrationChatRequestSchema.safeParse({ ...question, ...patch }).success).toBe(false));
  it('accepts 4000 characters and trims boundary whitespace', () => {
    expect(migrationChatRequestSchema.parse({ ...question, question: ' '+ 'x'.repeat(4000)+' ' })).toHaveProperty('question', 'x'.repeat(4000));
  });
});

describe('independent arithmetic and data invariants', () => {
  it('matches integer half-up arithmetic for 1000 deterministic positive/negative charge fixtures', () => {
    let seed = 20261014;
    for (let i = 0; i < 1000; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const cents = seed % 10000000 + 1;
      const rate = (seed >>> 10) % 300 + 1;
      const sign = i % 2 ? '-' : '';
      const roundedCents = (BigInt(cents) * BigInt(rate) + BigInt(50)) / BigInt(100);
      const exact = sign + String(roundedCents / BigInt(100)) + '.' + String(roundedCents % BigInt(100)).padStart(2, '0');
      expect(Number(calculateExactExpression(`round(${sign}${cents}/100*${rate}/100,2)`))).toBe(Number(exact));
    }
  });
  it.each(['NaN', 'Infinity', '1e309', 'sqrt(4)', 'Math.random()', 'process.exit()', '1;2', '1//2', '1%2', '1<<2', '2**10000', 'round(1,101)', 'min()', 'ceil(1,2)', '1/0'])('rejects %s', expression => {
    expect(() => calculateExactExpression(expression)).toThrow();
  });
  it('counts memory values in UTF-8 bytes, rejects NUL and duplicate provenance', () => {
    const base = { key: 'voyage', value: '🚢'.repeat(256), sources: ['a'] };
    expect(checkedFacts([base])[0].value).toBe(base.value);
    for (const fact of [{ ...base, value: base.value+'a' }, { ...base, value: 'x\0y' }, { ...base, sources: ['a','a'] }, { ...base, sources: [] }, { ...base, key: '__proto__' }]) expect(() => checkedFacts([fact])).toThrow();
    expect(() => checkedFacts([base, base])).toThrow();
  });
});
