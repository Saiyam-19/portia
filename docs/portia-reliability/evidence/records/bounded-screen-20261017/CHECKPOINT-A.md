# Checkpoint A — offline guard passes; live dispatch blocked

17 October 2026. **$0 spent; 0 actual provider dispatches; $0 outstanding; $1.50 remains.** No case authorship, application conversation, build, deployment or application edit. The sole network request made by shell was an unauthenticated GET of public pricing metadata; documentation was read through web tools.

## Files and scope

- `scripts/audit/bounded-screen-guard.mts`: test-specific adaptation of the retained Mumbai guard and pass2 budget checks. No live transport, preload, SDK or service launcher. `createOfflineGuard` requires an explicit fake transport and rejects the study's blocked manifest.
- `tests/migration/bounded-screen-guard.test.mts`: 18 focused offline tests; native Node test runner, one process plus one short-lived serial child for the cross-process fence check. Global fetch throws in tests; the child has an empty environment and never reaches its fake transport.
- This evidence directory: blocked manifest, zero-call study ledger, pricing snapshot, saved-wire replay summary, check logs and preservation/process records. Existing evidence and fixtures unchanged.

Application identity: HEAD `2a77ead22c5a8dc365b58806f38accd4f959b2bd`, branch `pass1/golden-and-repairs`, tested `.next/BUILD_ID` `Wkf4nBgG3birbDjx0ns-j`. All eight original tested-source checksums match. All 182 files in the expanded freeze match after work; no additions in frozen `src/`, `convex/`, `data/` scopes. Existing six tracked dirty files remain as found. See `frozen-candidate.json`, `verification.json`, and before/after git status.

Graph: existing daemon reused. Coverage generation `2026-10-17T10:42:38Z`, metadata match for call-context, model, domain-agent, pass2-budget and memory-chat-lab. Prior output and `.local` runner are excluded by design, so inspected directly. No holdout/Phase A variants or personal memory read.

## Checks

Node `/opt/homebrew/opt/node@22/bin/node`, v22.23.2. Final commands all **exit 0**:

```sh
PORTIA_BOUNDED_EVIDENCE=output/bounded-screen-20261017 /opt/homebrew/opt/node@22/bin/node --test --experimental-test-isolation=none --test-concurrency=1 tests/migration/bounded-screen-guard.test.mts
/opt/homebrew/opt/node@22/bin/node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module nodenext --moduleResolution nodenext --allowImportingTsExtensions --strict --skipLibCheck scripts/audit/bounded-screen-guard.mts tests/migration/bounded-screen-guard.test.mts
/opt/homebrew/opt/node@22/bin/node node_modules/eslint/bin/eslint.js scripts/audit/bounded-screen-guard.mts tests/migration/bounded-screen-guard.test.mts
```

Results: **18/18 tests**, scoped typecheck and lint clean. No full application suite rerun. Logs: `offline-tests.txt`, `typecheck.txt`, `lint.txt`; exact checks and hashes: `verification.json`.

Covered: exact cap boundary and one-nanodollar-over rejection; settled charges plus next reservation; retained reservations after missing/invalid usage, HTTP/transport errors or incomplete streams; two-per-turn and 40-total counts across guard reopenings; existing schema repair; duplicate bodies; another OS process rejected during an outstanding dispatch; stale lock not stolen; source/config/environment/input/key drift; submitted values and submit/cancel notes; generated outputs allowed and captured separately; valid zero/positive usage settlement; reservation/token overruns stop; ledger reset/missing ledger blocked.

The actual saved Mumbai requests were replayed byte-for-byte through fake transport returning retained responses: opener, 10,000 GT reply carried in a cancelled form's note, and 12,000 GT correction. All three pass. Their finalized JSON sizes are **10,700 / 62,580 / 120,271 bytes**. Their historical costs sum exactly to **$0.1203828 in the temporary simulated ledger**, excluded from this study's actual spend. See `saved-wire-replay.json`. This proves guard compatibility with those captured wires, not live model/app acceptance.

Synthetic form tests separately cover submitted fields and both submit/cancel notes. Frozen policy binds user-entered strings and input kind; unpredictable model-generated field names, labels and field order need not be frozen. Field names remain captured for later oracle review. Ordinary generated assistant/tool contents are not forced into the input allowlist. The later finite reply policy still needs to select the correct value for each actual question; this milestone does not author that policy.

## Reservation logic and exact blocker

The offline ledger uses nanodollars, atomic exclusive filesystem locks, fsync and atomic rename. Before fake transport it reserves:

`accounted prior calls + input-token ceiling × worst input price + max_tokens × worst output price + request charge <= 1,500,000,000 nanodollars`.

Unknown/incomplete calls retain their full reservation and halt. Successful usage must have finite nonnegative cost, integer token counts, coherent totals, and counts within the fake contract. Cost rounds up to a nanodollar. Actual cost above reservation is recorded and halts. One unfinished row blocks all other dispatches, including after reopening the guard; a crash-held file lock is never automatically removed. No automatic retries.

**The fake token contract is not a live token proof.** Wire byte length is only a local payload-size guard. The old `UTF-8 bytes + 4096` rule was not reused as an established bound. Known historical token counts are sanity checks only.

Read-only [current endpoint metadata](https://openrouter.ai/api/v1/models/openai/gpt-6.1-sol/endpoints), retained in `provider-endpoints.json`, lists these standard OpenAI/Azure prices:

| Tier | Prompt / million | Cache write / million | Completion / million |
|---|---:|---:|---:|
| Below long-context threshold | $2 | $2.50 | $10 |
| From 272,000 prompt tokens | $4 | $5 | $15 |

The same snapshot lists context length 1,050,000 and 922,000 maximum prompt tokens for these standard routes. Other regional/service-tier routes have different prices. No provider was pinned or switched.

[Provider routing documentation](https://openrouter.ai/docs/guides/routing/provider-selection) describes prompt/completion/request `max_price` filtering. It does not establish a cache-write ceiling or a bound on transformed prompt tokens. [Prompt-cache documentation](https://openrouter.ai/docs/guides/best-practices/prompt-caching) confirms automatic cache-write charges on GPT-5.6 and later. [API documentation](https://openrouter.ai/docs/api/reference/overview) describes provider-dependent tool serialization. [Reasoning documentation](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) says reasoning and visible tokens generally share the output limit, but its cross-provider example can exceed the nominal limit; exact permitted-route behavior still needs supporting evidence.

**Missing evidence:** a defensible upper bound on billed native prompt tokens for the finalized request, including provider-added message/tool/schema/template overhead; confirmed worst cache-write/request charges for every permitted route and long-context tier; a defensible output bound including reasoning. `max_price.request: 0` is present in the old wire, but absent request-price fields in endpoint metadata alone are not proof of zero charge. No provider-side token-count or enforced input cap was verified in this milestone.

For illustration only, reserving the full 1,050,000-token context at $5/million plus 8,192 output tokens at $15/million gives **$5.37288** before any other charge. That is deliberately pessimistic and cannot fit $1.50. It is **not** the cost of these short finalized requests, **not** a prediction of screen cost, and **not** proof that $1.50 cannot fund the screen. The illustrated bound in `manifest.json` is explicitly unapproved for live use.

Consequently **live dispatch remains disabled**. Lowering the reserve using historical ratios, assuming an arbitrary overhead allowance, changing normal Model 1 privacy/reasoning/provider routing, or making a paid probe would bypass the plan's gate. None was done.

## Parent decision and next commands

Checkpoint A is ready for review **with the live budget-bound requirement unresolved**. Review the concrete missing evidence above before releasing authoring. No new user approval is requested. The original $1.50/40-dispatch authorization remains unchanged.

No paid command is proposed while blocked. If the parent supplies/accepts sufficient bound evidence, the next narrowly scoped work is the live transport hookup and phase-manifest sealing around this same durable ledger, followed by these same focused checks. The author/format-repair package and Checkpoint B are still unimplemented. Do not reset or replace the study ledger when adding those stages. No author request, case regeneration, new framework or product change is authorized by this report.

Safe review commands, if needed:

```sh
cat output/bounded-screen-20261017/state/ledger.json
shasum -a 256 -c output/mumbai-full-replay-20261017/tested-source-sha256.txt
```

## Process cleanup

No server, lab, build, watcher, browser or persistent worker started. Short check processes and the single concurrency-test child exited normally; no owned survivor found afterward. **Stopped: none. Reused: shared graph daemon only.** Existing Kiraidaar services on 3000/3210/3211, Dental CRM on 5174, the existing 5198 listener, graph daemon on 9749 and app-managed helpers preserved. Ports 3022/3220/3221 remain closed. Application-managed helpers could not be safely assigned to individual idle chats, so none were terminated. See `processes-after.txt`, `preserved-process-cwd.txt`, `listeners-before.txt`, `listeners-after.txt`.

Tariff applicability **NOT ASSESSED**. No product reliability conclusion; six-case screen not begun.
