# Commit plan — cleaned working tree

> HOLD for user review: [authority repair audit](2026-10-18-authority-boundary-audit.md) closes AUTH-01/AUTH-02 with904 current tests and3 adversarial probes passing. No commits or blind evaluation started.

Planning only: nothing staged, committed, pushed or deployed by this task.
Base: `2a77ead22c5a8dc365b58806f38accd4f959b2bd` on
`pass1/golden-and-repairs`. The checkout already contained the ordinary-tools
implementation and tariff integration. Cleanup preserved that work and removed
retired dependencies around it. Review the complete final diff, not only this
cleanup's delta.

## Proposed sequence

1. **`feat(tariffs): retain public tariff sources and dated reference evidence`**
   - Add `data/reviewed-tariffs/full-scope-2026`, updated coverage-gap data and the
     deduplicated evidence packet/index.
   - Include original-source hashes, research conclusions, effective-date limits,
     prior validation summaries and unchanged cumulative budget accounting.
   - JSW/GAC publication dates do not establish current authority. OCT wharfage
     and conditional berth treatment remain distinct. Preserve all 16 identities.
   - Validation: original 17-file parity, all 79 canonical data hashes unchanged
     during cleanup, evidence-index byte/hash recovery. This commit adds evidence;
     executable support follows in commit 2.

2. **`refactor(agent): use stateful business tools and retire interpreter orchestration`**
   - Stage `src/lib/portia`, the ordinary agent/complete-step model wrapper,
     chat route, model/config/contracts, Convex tool-history fences and remaining
     source helper changes together.
   - Include new Portia suites, changed memory/state/model tests, migrated live
     cancellation/timeout/authenticated-input tests and retired interpreter test
     deletions. Preserve historical receipt replay and corrected quote reopening.
   - Remove interpreter-only audit runners and their exclusive budget tests in
     this same commit; retain the current cost ledger as evidence, not a runnable
     budget guard. A future live evaluation needs a separately checked budget guard.
   - Include `.env.example` removal of obsolete model-switch variables. Do not add
     either private `.env` file.
   - Validation: current regression suite, typecheck, lint and build pass. The two
     original expected failures are now ordinary passing tests. The separate
     adversarial gate now passes all three probes. Include the exact-operation
     authority module, schema/route/memory integration and new authority tests
     in this coherent runtime commit. User review still precedes any commit or
     evaluation freeze.

3. **`chore(repo): remove retired deployments and repair local verification tooling`**
   - Remove tracked Python backend, duplicate `backend/ports`, Supabase schema and
     memory prototype and five unused Next scaffold SVGs. Their historical implementation remains at the base commit.
   - Stage the canonical asset-hash test, Node22 lab entrypoint/package script,
     retired free/mock-mode refusal, current-checkout credential fallback and
     reproducible audit output directories together.
   - Include ignore rules, ESLint exclusions for disposable evidence/builds,
     obsolete TypeScript exclusions, and Next/Vercel packaging exclusions.
   - Validation: lab/browser TypeScript syntax, retired-mode rejection before any
     lab creation, synthetic provider-cancellation reproducer, production build
     and both chat-route asset traces.
   - Deleted ignored build/run files have no Git patch; their disposition is in
     the evidence manifest. Do not stage `.local`, `.next*`, `output`, env files,
     caches or the private temporary recovery snapshot.

4. **`docs: replace stale experiment handoffs with current coverage and verification limits`**
   - Stage README, architecture, memory-tooling instructions, current coverage,
     current tariff/source/test audits, cleanup report and this commit plan.
   - Delete the explicitly reviewed superseded interpreter plans/reports. Retain
     source approvals, historical requirement documents (clearly labelled), memory
     and deployment acceptance, and useful operational/rollback context.
   - Validation: links in current documents resolve; historical records may name
     deleted raw paths and are expressly identified as provenance, not instructions.
   - State that local verification is not production acceptance or proof of unseen
     language reliability. No old development screen is relabelled as held out.

## Kept separate from these commits

- `src/components/chat/model-selector.tsx`: pre-existing UI change, byte-for-byte
  preserved. Review separately as **`ui: display the selected runtime model`** if
  wanted; do not mix it into cleanup. Compatibility aliases still exist server-side.
- `AGENTS.md`: pre-existing workspace/process instructions, byte-for-byte preserved;
  separate tooling/documentation review.
- Three untracked user/previous-task handoff prompts under `docs/`: preserved,
  not assumed disposable and not automatically included in product commits.
- `.local` UI/release/credential material and private backend deployment metadata:
  retained locally and ignored. Credentials, snapshots and production data never
  belong in these commits.

`evidence/commit-paths.json` assigns exact current changed/untracked paths to these
four groups or the preserved separate-work group. It is a staging allowlist, not a
command to execute. Future staging should use explicit paths (or NUL-delimited
pathspec files); never `git add .`. Inspect each staged diff and its secret/artifact
boundaries before committing. Untracked copied legacy code was removed before ever
being committed and should not be resurrected just to manufacture deletion commits.

## After commits, before independent evaluation

The original lookup-publication and historical bound-currency gaps are now repaired. Resolve AUTH-01 supplied-price evidence binding and AUTH-02 memory consent; rerun the adversarial gate. Verify
account/project/deployment and rollback state immediately before an authorized
release. Freeze the deployed artifact, runtime model/settings, tariff evidence and
budget. Have a fresh evaluator author unseen conversations and source-derived
answers without implementation, prompt or old-scenario access. Keep answers outside
runtime context; run and score the frozen first attempt without fixes. Any repairs
start a later development cycle and require a fresh held-out evaluation.
