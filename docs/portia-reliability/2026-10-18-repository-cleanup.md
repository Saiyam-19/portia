# Repository cleanup — 18 October 2026

> Historical cleanup record. The two failures recorded below were subsequently repaired; see the [current-runtime safeguard audit](2026-10-18-runtime-safeguard-audit.md) for current verification and remaining blockers. Original cleanup evidence is retained unchanged.

Requested scope: remove obsolete code, completed experiment logs and generated
artifacts; preserve tariff evidence, unrelated work and private configuration;
then plan commits. No commit, push, deployment or held-out evaluation is authorized
by this cleanup stage.

Baseline: branch `pass1/golden-and-repairs`, HEAD
`2a77ead22c5a8dc365b58806f38accd4f959b2bd`, already dirty. Full baseline:
113 test files / 1,311 tests passed on Node 22.23.2. This includes retired-engine
tests and is not an acceptance claim for arbitrary conversations.

## Evidence and deletion criteria

- Graph import analysis and direct imports agree that the copied `tests/legacy`
  interpreter is outside the serving path. Preserve cancellation, request limits,
  saved-history integrity and current memory behavior before retiring its tests.
- Next/Convex serve the application. Python and Supabase are retired; Git HEAD
  retains their historical implementation. Verify all 17 `backend/ports` hashes
  against `data/ports` before removing the duplicate corpus.
- Preserve canonical `data/ports` and `data/reviewed-tariffs` byte for byte.
  Deduplicate research source bytes by SHA-256; retain provenance, effective-date
  limitations, unresolved authority gaps, review outcomes and cumulative cost.
- Remove completed generated builds, inactive lab databases, old captures,
  superseded scripts and source snapshots only after recording exact paths and
  hashes. Retain uncertain UI/release material and private credentials.
- Keep runtime dependencies, unrelated listeners, Git state and private env files.
  No blanket `git clean`, reset or staging.

## Execution order

1. Record dirty-state/source hashes and inspect processes/listeners.
2. Move essential research/validation records out of disposable `output`.
3. Port live safety tests, remove obsolete code/tests/tooling, repair lab entrypoint.
4. Remove allowlisted generated artifacts; document preserved exceptions.
5. Run full remaining tests, typecheck, lint, production build and asset tracing.
6. Audit preserved hashes, process exit/port state and publish a commit plan.

## Results

- Removed 74 retired interpreter/code/harness files in the initial reviewed set,
  the obsolete tariff-provider budget test, 42 superseded experiment documents,
  Python/Supabase implementation and format-1 prototype, duplicate tariff corpus,
  completed `output` captures and inactive `.local` lab databases/source snapshots.
- Removed five unused Next scaffold SVGs after confirming no runtime/test/script references.
- Removed inactive `.next` and `.next-inference-pass1` builds. Verification builds
  are also disposable after recording their build ID and asset traces.
- Exact paths, sizes, reasons and applicable original hashes:
  [removal manifest](evidence/cleanup-removals.jsonl.gz),
  [group summary](evidence/cleanup-summary.json).
- Retained source bytes and original provenance:
  [evidence index](evidence/index.json). Canonical runtime data remains unchanged.
  Large PDFs are deliberately retained: statutory/operator context for unresolved
  tariff branches is evidence, not disposable experiment output.
- Canonical 17-file corpus matched the removed backend copy byte-for-byte; all
  79 canonical data files were unchanged from the cleanup baseline.
- Saved receipts still reopen through the historical reducer. Retained tests cover
  correction/replay, tampering, field provenance, lookup identity, cancellation,
  checkpoint failure and bounded provider loops. Removed tests exclusively ran
  the retired interpreter; deleting them makes no language-generalization claim.

## Verification

| Check | Observed result |
| --- | --- |
| Baseline before cleanup | 113 files, 1,311 tests passed; included retired engine |
| Remaining suite | 72 files, 802 passing checks; two known product failures retained explicitly |
| Exact test-run boundary | Full suite: 802 pass + one expected failure. Subsequent focused historical-currency test file: 14 pass + one additional expected failure. No serving-code change between those runs. |
| TypeScript | Pass, including final added regression |
| ESLint | Zero errors; six existing warnings (generated Convex directives and login navigation) |
| Production build | Pass with Node 22.23.2, webpack; build `lImfVLViTu6tY4h1ap4hg` |
| Packaging | Both chat routes include all 79 canonical data files; no output/local/Git/env/research archive artifacts |
| Lab entrypoint | Node22 syntax valid; retired free mode rejected before lab/lock creation |
| Adapter cancellation reproducer | Four synthetic cancellation orders, zero unhandled rejections |
| Source evidence | 368 provenance mappings hash-verified; source bytes recover exactly |
| Current document links / whitespace | Pass |
| Commit state | Nothing staged or committed |

Old-artifact removal: 16,171 files / 2,389,381,876 logical bytes (about 2.39 GB), excluding
regenerated verification caches. About 102 MB of deduplicated evidence retained.
The manifest separately records later verification-cache removals; repeated `.next`
paths are removal operations, not additional unique baseline files. Logical byte
counts are not a measurement of physical disk space reclaimed.

Two read-only review passes assessed scope and implementation independently.
Their findings drove safety-test preservation, removal of the orphaned old budget
test, repair of the lab/reproducer entrypoints and explicit preservation of both
known product failures. All generated check process groups exited.

## Known product gaps, preserved explicitly

A mixed request for arithmetic and an unavailable vessel lookup can publish the
arithmetic while dropping the lookup fallback from final text. Current runtime
behavior was exposed while porting a retired-engine test. Cleanup did not change
`src/lib/portia/session.ts`. The normal mixed-tool test validates execution; a
separate `it.fails` retains the missing final-publication requirement. Setup and
result-shape checks run outside that expected-failure assertion, so setup errors
cannot masquerade as the known issue. This unmet product requirement must be resolved before freezing the later blind evaluation.

A second existing gap occurs when importing a historical USD quotation with an EUR
minimum or cap: the compatibility bridge copies the bound amount without checking
its evidence currency. The reducer retains the distinct currency, but publication
can still calculate using the wrong currency. A second explicit expected-failure
regression exercises the current receipt-import path; normal setup verifies the
receipt and quotation loaded successfully. `legacy-quotes.ts` is unchanged by
cleanup. This financial applicability gap also requires a fix before evaluation.

## Preserved boundaries

- Root/backend private env files, `.local/secrets`, Git metadata, branches, stashes,
  worktrees, root dependencies and backend private deployment metadata preserved.
- `.local/{production-release,prod-acceptance-20261013,ui-refactor,model-selector-before,evidence,commit-planning-20261012}`
  retained: prior release recovery or unrelated UI/work evidence, not established
  junk. About 6.6 MB total `.local` material remained before temporary verification.
- Existing model-selector change, AGENTS instructions, product/design documents,
  delivery checklist and three untracked handoff prompts preserved.
- Private temporary source recovery archive captured dirty/untracked code before
  deletion. It is outside the repo; do not commit it or treat its temp location as
  permanent storage. Historical tracked implementations remain in Git HEAD.
- Raw requests/responses, failed-run bodies and page-render screenshots were
  intentionally removed. The retained source/budget/acceptance summaries support
  the stated audits; they do not support replaying the deleted raw model traffic.

## Process handling

No application server, database or persistent worker was started. Existing graph
MCP daemon was reused. Kiraidaar ports 3000/3210/3211, Dental IVR 5174 and video 5198
were preserved, along with OS/app services and application-managed MCP/CUA helpers.
All foreground check process groups are tracked and reaped. No unrelated process
was terminated. Exact final checks and process status are in
[evidence/validation.json](evidence/validation.json).

## Budget and next stage

The unchanged cumulative ledger has 553 dispatches / 1,106 event rows. The existing
USD 0.50 allowance starts at dispatch 427; conservative usage USD 0.179543525,
remaining USD 0.320456475. Unknown reservations remain counted. Cleanup made zero
inference calls and contacted nobody. See [evidence notes](evidence/README.md).

[Commit plan](2026-10-18-commit-plan.md) separates evidence, runtime/tests, retired
infrastructure/tooling, documentation and unrelated work. No staging, commit,
push, deployment or held-out evaluation happened during cleanup.
