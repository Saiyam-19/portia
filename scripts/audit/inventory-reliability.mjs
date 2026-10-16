// Stage 0–2 inventory utility. No inference, network, tariff execution or app writes.
// Run with Node 22 from the repository root.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
const manifestText = readFileSync('src/lib/migration/ports.ts', 'utf8');
const manifest = [...manifestText.matchAll(/"([^"\n]+\.md)": "([a-f0-9]{64})"/g)];
if (manifest.length !== 17) throw new Error('Manifest changed: review the locked inventory.');
const annotations = JSON.parse(readFileSync('docs/portia-reliability/source-annotations.json', 'utf8'));
const fragments = [];
const sources = manifest.map(([, relativePath, expectedHash], sourceIndex) => {
  const file = `data/ports/${relativePath}`;
  const bytes = readFileSync(file);
  const sha256 = hash(bytes);
  if (sha256 !== expectedHash) throw new Error(`Manifest hash mismatch: ${file}`);
  const text = bytes.toString('utf8');
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  const sourceId = `SRC-${String(sourceIndex + 1).padStart(2, '0')}`;
  const starts = lines.flatMap((line, i) => /^#{1,6}\s/.test(line) ? [i] : []);
  if (lines.length && starts[0] !== 0) starts.unshift(0);
  const sections = starts.map((start, i) => ({
    id: `${sourceId}-S${String(i + 1).padStart(3, '0')}`,
    title: /^#/.test(lines[start]) ? lines[start].replace(/^#+\s*/, '') : 'Unheaded source content',
    lineStart: start + 1,
    lineEnd: starts[i + 1] ?? lines.length,
  }));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const numericTableRow = line.trim().startsWith('|') && /\d/.test(line);
    const normativeText = !line.trim().startsWith('|') && /\b(charge|rate|levied|round|minimum|maximum|rebate|discount|exempt|shall|must|GST|exchange|effective|valid|excluding|including)\b/i.test(line);
    if (!numericTableRow && !normativeText) continue;
    fragments.push({
      id: `${sourceId}-L${String(i + 1).padStart(4, '0')}`,
      sourceId, sectionId: sections.find(s => s.lineStart <= i + 1 && s.lineEnd >= i + 1)?.id,
      file, line: i + 1, sha256: hash(line),
      kind: numericTableRow ? 'numeric-table-row' : 'normative-text-candidate',
      disposition: 'needs-semantic-rule-and-independent-oracle-mapping',
    });
  }
  return { sourceId, file, sha256, expectedHash, manifestMatches: true, bytes: bytes.length,
    lines: lines.length, sections, evidenceClass: bytes.length ? 'bundled-reference' : 'empty',
    officialVersionVerified: false, executableRuleCount: 0 };
});
const portIds = [...new Set(manifest.map(([, file]) => file.split('/')[0]))].sort();
if (JSON.stringify(portIds) !== JSON.stringify(Object.keys(annotations.ports).sort())) throw new Error('Every locked port needs one annotation.');
const ports = portIds.map((id, i) => ({
  id, coverageId: `PORT-${String(i + 1).padStart(2, '0')}`, preserved: true,
  sourceIds: sources.filter(s => s.file.startsWith(`data/ports/${id}/`)).map(s => s.sourceId),
  ...annotations.ports[id],
  currentQuoteReadiness: 'unverified',
  requiredJourneys: ['successful-in-scope-price', 'source-backed-rule-answer', 'necessary-clarification', 'historical-versus-current-date', 'neighboring-positive-alias'],
  oracleStatus: 'awaiting-independent-source-adjudication',
}));
const baseline = { schemaVersion: 1, asOf: '2026-10-14', manifestSha256: hash(manifestText),
  scope: 'Existing 16 port identifiers and all source sections; candidates are not verified rules.',
  sources, ports, fragments,
  counts: { ports: ports.length, files: sources.length, sections: sources.reduce((n, s) => n + s.sections.length, 0), candidateFragments: fragments.length, emptyFiles: sources.filter(s => !s.bytes).length },
  limitations: ['Line candidates are a reproducible inventory, not a count of distinct semantic rules or complete independent tests.', 'Every section is retained, including nonnumeric definitions and notes. Manually map all conditions/exceptions before closing a rule.', 'No bundled file is promoted to current official authority by matching a manifest hash.', 'Shared navigation-dues appendices require a single authority rule and deduplication; no automatic extra charge.'],
};
writeFileSync('docs/portia-source-registry.json', JSON.stringify(baseline, null, 2) + '\n');
console.log(JSON.stringify(baseline.counts));
