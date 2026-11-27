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

/** A minimal PDF whose pages carry the given content streams ('' is a blank page). */
function pdf(pages: string[]) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`];
  pages.forEach((content, i) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R >> >> /Contents ${4 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(at => `${String(at).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}
const text = (value: string) => `BT /F1 12 Tf 50 700 Td (${value}) Tj ET`;
const image = 'q 100 0 0 100 50 50 cm BI /W 1 /H 1 /CS /G /BPC 8 ID \x80 EI Q';

it('keeps text PDFs with blank pages local, but sends image-only pages to conversion', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'Scanned rate: 9 USD' } }] }));
  const env = { PORTIA_MODEL_MODE: 'openrouter', LLM_ALLOW_PAID: 'true', OPENROUTER_API_KEY: 'test-only' };
  const blank = await artifactMarkdown({ name: 'blank.pdf', mimeType: 'application/pdf', bytes: pdf([text('Pilotage 12.50 USD'), '', text('Minimum 250 USD')]) }, { env, fetchImpl });
  expect(blank).toContain('## Page 2\n\n(blank page)'); expect(blank).toContain('Minimum 250 USD');
  expect(fetchImpl).not.toHaveBeenCalled();
  const scanned = await artifactMarkdown({ name: 'mixed.pdf', mimeType: 'application/pdf', bytes: pdf([text('Cover'), image]) }, { env, fetchImpl });
  expect(scanned).toContain('Scanned rate: 9 USD');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it('rejects long scans before any model call and explains non-UTF-8 text', async () => {
  const fetchImpl = vi.fn<typeof fetch>();
  const env = { PORTIA_MODEL_MODE: 'openrouter', LLM_ALLOW_PAID: 'true', OPENROUTER_API_KEY: 'test-only' };
  await expect(artifactMarkdown({ name: 'scan.pdf', mimeType: 'application/pdf', bytes: pdf(Array(11).fill(image)) }, { env, fetchImpl })).rejects.toThrow(/up to 10 pages/);
  expect(fetchImpl).not.toHaveBeenCalled();
  const latin1 = new Uint8Array([0x52, 0x61, 0x74, 0x65, 0x2c, 0xa3, 0x31, 0x30, 0x0a]);
  await expect(artifactMarkdown({ name: 'rates.csv', mimeType: 'text/csv', bytes: latin1 })).rejects.toThrow(/not UTF-8 text/);
});
