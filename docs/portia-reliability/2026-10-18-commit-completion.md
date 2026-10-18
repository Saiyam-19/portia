# Grouped commit completion — 18 October 2026

**26 local commits:** 25 substantive evidence/runtime/cleanup groups plus this
verification and handoff record. No empty commits, push, cloud deployment, paid
inference or independent blind evaluation.

Branch: `pass1/golden-and-repairs`. Base:
`2a77ead22c5a8dc365b58806f38accd4f959b2bd`.
Runtime/source candidate verified at `9ae7ea323535baeb08a5cbc849311d0242525cb9`. The 26th commit changes
only documentation and retained verification evidence; application/source bytes
remain identical. Resolve its final SHA with `git log -1`.

## Commit series

Each commit body records its problem, scope, behavior and validation limits.
[Exact path-to-commit manifest](evidence/commits-20261018/manifest.json) provides
full SHAs, tree IDs and every included path.

| # | SHA | Logical group | Paths |
|---|---|---|---:|
| 1 | `7080b4120b3f` | feat(tariffs): preserve Mumbai and cruise tariff source documents | 10 |
| 2 | `37fb41b84524` | feat(tariffs): retain JNPA container and logistics schedules | 10 |
| 3 | `b96a71d2ee9c` | feat(tariffs): retain BPCL and KLL liquid-terminal schedules | 4 |
| 4 | `c29e24ad22f8` | feat(tariffs): retain public JSW and ICTPL price evidence | 8 |
| 5 | `63a0d80825fe` | feat(tariffs): retain Jaigarh and western-port reference evidence | 5 |
| 6 | `26f2e22fc9f0` | feat(tariffs): index reviewed rules and explicit coverage gaps | 4 |
| 7 | `df4681a4098a` | docs(evidence): preserve deduplicated primary-source provenance | 85 |
| 8 | `62bab3cf5468` | docs(evidence): retain research decisions and cumulative inference accounting | 74 |
| 9 | `7d40e8269bb0` | feat(agent): add source-backed quotation and approval domain modules | 14 |
| 10 | `2671ffb9d549` | refactor(agent): cut over to guarded ordinary tools and fenced execution | 98 |
| 11 | `0da20187a985` | test(tariffs): cover source components and effective-date boundaries | 7 |
| 12 | `4d98de790c0a` | test(agent): retain quote recovery and current-runtime publication regressions | 13 |
| 13 | `ec31ab595cba` | test(authority): enforce adversarial quote and memory consent boundaries | 6 |
| 14 | `346966f9deff` | chore(lab): use the installed Node runtime for isolated verification | 4 |
| 15 | `543798663953` | chore(build): exclude disposable research and private runtime state | 6 |
| 16 | `44df9bcecee8` | chore(tariffs): remove the duplicate backend tariff corpus | 18 |
| 17 | `482d997f959d` | chore(backend): retire the unused Python serving stack | 20 |
| 18 | `8b65fc770aa4` | chore(storage): remove the retired Supabase schema | 1 |
| 19 | `962a359c6292` | chore(memory): retire the standalone persistence prototype | 16 |
| 20 | `a105cc022d26` | chore(audit): remove interpreter-only scenario runners | 12 |
| 21 | `c416f8ad4dda` | chore(ui): remove unused Next scaffold images | 5 |
| 22 | `53122294765c` | docs: retire superseded interpreter plans and experiment handoffs | 37 |
| 23 | `338f8cb99481` | docs(runtime): document the current architecture and safeguard evidence | 36 |
| 24 | `b65224e7019b` | docs(authority): retain exact-operation audit and browser verification | 26 |
| 25 | `9ae7ea323535` | docs(cleanup): preserve the repository cleanup inventory and commit plan | 30 |
| 26 |This report commit|Verified commit series, preservation record and evaluation handoff|Documentation/evidence only|

The preparatory commits are dependency-ordered review groups, not individually
certified releases. The final integrated tree is the tested acceptance unit. The
serving cutover keeps coupled engine, route, Convex and existing regression
adaptations together rather than leaving an apparently complete partial switch.

## Exact committed-tree verification

A fresh Git archive of the candidate was exported outside the checkout. It had
no private env files and none of the five unrelated local changes. Installed
Node dependencies were reused; model requests were blocked. These are fresh
checks of committed contents, not reuse of the prior dirty-tree test claim.

- Current tests: **904 pass / 77 files**.
- Separate faulty-model adversarial probes: **3 pass**.
- TypeScript: pass.
- ESLint: zero errors; six existing generated-file/login-navigation warnings.
- Production webpack build: pass, Node 22.23.2 / Next 16.3.8; build
  `XPMOOUK22hvwmM15lUOtk` with synthetic local configuration.
- Both chat-route build traces contain all 79 canonical source files and exclude
  env files, Git metadata, local state and research/verification archives.
- All five verification process groups exited. No server was started; existing
  unrelated development services and shared helpers were preserved.

[Commands/results](evidence/commits-20261018/validation.json),
[process receipts](evidence/commits-20261018/processes.json), and
[build log](evidence/commits-20261018/build.log).
The earlier real-local-browser evidence remains in the authority audit. This
commit-only pass did not rerun browser flows on the isolated archive; the UI model
selector difference is expressly excluded from the committed build.

## Preservation

- All 79 canonical data files match entry hashes.
- All 368 provenance mappings recover their original bytes, including gzip bodies.
- Provider ledger remains 1,106 events / 553 dispatches with SHA-256
  `8aba4746ed0bc94a8bdc4b1807f4048d4453f2c9181aa0b5888b6e0e031857e5`. No budget reset or new model call.
- All 549 initially authorized changed/new paths (including the added binary
  attributes file) were committed with exactly reviewed bytes. Existing source
  documents were not reformatted. Git misclassified one PDF as text; explicit
  binary attributes preserve the original bytes and prevent newline conversion.
- Candidate scan found no known private credential values or selected credential
  signatures. Private configuration hashes are unchanged; env files were neither
  staged nor copied to the verification snapshot.
- Final index is empty. These five files remain unchanged and unstaged:
  `AGENTS.md`, `src/components/chat/model-selector.tsx`,
  `docs/CLAUDE_PROJECT_UPDATE_2026-10-17.txt`,
  `docs/PORTIA_SIMPLIFICATION_EXECUTION_PROMPT_2026-10-17.txt`,
  `docs/PORTIA_SIMPLIFICATION_PROMPT_REVIEW_2026-10-17.txt`.

[Preservation verification](evidence/commits-20261018/preservation.json).
The repository is intentionally dirty only for that preserved unrelated work.
Do not deploy directly from that mixed working tree without separately reviewing
those changes; use the selected committed candidate.

## Blind-evaluation handoff and hold

Create a fresh chat without forking this implementation history. Its initial action
is only to acknowledge the frozen candidate and wait for the user's go-ahead.
No deployment or scored evaluation is authorized by creating that chat.

After explicit approval to begin:

1. Keep case authors independent of implementation, system prompts, existing tests,
   audit reports, prior scenarios, provider traces and old answer keys. Author new
   conversations and expected answers from primary source documents only; do not
   use compiled tariff rules as an independent oracle.
2. Freeze and hash the unseen conversations/answer key before exercising the agent.
   Keep answers out of runtime context. Record uncertainty, source version/date,
   applicability and arithmetic separately.
3. Independently verify deployment/account/project, exact commit, model/settings,
   source hashes and rollback context before any separately authorized deployment.
   No candidate edits, prompt tuning, evidence replacement or dependency changes
   during the scored run.
4. Reconcile and enforce the existing cumulative budget before any model call.
   The historical USD 0.50 allowance began at dispatch 427; last conservative totals
   were USD 0.179543525 used and USD 0.320456475 remaining, including unresolved
   reserves 441, 442, 461, 466, 513. Revalidate these totals; do not reset the ledger or
   assume unknown usage is zero.
5. Score the frozen first attempt and report failures as findings. Repairs belong
   to a subsequent development cycle with newly authored held-out cases.

Product contract supplied to the fresh chat should state the user's exact-term
approval requirement for supplied quotations/changes, supplied comparison FX or
rounding, and cross-chat memory writes. Unchanged approved reads, official-source
calculations without supplied FX, chat-only notes and explicit Memory-panel
controls retain their existing semantics. Memory admission commits at approval;
a later quotation-publication failure does not undo approved queued memory.

This report proves the scoped commits and local checks. It does not establish
production readiness, verified current tariff authority, universal language
correctness or absence of all bugs.
