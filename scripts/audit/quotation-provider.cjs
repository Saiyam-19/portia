/* eslint-disable @typescript-eslint/no-require-imports -- local acceptance preload. */
// Local acceptance only. Synthetic mode dispatches a receipt, never an answer.
const fs = require('node:fs');
const path = require('node:path');
const original = globalThis.fetch;
const model = 'nvidia/nemotron-3-super-120b-a12b:free';
const dir = process.env.PORTIA_QUOTATION_OUTPUT;
const log = value => { if (dir) fs.appendFileSync(path.join(dir, 'provider-events.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...value }) + '\n'); };
globalThis.fetch = async function(input, init) {
  const url = new URL(typeof input === 'string' ? input : input.url || String(input));
  if (url.hostname !== 'openrouter.ai') return original(input, init);
  if (process.env.PORTIA_LOCAL_BACKEND !== 'true' || new URL(process.env.NEXT_PUBLIC_CONVEX_URL).hostname !== '127.0.0.1') throw new Error('Quotation acceptance requires isolated local backend');
  const request = JSON.parse(init?.body || '{}');
  if (url.pathname !== '/api/v1/chat/completions' || request.model !== model || request.provider?.allow_fallbacks !== false || ['prompt','completion','request'].some(k => request.provider?.max_price?.[k] !== 0)) throw new Error('Quotation acceptance price/model guard');
  const mode = process.env.PORTIA_QUOTATION_MOCK === 'true' ? 'synthetic' : 'live';
  const names = (request.tools || []).map(t => t.function?.name);
  log({ event: 'dispatch', mode, model: request.model, tools: names, priceCaps: request.provider.max_price, allowFallbacks: false });
  if (mode === 'live') {
    // A durable exclusive marker prohibits retrying even after a server restart.
    const marker = path.join(dir, 'live-dispatch.once');
    fs.closeSync(fs.openSync(marker, 'wx', 0o600));
    const response = await original(input, init);
    log({ event: 'response', mode, status: response.status });
    return response;
  }
  const system = (request.messages || []).filter(m => m.role === 'system' || m.role === 'developer').map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
  const id = [...system.matchAll(/CURRENT_SUPPLIED_QUOTE_ID=([a-f0-9]{64})/g)].at(-1)?.[1];
  if (!id || names.length !== 1 || names[0] !== 'calculate_supplied_quote') {
    log({ event: 'synthetic-dispatch-rejected', receiptFound: Boolean(id), roles: (request.messages || []).map(m => m.role) });
    throw new Error('Synthetic quotation dispatcher missing receipt');
  }
  const chunk = (delta, finish_reason = null) => 'data: ' + JSON.stringify({ id: 'synthetic-quote-dispatch', object: 'chat.completion.chunk', created: 1, model, choices: [{ index: 0, delta, finish_reason }] }) + '\n\n';
  const body = chunk({ role: 'assistant', tool_calls: [{ index: 0, id: 'synthetic-quote', type: 'function', function: { name: 'calculate_supplied_quote', arguments: JSON.stringify({ quote_id: id }) } }] }) + chunk({}, 'tool_calls') + 'data: [DONE]\n\n';
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
};
