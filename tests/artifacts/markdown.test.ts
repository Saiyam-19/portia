import { expect, it, vi } from 'vitest';
import { artifactMarkdown } from '../../src/lib/artifacts/markdown';
import { readFile } from 'node:fs/promises';

it('preserves uploaded text and rejects unsupported or oversized content', async () => {
  const bytes = new TextEncoder().encode('## Rates\n\n| Charge | Rate |\n| --- | --- |\n| Pilotage | 0.125 |');
  expect(await artifactMarkdown({ name: 'rates.md', mimeType: 'text/markdown', bytes })).toContain('| Pilotage | 0.125 |');
  await expect(artifactMarkdown({ name: 'script.exe', mimeType: 'application/octet-stream', bytes })).rejects.toThrow(/Supported/);
  await expect(artifactMarkdown({ name: 'huge.txt', mimeType: 'text/plain', bytes: new Uint8Array(300_000).fill(65) })).rejects.toThrow(/256 KB/);
});

it('uses native multimodal input once and never fabricates a text view in mock mode', async () => {
  const file = { name: 'scan.png', mimeType: 'image/png', bytes: new Uint8Array([137, 80, 78, 71]) };
  await expect(artifactMarkdown(file, { env: { PORTIA_MODEL_MODE: 'mock' } })).rejects.toThrow(/live model/);
  const upstream = vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    expect(body.messages[1].content[1].image_url.url).toBe('data:image/png;base64,iVBORw==');
    expect(body.provider.data_collection).toBe('deny');
    expect(body.max_tokens).toBeLessThanOrEqual(8192);
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: '## Page 1\nRate: 12.50 per tonne' } }] });
  });
  const env = { PORTIA_MODEL_MODE: 'openrouter', LLM_ALLOW_PAID: 'true', OPENROUTER_API_KEY: 'test-only' };
  expect(await artifactMarkdown(file, { env, fetchImpl: upstream })).toContain('12.50 per tonne');
  expect(upstream).toHaveBeenCalledTimes(1);
});

it('extracts actual PDF pages, Word text and every Excel sheet without paid inference', async () => {
  const read = async (name: string) => artifactMarkdown({ name, mimeType: 'application/octet-stream', bytes: await readFile(new URL(`./fixtures/${name}`, import.meta.url)) });
  const pdf = await read('schedule.pdf');
  expect(pdf).toContain('## Page 1'); expect(pdf).toContain('## Page 2'); expect(pdf).toContain('12.50 USD per GRT'); expect(pdf).toContain('250 USD');
  expect(await read('contract.docx')).toContain('Pilotage: 12.50 USD per GRT.');
  const xlsx = await read('rates.xlsx');
  expect(xlsx).toContain('## Sheet: Published rates'); expect(xlsx).toContain('## Sheet: Agreement');
  expect(xlsx).toContain('| Pilotage | 12.5 |'); expect(xlsx).toContain('| Pilotage | 11.25 |');
});

it('rejects a truncated multimodal conversion instead of marking it ready', async () => {
  const file = { name: 'voice.wav', mimeType: 'audio/wav', bytes: new Uint8Array([1, 2]) };
  const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ choices: [{ finish_reason: 'length', message: { content: 'incomplete transcript' } }] }));
  await expect(artifactMarkdown(file, { env: { PORTIA_MODEL_MODE: 'openrouter', LLM_ALLOW_PAID: 'true', OPENROUTER_API_KEY: 'test-only' }, fetchImpl })).rejects.toThrow(/complete text view/);
});

it('transcribes audio at upload time without changing either chat model', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    expect(body.model).toBe('google/gemini-2.5-flash-lite');
    expect(body.messages[1].content[1].input_audio.format).toBe('wav');
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'Reference cedar seven.' } }] });
  });
  const text = await artifactMarkdown({ name: 'voice.wav', mimeType: 'audio/wav', bytes: new Uint8Array([1, 2]) }, { env: { PORTIA_MODEL_MODE: 'openrouter', LLM_ALLOW_PAID: 'true', OPENROUTER_API_KEY: 'test-only' }, fetchImpl });
  expect(text).toContain('Reference cedar seven.');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
