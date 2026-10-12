# Production agent acceptance — 13 October 2026

Tested the actual public site, `https://portia-berthing.vercel.app`, in Brave with two synthetic email/password accounts. Real paid Model 1 and Model 2 calls, production Next.js routes, production Convex persistence. No mocked inference or local preview.

## Fixes released

- `951e529`: reopening a Model 2 conversation or pending form previously reset its selector to Model 1. The owner-checked conversation query now returns the last recorded run's model; the client restores it without relying on browser storage. The original pending production form retained Model 2 after deployment and reload.
- `cadc948`: after signing out, successful sign-in could return to login. Reproduced in both account-switch directions despite successful server authentication; a full document load recovered the session. Successful email authentication now starts a fresh document, clearing stale client session state. Both directions then succeeded on the first attempt.

Final frontend: `dpl_3N2yYGNrFPUYu4DeMZcttsJtkjKK`, Ready, runtime commit `cadc948112f9f7278a73dea25b9f48bffd1bb257`. Backend: `o-one-labs:portia:prod`, `joyous-kookabura-196`. Production schema, indexes, model configuration and secrets were unchanged. The frontend's clean production builds succeeded; 127 tests across 28 files, TypeScript and lint passed.

## Observed results

| Journey | Result |
| --- | --- |
| Both paid models → interactive GRT form → tariff specialist → calculator → saved response | PASS. Historical KLL berth-only fixtures produced ₹212,400 for 20,000 GRT and ₹106,200 for 10,000 GRT. Each specialist logged four calculator calls and HTTP 200. Both identified the dated tariff and supplied test FX rate. |
| Pending form reload and continuation | PASS for both models; exposed and verified the model-restoration fix above. |
| Required form cancellation without supplying GRT | PASS; persisted Cancelled and acknowledged cancellation. |
| Stop response | PASS; saved `stopped`, no active run, interrupted-output warning survived reload. |
| Memory writes and per-chat notes | PASS for both models. Exact synthetic facts and distinct note markers persisted. |
| Cross-chat recall | PASS for both models. Returned `ORBIT-1310` without that value appearing in the new prompts. |
| Forget and note invalidation | PASS through the product memory API, including identical-request retry. Removed only the currency fact, retained callsign, invalidated notes. A new Model 2 chat returned callsign, currency “not saved,” and no working notes. |
| Saved chats after fresh sign-in | PASS. Sidebar reopen restored both estimates, submitted forms, correct models, and notes before intentional forget. |
| Account isolation | PASS in browser and API. B had no A chats or memories; A's direct chat URL was unavailable; foreign conversation query returned null and foreign memory returned 404. |
| Vessel tools | Both search and detail tools executed and reported lookup unavailable. Production has no `VESSEL_API_KEY`; manual particulars remain necessary. Successful upstream vessel lookup was not tested. |
| Empty tariff handling | PASS. BPCL cargo jetty reported its empty reference; no invented estimate or substitution of the liquid cargo jetty. |
| Source-chat deletion | PASS through the product API. Deleting the callsign's source conversation removed the remaining remembered fact. |

The original Model 1 calculation preceded the fixes; Model 2 continuation used the first fix. Both saved results were reopened on the final release, and its Model 2 recall ran live. The second fix changes authentication navigation only. No duplicate tariff runs were purchased merely to repeat unchanged agent code.

Provider account usage rose from $0.2971203 to $0.5265502: **$0.2294299** observed delta for this run. This is an account-level measurement, not an isolated provider invoice. The final deployment's error-level runtime-log scan was empty. A read-only cleanup request timed out once and was resumed; no inference was replayed.

## Preservation and cleanup

Both protected UI stashes and all three protected UI refs are unchanged. All 431 inventoried files across the retained migration and memory worktrees remain byte-identical, including executable bits. Fixes touched only the active authentication/conversation behavior and regression tests; no separate UI work was applied.

All four synthetic chats and their visible memories were removed through product APIs. The browser was signed out. Permanent deletion of the two synthetic auth accounts was rejected by automatic approval review because testing authorization did not explicitly include irreversible account deletion; approval was requested separately. No accounts were deleted by the rejected action. A temporary internal cleanup function was removed afterward.

Evidence is in ignored `.local/prod-acceptance-20261013/`: provider spend, persisted messages/tool statuses, form states, function-contract comparisons, deployment/build logs, deletion checks, preservation hashes and runtime-log scan. Screenshots are in the task's visualization directory. Private test credentials are excluded from Git.

No local application server was started. Existing browser and unrelated application listeners were preserved. This is bounded production acceptance, not exhaustive coverage of every tariff, provider outage, load level or long-history edge case. Upload/document RAG and email recovery remain outside the implemented feature set.
