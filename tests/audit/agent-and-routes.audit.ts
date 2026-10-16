import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import type { LanguageModelV4GenerateResult } from '@ai-sdk/provider';
import { createMigrationMainAgent } from '../../src/lib/migration/domain-agent';
import { withSafeModelErrors } from '../../src/lib/migration/safe-model';
import { responseErrorMessage } from '../../src/lib/migration/response-errors';
import { POST as chat } from '../../src/app/api/migration/chat/route';
import { POST as cancel } from '../../src/app/api/migration/cancel/route';
import { MemorySession } from '../../src/lib/memory/session';
import { MigrationTokenManager } from '../../src/lib/migration/bridge';

const site = 'http://127.0.0.1:3022';
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } };
const generated = (content: LanguageModelV4GenerateResult['content'], finish: 'stop'|'tool-calls' = 'stop'): LanguageModelV4GenerateResult => ({ content, usage, finishReason: { unified: finish, raw: undefined }, warnings: [] });
beforeEach(() => {
  for (const [key,value] of Object.entries({PORTIA_ENABLED:'true',PORTIA_CONVEX_DEPLOYMENT:'brilliant-whale-380',NEXT_PUBLIC_CONVEX_URL:'https://brilliant-whale-380.convex.cloud',NEXT_PUBLIC_CONVEX_SITE_URL:'https://brilliant-whale-380.convex.site',PORTIA_SERVER_SECRET:'x'.repeat(32),SITE_URL:site})) vi.stubEnv(key,value);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('rejects four legacy dispatches before any unbound specialist work', async () => {
  let calls = 0;
  const main = new MockLanguageModelV4({ doGenerate: [
    generated(Array.from({ length: 4 }, (_, i) => ({type:'tool-call' as const,toolCallId:'consult-'+i,toolName:'consult_port_agent',input:JSON.stringify({port_name:'mumbai',query:'Explain the schedule'})})), 'tool-calls'),
    generated([{type:'text',text:'Completed'}]),
  ] });
  const specialist = new MockLanguageModelV4({ doGenerate: generated([{type:'text',text:'Synthetic tariff summary'}]) });
  await expect(createMigrationMainAgent({ interpretationFormat: "legacy", alias:'model-1', mainModel:main, specialistModelFactory:() => { calls++; return specialist; } }).generate({prompt:'Compare four calls'})).rejects.toMatchObject({name:'PortiaInterpretationError'});
  expect(calls).toBe(0);expect(main.doGenerateCalls).toHaveLength(1);
});

it.each(['ECONNRESET','ENOTFOUND','UND_ERR_SOCKET'])('preserves %s classification across sanitization', async code => {
  const model = withSafeModelErrors(new MockLanguageModelV4({doGenerate:async()=>{throw Object.assign(new Error('private source'),{code});}}));
  const error = await model.doGenerate({prompt:[]}).then(()=>null,error=>error);
  expect(String(error)).not.toContain('private source');
  expect(responseErrorMessage(error)).toContain('temporarily busy');
});

it.each([
  ['chat',chat,32], ['cancel',cancel,4],
] as const)('bounds streamed %s request consumption before full buffering', async (_name,handler,limitKB) => {
  let chunks = 0;
  const stream = new ReadableStream<Uint8Array>({pull(controller) { if (chunks===100) {controller.close();return;} chunks++;controller.enqueue(new Uint8Array(1000).fill(120)); }});
  const request = new Request(site+'/api/chat', { method:'POST', headers:{Origin:site,'Content-Type':'application/json'},body:stream,duplex:'half' } as RequestInit);
  expect((await handler(request)).status).toBe(400);
  expect(chunks).toBeLessThanOrEqual(limitKB+2);
});

it('rejects a wrong origin before consuming a hostile body or invoking a provider', async () => {
  const text = vi.fn();
  const request = new Request(site+'/api/chat',{method:'POST',headers:{Origin:'https://attacker.invalid'},body:'x'});
  request.text = text;
  expect((await chat(request)).status).toBe(403);
  expect(text).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it('bounds memory lease contention to at most eight bridge requests in the first second', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const manager = new MigrationTokenManager('',site,controller);
  vi.spyOn(manager,'getToken').mockReturnValue('synthetic');
  const network = vi.fn(async (_input: unknown, init?: RequestInit) => {
    const {op}=JSON.parse(String(init?.body));
    return Response.json(op==='claim'?null:{pending:true,blocked:false});
  });
  vi.stubGlobal('fetch',network);
  const pending = new MemorySession(manager).drain().catch(error=>error);
  await vi.advanceTimersByTimeAsync(1000);
  const count = network.mock.calls.length;
  controller.abort(new DOMException('Audit stop','AbortError'));
  await vi.advanceTimersByTimeAsync(100);
  await pending;
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(8);
  expect(vi.getTimerCount()).toBe(0);
  console.info('AUDIT_MEMORY_CONTENTION_REQUESTS_PER_SECOND',count);
});
