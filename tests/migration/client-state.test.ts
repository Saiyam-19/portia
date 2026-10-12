import { describe, expect, it } from "vitest";
import { migrationRunState } from "../../src/lib/migration/client-state";

describe("shared migration run state", () => {
  it("shows a persisted run as running after reload and targets its run ID", () => {
    expect(migrationRunState("ready", undefined, {
      state: "running",
      activeRunId: "persisted-run",
    })).toEqual({ running: true, activeRunId: "persisted-run" });
  });

  it("prefers the local stream run while transport is active", () => {
    expect(migrationRunState("streaming", "local-run", {
      state: "idle",
      activeRunId: null,
    })).toEqual({ running: true, activeRunId: "local-run" });
  });
});

import { initialQuestionDraft, questionDraftReducer } from '../../src/lib/migration/client-state';

function submittedDraft() {
  return questionDraftReducer(
    questionDraftReducer(initialQuestionDraft, { type: 'question', text: 'Recalculate berth charges', revision: 5 }),
    { type: 'observe', metadata: { runId: 'my-run', revision: 5 } },
  );
}

describe('durable question draft acknowledgement', () => {
  it('retains the draft after an apparently clean EOF while the stored run remains active', () => {
    const state = submittedDraft();
    const next = questionDraftReducer(state, { type: 'saved', runId: 'my-run', status: 'active', transportBusy: false });
    expect(next.input).toBe('Recalculate berth charges');
    expect(next.pending?.text).toBe('Recalculate berth charges');
  });
  it.each(['error', 'cancelled', 'expired'])('retains retry text for a persisted %s run', status => {
    const next = questionDraftReducer(submittedDraft(), { type: 'saved', runId: 'my-run', status, transportBusy: false });
    expect(next.input).toBe('Recalculate berth charges');
    expect(next.pending).not.toBeNull();
  });
  it.each(['completed', 'waiting'])('clears an unchanged draft only after matching durable %s acknowledgement', status => {
    const state = submittedDraft();
    expect(questionDraftReducer(state, { type: 'saved', runId: 'different-run', status, transportBusy: false })).toBe(state);
    expect(questionDraftReducer(state, { type: 'saved', runId: 'my-run', status, transportBusy: true })).toBe(state);
    expect(questionDraftReducer(state, { type: 'saved', runId: 'my-run', status, transportBusy: false })).toMatchObject({ input: '', pending: null });
  });
  it('keeps edits typed after stream closure when delayed success or failure arrives', () => {
    const edited = questionDraftReducer(submittedDraft(), { type: 'edit', value: 'New question being composed' });
    for (const status of ['completed', 'waiting', 'error', 'cancelled']) {
      expect(questionDraftReducer(edited, { type: 'saved', runId: 'my-run', status, transportBusy: false }).input).toBe('New question being composed');
    }
    expect(questionDraftReducer(edited, { type: 'transport-failed' }).input).toBe('New question being composed');
    const emptied = questionDraftReducer(edited, { type: 'edit', value: '' });
    expect(questionDraftReducer(emptied, { type: 'transport-failed' }).input).toBe('');
  });
  it('does not associate or clear a newer submission using older stream metadata', () => {
    const state = questionDraftReducer(submittedDraft(), { type: 'question', text: 'New retry', revision: 7 });
    const stale = questionDraftReducer(state, { type: 'observe', metadata: { runId: 'my-run', revision: 5 } });
    expect(stale).toBe(state);
    expect(questionDraftReducer(stale, { type: 'saved', runId: 'my-run', status: 'completed', transportBusy: false }).input).toBe('New retry');
  });
});
