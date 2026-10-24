import { beforeEach, expect, it, vi } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import type { createMigrationMainAgent } from '../../src/lib/migration/domain-agent';
import { OUT_OF_STEPS, UNCHECKED_SUMMARY } from '../../src/lib/berthwise/answer';
const mocks=vi.hoisted(()=>({bridge:vi.fn(),agent:vi.fn(),model:vi.fn(),stop:vi.fn()}));
vi.mock('../../src/lib/migration/config',()=>({migrationPreviewEnabled:()=>true}));
vi.mock('../../src/lib/migration/origin',()=>({trustedMigrationOrigin:()=> 'https://berthwise.test'}));
vi.mock('../../src/lib/memory/session',()=>({memoryFeatureEnabled:()=>false}));
vi.mock('../../src/lib/migration/model',()=>({migrationLanguageModel:mocks.model}));
vi.mock('../../src/lib/migration/domain-agent',async original=>({...await original<object>(),createMigrationMainAgent:mocks.agent}));
vi.mock('../../src/lib/migration/bridge',()=>({callMigrationBridge:mocks.bridge,MigrationTokenManager:class{initialize=async()=>{};refresh=async()=>{};stop=mocks.stop;}}));
import {POST} from '../../src/app/api/migration/chat/route';

const usage={inputTokens:{total:1,noCache:1,cacheRead:undefined,cacheWrite:undefined},outputTokens:{total:1,text:1,reasoning:undefined}};
type Step = { text?: string; tool?: { name: string; input: unknown } };
function stepStream({ text, tool }: Step) {
  return { stream: new ReadableStream<LanguageModelV4StreamPart>({ start(c) {
    c.enqueue({ type: 'stream-start', warnings: [] });
    if (text) { c.enqueue({ type: 'text-start', id: 't' }); c.enqueue({ type: 'text-delta', id: 't', delta: text }); c.enqueue({ type: 'text-end', id: 't' }); }
    if (tool) c.enqueue({ type: 'tool-call', toolCallId: 'call-' + Math.random().toString(36).slice(2), toolName: tool.name, input: JSON.stringify(tool.input) });
    c.enqueue({ type: 'finish', usage, finishReason: { unified: tool ? 'tool-calls' : 'stop', raw: undefined } }); c.close();
  } }) };
}

async function run(steps: Step[], options: { repair?: string; rejectComplete?: boolean } = {}) {
  let index = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => stepStream(steps[Math.min(index++, steps.length - 1)]!),
    doGenerate: async () => ({ content: [{ type: 'text', text: options.repair ?? '' }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] }),
  });
  mocks.model.mockReturnValue(model);
  const actual = await vi.importActual<typeof import('../../src/lib/migration/domain-agent')>('../../src/lib/migration/domain-agent');
  mocks.agent.mockImplementation((agentOptions: Parameters<typeof createMigrationMainAgent>[0]) => actual.createMigrationMainAgent(agentOptions));
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(r => release = r), enteredPromise = new Promise<void>(r => entered = r);
  mocks.bridge.mockImplementation(async (_manager, call) => {
    if (call.op === 'claim') return { conversationId: 'chat', runId: 'run', fence: 1, revision: 1, threadId: 'thread', promptMessageId: 'prompt', replayed: false };
    if (call.op === 'context') return { conversationId: 'chat', revision: 1, messages: [{ role: 'user', content: 'Ship of 30,000 GT. What is 2+3?' }], modelAlias: 'model-1' };
    if (call.op === 'status') return { active: true };
    if (call.op === 'complete') { entered(); await gate; if (options.rejectComplete) throw new Error('Stale fence'); return { state: 'idle', revision: 2 }; }
    return {};
  });
  const response = await POST(new Request('https://berthwise.test/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'question', question: 'What is 2+3?', conversationId: null, expectedRevision: null, requestId: crypto.randomUUID(), modelAlias: 'model-1' }) }));
  expect(response.status).toBe(200);
  const reader = response.body!.getReader(); let wire = '';
  const consume = (async () => { while (true) { const part = await reader.read(); if (part.done) break; wire += new TextDecoder().decode(part.value); } })();
  await enteredPromise;
  const beforeSave = wire;
  release(); await consume;
  const call = (op: string) => mocks.bridge.mock.calls.filter(([, c]) => c.op === op).map(([, c]) => c.args);
  return { wire, beforeSave, complete: call('complete')[0], checkpoints: call('checkpoint'), fails: call('fail'), repairs: model.doGenerateCalls.length };
}

beforeEach(() => vi.clearAllMocks());

it('saves tool steps without narration, then publishes the checked answer only after saving it', async () => {
  const result = await run([{ text: 'Let me check 999,999.', tool: { name: 'calculate', input: { expression: '2+3' } } }, { text: 'For your 30,000 GT ship, 2+3 is 5.' }]);
  expect(result.checkpoints).toHaveLength(1);
  expect(JSON.stringify(result.checkpoints[0].responseMessages)).not.toContain('999,999');
  expect(JSON.stringify(result.checkpoints[0].responseMessages)).toContain('"result":"5"');
  expect(result.complete.responseMessages).toEqual([{ role: 'assistant', content: 'For your 30,000 GT ship, 2+3 is 5.' }]);
  expect(result.beforeSave).not.toContain('2+3 is 5');
  expect(result.wire).toContain('2+3 is 5');
  expect(result.wire).not.toContain('999,999');
  expect(result.repairs).toBe(0);
});

it('asks the model once to remove invented figures and publishes the repaired answer', async () => {
  const result = await run([{ tool: { name: 'calculate', input: { expression: '2+3' } } }, { text: 'It is 5, or USD 999,999 with tax.' }], { repair: 'It is 5. Tax is not available.' });
  expect(result.repairs).toBe(1);
  expect(result.complete.responseMessages).toEqual([{ role: 'assistant', content: 'It is 5. Tax is not available.' }]);
  expect(result.wire).not.toContain('999,999');
});

it('falls back to a plain message when the repair still invents figures', async () => {
  const result = await run([{ text: 'The total is USD 123,456.' }], { repair: 'Sorry, it is USD 654,321.' });
  expect(result.complete.responseMessages).toEqual([{ role: 'assistant', content: UNCHECKED_SUMMARY }]);
  expect(result.wire).not.toMatch(/123,456|654,321/);
});

it('reports running out of steps as incomplete rather than inventing an answer', async () => {
  const result = await run([{ tool: { name: 'calculate', input: { expression: '2+3' } } }]);
  expect(result.checkpoints.length).toBeGreaterThan(1);
  expect(result.complete).toMatchObject({ incomplete: true, responseMessages: [{ role: 'assistant', content: OUT_OF_STEPS }] });
});

it('publishes nothing when the save is rejected', async () => {
  const result = await run([{ text: 'It is 5.' }], { rejectComplete: true });
  expect(result.wire).not.toContain('It is 5.');
  expect(result.fails).toHaveLength(1);
});
