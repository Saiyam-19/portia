# Non-UI commit inventory and plan — 2026-10-12

## Goal and binding scope

Identify any remaining uncommitted work worth committing, without importing chat UI work from other chats. This is a **planning-only** task: no staging, commits, pushes, stash application, history rewriting, deployments or worktree cleanup.

**Recommendation: zero additional application-code commits.** The migration and memory implementation are already integrated and published on `main`. The apparent leftovers are older working copies, not a second release to commit. The only new non-ignored file created by this planning task is this plan.

## Verified baseline

- Repository: `/Users/saiyamchaplot/Documents/portia-main`.
- Local `main`, cached `origin/main`, and a fresh `git ls-remote origin refs/heads/main` all resolve to `c43ee39c5f66bda0daf6d9a763693d2f0893693a`.
- Main's index and working tree were clean at inventory start: no staged changes, tracked modifications or non-ignored untracked files.
- Published implementation commit: `56c274db7aa072bd86cf7c0c0b96e4cee833de26` — migration plus persistent memory integration.
- Published follow-up: `c43ee39c5f66bda0daf6d9a763693d2f0893693a` — hosted acceptance documentation and excluded test-harness hardening.
- Both retained worktrees are detached at older base `ec30d1537edd5819b5c226e2ba670bf7bfba88ad`.
- Inventory evidence: ignored `.local/commit-planning-20261012/inventory.json`. It records per-file SHA-256, kind, executable flag, current-main comparison and UI classification. No secret contents were included.

## Inventory result

| Location | Untracked entries relative to its old HEAD | Comparison with current main | Decision |
| --- | ---: | --- | --- |
| Main checkout | 0 before this plan | Clean and published | No runtime commit needed |
| `portia-convex-migration/portia-main` | 116 | 102 untracked files identical; 14 untracked files already tracked on main with newer contents | Do not recommit or copy back |
| `memory-persistence-prototype/portia-main` | 155 | All 155 untracked files byte-identical to tracked main files | Do not recommit |
| UI source stash | 40 paths | Separate preserved UI work | Entire stash excluded |
| UI mock stash | 6 paths | Three mock PNG/JSON pairs | Entire stash excluded |

The 271 worktree entries are a sum across two overlapping checkouts, **not 271 unique new files**. Every existing, non-ignored worktree path is already tracked on main. No unique non-UI source path was found.

The migration checkout has 196 existing source files in this comparison: 169 match main and 27 differ (20 non-UI, seven UI). Its 162-file import-baseline manifest still matches the retained source exactly, with zero mismatches. The non-UI differences were inspected: main adds memory integration, deletion fencing, auth-bootstrap corrections, runtime packaging and production documentation. Copying older files back would remove those changes.

The memory checkout has 235 existing source files: 232 match main. Its only differences are:

- `.vercelignore`: main additionally excludes `prototypes/` from deployment.
- `README.md`: main repairs the older literal-newline formatting and records hosted production acceptance.
- `docs/deployment.md`: main adds the actual production target and rollback guidance.

Main also contains the later `docs/memory-production-acceptance.md` and `scripts/memory-production-e2e.mts`, which are absent from the old memory checkout. Preserve them.

## Protected chat UI work

Related chats identified read-only:

- **Refactor chat UI to match Codex** — `01a11fdb-1d5e-7942-9e42-91cbca3da3f9`.
- **Start dev server on claude/ui-refr** — `01a11d43-22e8-7032-8d0f-ee87533dcec9`.

Protect these exact objects; stash ordinals are informational and may move later:

| Object | Identity | Protection |
| --- | --- | --- |
| UI source stash, currently `stash@{1}` | `3bbb3277e94814e552036a54413265e824ad6dca` | Do not apply, stage, pop or drop |
| UI mock-assets stash, currently `stash@{0}` | `784d328eeac04d91d1f1f729dfe8892901be6795` | Do not restore or commit mock assets |
| `claude/ui-refactor`, including its remote ref | `ec30d1537edd5819b5c226e2ba670bf7bfba88ad` | Do not merge or cherry-pick this UI branch |
| `codex/ui-refactor` | `8d3e79c824e09c758ff406b8eb7a592e43bb9c12` | Leave branch and its separate preserved work untouched |

The source stash contains UI-related changes in shared files too, including `.gitignore`, `package.json` and `package-lock.json`. Do not select those wholesale merely because their filenames are not UI components. The migration plan also appears in that stash; leave the whole stash excluded rather than partially applying it.

### Hard staging exclusions for this scope

- `src/components/**`, including chat, dashboard, memory-panel, migration-preview and UI primitives.
- All `.tsx` files; app page/layout files; `src/app/globals.css` and other presentation styles.
- `src/hooks/**`, `src/lib/portia/**`, `src/lib/utils.ts`.
- Chat presentation/state integration: `src/lib/migration/client-state.ts`, `src/lib/migration/transport.ts`, corresponding client/render/layout tests, and browser-UI harness changes from the UI work.
- `DESIGN.md`, `PRODUCT.md`, `components.json`, `.impeccable/**`, mock images and screenshots.
- UI-origin hunks in shared package/config/ignore files.

This excludes **new staging** of UI work. It does not authorize deleting or rewriting UI already present in published main. A backend change that cannot work independently without an excluded UI change must remain uncommitted as a combined feature; do not ship a broken partial feature to satisfy a file filter.

## Commit disposition

| Proposed unit | Current disposition | Why |
| --- | --- | --- |
| Migration backend, schemas, agent tools, calculator and tariff assets | **Skip — already published** | Present in `56c274d`; older checkout is superseded |
| Memory runtime, coordinator, snapshots, notes and non-UI tests | **Skip — already published** | Memory worktree's new files match main |
| Hosted test harness and acceptance evidence documentation | **Skip — already published** | Included in `56c274d` / `c43ee39` |
| Chat UI refactors, mockups and preserved stashes | **Excluded** | Explicit user boundary |
| This planning document | **Optional documentation-only commit, if later requested** | Sole newly created candidate; no application changes |

Do not reconstruct artificial feature commits from the already-pushed integration commit. Do not reset main, force-push, or split published history under this request.

### Optional documentation commit

Suggested title: `docs: record non-UI commit inventory and staging boundaries`

Exact allowlist:

```text
docs/superpowers/plans/2026-10-12-non-ui-commit-plan.md
```

Contents: verified refs, duplicate/superseded-work disposition, UI ownership exclusions, and the safe execution gates below. Do not include the ignored machine-readable inventory, evidence directories, any source/UI file, private environment file or stash content.

Acceptance: the staged diff contains only this document; main still resolves to the expected parent before committing; UI refs/stashes remain unchanged. No runtime tests or build are needed for this documentation-only change. This task does not execute the commit.

## Execution gates for any later authorized commit

1. **Refresh baseline.** Run `git status --short --branch --untracked-files=all`, inspect the index and stash hashes, and recheck remote main. If main moved, compare against the fresh baseline; never overwrite newer work.
2. **Reclassify a genuine delta.** Compare contents and executable bits against current main, not the detached worktree's historical HEAD. A `??` status in an old worktree alone is not evidence of missing work.
3. **Use an exact path/hunk allowlist.** Default-deny UI and mixed ownership. No `git add .`, `git add -A`, broad directory staging, whole-worktree copy, blanket stash application or blind branch merge.
4. **Keep scope coherent.** Co-locate a real non-UI behavior change with its meaningful regression and required configuration. There are currently no such pending units. New feature work requires a newly enumerated commit plan rather than silently expanding this one.
5. **Inspect staging.** Use `git diff --cached --name-status`, `git diff --cached --stat`, `git diff --cached --check`, and the full staged diff. Every path must be on the exact approved allowlist and outside the UI exclusion set. Inspect shared manifests by hunk.
6. **Check secrets/artifacts.** Exclude `.env.local`, `backend/.env`, credentials/tokens, `.local/`, `.next/`, `.vercel/`, `.claude/`, dependency directories, caches, SQLite runtime images, screenshots, logs and temporary reports. `.env.example` is eligible only for a separately justified, sanitized non-UI configuration change; none is pending here.
7. **Validate proportionately.** For a genuine future runtime delta: run the relevant regression, typecheck and lint; build only when the affected surface requires it. The existing 123-test result is baseline evidence, not proof of an unreviewed future edit. Check processes first and reuse compatible services.
8. **Commit only the reviewed allowlist.** Recheck the staged names immediately before the commit. Preserve unrelated work and the exact protected stash/branch objects. Publishing or deployment is not implied by a commit-planning request.

## Preservation and completion

Do not archive/delete the retained worktrees or remove their ignored private configuration/evidence as part of this plan. No other chat was messaged or modified. No service, watcher or test process was started or stopped during the inventory.

Planning is complete when the inventory is reviewable and only this requested plan appears as a new non-ignored file on main. There is no outstanding application-code commit queue under the current non-UI scope.
