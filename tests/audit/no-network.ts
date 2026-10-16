import { beforeEach, vi } from 'vitest';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw new Error('AUDIT_NETWORK_BLOCKED: supply a local fake explicitly');
  }));
});
