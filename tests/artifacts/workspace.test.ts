import { expect, it, vi } from 'vitest';
import { ConversationWorkspace } from '../../src/lib/agent/workspace';
import type { AgentStore } from '../../src/lib/agent/store';
import type { MountedArtifact } from '../../src/lib/artifacts/shared';
import { FakeStore } from '../agent/fake-store';

it('mounts only Markdown, protects it from writes and refreshes replacement/deletion', async () => {
  const store: AgentStore = new FakeStore();
  let files: MountedArtifact[] = [{ id: 'file1', name: 'Contract.pdf', mimeType: 'application/pdf', size: 100, revision: 1, markdownKey: 'md1' }];
  const state = store.workspaceState.bind(store);
  store.workspaceState = async (...args) => ({ ...(await state(...args))!, artifacts: files });
  const read = vi.fn(async (key: string) => key === 'md1' ? '# Contract\nRate: 12.5' : '# Replacement\nRate: 15');
  store.artifactContent = read;
  const workspace = await ConversationWorkspace.create({ store, conversationId: 'files', ownerId: 'owner-1' });
  expect((await workspace.bash('cat /files/file1.md')).stdout).toContain('Rate: 12.5');
  expect((await workspace.bash('echo overwritten > /files/file1.md')).exitCode).not.toBe(0);
  expect((await workspace.bash('cat /files/file1.md')).stdout).toContain('Rate: 12.5');
  expect(read).toHaveBeenCalledTimes(1);
  files = [{ ...files[0], revision: 2, markdownKey: 'md2' }];
  expect((await workspace.bash('cat /files/file1.md')).stdout).toContain('Rate: 15');
  files = [];
  expect((await workspace.bash('cat /files/file1.md')).exitCode).not.toBe(0);
  expect((await workspace.bash('echo kept > /memories/profile.md')).exitCode).toBe(0);
});

it('does not run a command against stale file contents when refresh fails', async () => {
  const store: AgentStore = new FakeStore();
  let key = 'md1';
  const state = store.workspaceState.bind(store);
  store.workspaceState = async (...args) => ({ ...(await state(...args))!, artifacts: [{ id: 'file2', name: 'x.txt', mimeType: 'text/plain', size: 1, revision: 1, markdownKey: key }] });
  store.artifactContent = async value => { if (value !== 'md1') throw new Error('offline'); return 'old'; };
  const workspace = await ConversationWorkspace.create({ store, conversationId: 'failure', ownerId: 'owner-1' });
  expect((await workspace.bash('cat /files/file2.md')).stdout).toContain('old');
  key = 'md2';
  const failed = await workspace.bash('cat /files/file2.md; echo should-not-run');
  expect(failed.exitCode).not.toBe(0);
  expect(failed.stdout).not.toContain('old');
  expect(failed.stdout).not.toContain('should-not-run');
});
