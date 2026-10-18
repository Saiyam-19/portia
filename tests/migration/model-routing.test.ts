import { generateText } from 'ai';
import { afterEach, expect, it, vi } from 'vitest';
import { migrationLanguageModel, strictBusinessToolFetch } from '../../src/lib/migration/model';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('pins historical aliases to Luna none without fallback or privacy exceptions', async () => {
 vi.stubEnv('OPENROUTER_API_KEY','synthetic'); vi.stubEnv('LLM_ALLOW_PAID','true');
 vi.stubEnv('MIGRATION_TEST_MODE','true'); vi.stubEnv('MIGRATION_MODEL_OVERRIDE','nvidia/free:free'); vi.stubEnv('PORTIA_FREE_TEST_ALLOW_RETENTION','true');
 const bodies: Record<string, unknown>[]=[];
 vi.stubGlobal('fetch',vi.fn(async (_url,init) => { const body=JSON.parse(init.body); bodies.push(body); return Response.json({id:'synthetic',object:'chat.completion',created:1,model:body.model,choices:[{index:0,message:{role:'assistant',content:'Hello'},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}}); }));
 for(const alias of ['model-1','model-2'] as const) await generateText({model:migrationLanguageModel(alias),prompt:'Hello',maxRetries:0});
 expect(bodies).toHaveLength(2);
 for(const body of bodies){ expect(body.model).toBe('openai/gpt-6-luna'); expect(body.reasoning).toEqual({effort:'none'}); expect(body.provider).toMatchObject({allow_fallbacks:false,require_parameters:true,data_collection:'deny',zdr:true}); }
});
it('does not dispatch paid inference without the existing paid-enable control', () => {
 vi.stubEnv('OPENROUTER_API_KEY','synthetic');vi.stubEnv('LLM_ALLOW_PAID','false');expect(()=>migrationLanguageModel('model-1')).toThrow(/LLM_ALLOW_PAID/);
});

it('forwards strict business-tool flags dropped by the installed provider mapping',async()=>{
 const spy=vi.fn<typeof fetch>(async()=>new Response('ok'));vi.stubGlobal('fetch',spy);
 await strictBusinessToolFetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',body:JSON.stringify({tools:[{type:'function',function:{name:'manage_quote',parameters:{type:'object'}}}]})});
 expect(JSON.parse(String(spy.mock.calls[0][1]?.body)).tools[0].function.strict).toBe(true);
});
