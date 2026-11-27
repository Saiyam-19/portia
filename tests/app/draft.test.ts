import { afterEach, expect, it, vi } from 'vitest';
import { saveDraft, takeDraft } from '../../src/lib/chat/draft';

afterEach(() => vi.unstubAllGlobals());

it('carries one landing-page question to the new-chat screen, then forgets it', () => {
  const store = new Map<string, string>();
  vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  saveDraft('  Port dues for 30,000 GRT at Mumbai?  ');
  expect(takeDraft()).toBe('Port dues for 30,000 GRT at Mumbai?');
  expect(takeDraft()).toBe('');
  saveDraft('x'.repeat(5000));
  expect(takeDraft()).toHaveLength(4000);
});

it('works without storage', () => {
  vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => undefined });
  expect(() => saveDraft('hi')).not.toThrow();
  expect(takeDraft()).toBe('');
});
