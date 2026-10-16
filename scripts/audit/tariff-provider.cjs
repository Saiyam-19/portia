/* eslint-disable @typescript-eslint/no-require-imports -- isolated local acceptance preload. */
const fs = require('node:fs');
const path = require('node:path');
const MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';
const LIMIT = 8;

function createFreeTariffFetch({ directory, budgetDirectory = directory, maxDispatches = LIMIT, model = MODEL, upstream }) {
  if (!Number.isInteger(maxDispatches) || maxDispatches < 1 || maxDispatches > LIMIT) throw new Error('Invalid tariff acceptance dispatch ceiling');
  if (!/^[a-z0-9][a-z0-9/._-]*:free$/i.test(model)) throw new Error('Validation model must be explicitly pinned free');
  fs.mkdirSync(directory, { recursive: true });
  fs.mkdirSync(budgetDirectory, { recursive: true });
  const failed = path.join(budgetDirectory, 'provider-systemic-failure.json');
  const log = event => fs.appendFileSync(path.join(directory, 'provider-events.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n');
  return async function(input, init) {
    const url = new URL(typeof input === 'string' ? input : input.url || String(input));
    if (url.hostname !== 'openrouter.ai') return upstream(input, init);
    if (fs.existsSync(failed)) throw new Error('Tariff acceptance stopped after systemic provider failure');
    const request = JSON.parse(init?.body || '{}');
    if (url.pathname !== '/api/v1/chat/completions' || request.model !== model || request.provider?.allow_fallbacks !== false || ['prompt', 'completion', 'request'].some(k => request.provider?.max_price?.[k] !== 0)) throw new Error('Tariff acceptance price/model guard');
    // Exclusive durable slots also bound simultaneous main/specialist dispatches
    // from different processes. Failed/unknown calls keep their reservations.
    let slot;
    for (let index = 1; index <= maxDispatches; index++) {
      try {
        const file = fs.openSync(path.join(budgetDirectory, `dispatch-${index}.once`), 'wx', 0o600);
        fs.closeSync(file);slot = index;break;
      } catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    if (!slot) throw new Error('Tariff acceptance provider budget exhausted');
    log({ event: 'dispatch', slot, model, tools: (request.tools || []).map(t => t.function?.name), maxPrice: request.provider.max_price, allowFallbacks: false });
    try {
      const response = await upstream(input, init);
      log({ event: 'response', slot, status: response.status });
      if (!response.ok) fs.writeFileSync(failed, JSON.stringify({ slot, status: response.status }), { mode: 0o600 });
      return response;
    } catch (error) {
      fs.writeFileSync(failed, JSON.stringify({ slot, category: 'transport-failure' }), { mode: 0o600 });
      log({ event: 'transport-failure', slot });throw error;
    }
  };
}

module.exports = { createFreeTariffFetch };
if (process.env.PORTIA_TARIFF_ACCEPTANCE === 'true') {
  const guarded = createFreeTariffFetch({ directory: process.env.PORTIA_TARIFF_OUTPUT, budgetDirectory: process.env.PORTIA_TARIFF_BUDGET_DIR, maxDispatches: Number(process.env.PORTIA_TARIFF_MAX_DISPATCHES ?? LIMIT), upstream: globalThis.fetch });
  globalThis.fetch = async function(input, init) {
    const url = new URL(typeof input === 'string' ? input : input.url || String(input));
    if (url.hostname === 'openrouter.ai' && (process.env.PORTIA_LOCAL_BACKEND !== 'true' || new URL(process.env.NEXT_PUBLIC_CONVEX_URL).hostname !== '127.0.0.1')) throw new Error('Tariff acceptance requires isolated local backend');
    return guarded(input, init);
  };
}
