# Portia — split evaluation and API-cost plan (amends the lean plan)

**Date:** 24 October 2026 · **Code base:** `pass1/golden-and-repairs`, fast-forwarded to `522c607` (Codex's lean commits are now on this branch; nothing else changed).
Everything in the lean execution plan stays in force except what this page changes.

## 1. Who does what

| Owner | Work | Owns these paths |
|---|---|---|
| **Claude** (implementer, API cost) | Cut model calls and tokens per turn | `src/lib/migration/domain-agent.ts`, `src/lib/migration/model.ts`, `src/lib/migration/agent-policy.ts`, `src/lib/portia/completion.ts`, `src/lib/portia/tool-schema.ts`, `src/lib/portia/agent-inputs.ts`, history/context construction in `src/lib/migration/conversation.ts`, and the tests those changes break |
| **Codex** (evaluation) | Re-cut the sealed set, build seeding, run the final evaluation | The evaluation harness and sealed materials outside the repo, `scripts/audit/**`, new harness-only tests |

- Codex does not edit Claude's paths; Claude does not read sealed prompts, cases or expected answers. Claude has not seen them.
- If Codex needs an app change, it asks the user to pass the request to Claude rather than editing.
- No new reviews, plan documents or dashboards. Progress notes say what works, what failed and what remains.

## 2. Codex: split evaluation

**Retire the 133-turn set as history.** Stop trimming it. Keep its files unchanged.

**The evaluator context (the one holding custody) re-cuts the sealed set into:**

| Part | Count | Typed turns (approx.) |
|---|---|---|
| Single-step tests, each starting from seeded saved state | 20 | ~30 |
| Full journeys (create → correct → review → approve → compare → reload, plus cross-turn cases) | 4 | ~22 |
| Repeats of 4 predetermined single-step tests | 4 | ~6 |
| **Total** | **28** | **~58** |

Single-step coverage must include each of: issuer vs operator; commenced vs exact periods; GT denominator; tonnes × movements; selected-line comparison; scoped correction; tax presentation; service equivalence and bundles; supplier total vs computed discrepancy with stated rounding; missing vs explicit zero; stale or conditional approval; mixed request with an unsupported part.
The 4 full journeys must include: correction after approval; a comparison requested after a correction; an interruption with explicit follow-up; earlier facts that must survive later turns.
If the user supplies real anonymized supplier quotes, use them as inputs for some single-step tests.

**Seeding rules**
- Starting state is created with zero model calls: replay validated tool calls through the server, or write Convex fixtures through the normal persistence path.
- Seeded chat history must have the same shape as real persisted history (user messages, assistant turns, tool calls and results).
- Record each seed's origin. Seeded state is ideal state; report results with that caveat.

**Pass gate** (replaces 18/20 for this run; approved by the user)
- At least **19/20** single-step tests pass.
- At least **3/4** full journeys complete.
- All **4** repeat pairs semantically consistent.
- **Zero critical failures** across every attempt (wrong figure shown as valid or in review, unauthorised acceptance, leak, unrequested data change).
- No ordinary turn exhausts its step or time limit. A safe, specific "I need X" is recorded as not passed, never as a pass.
- A pass means **ready for a private pilot with real users**, not production. The outside-user gate still applies.

**Run order and money**
1. Wait for Claude's cost changes to land on the branch.
2. Measure one development journey (cap **$0.20**) to re-forecast the full run.
3. Run the 28 cases only if the forecast fits the budget the user approved. Run sequentially. No retries outside the frozen script.
4. **Model:** the harness currently forces `gpt-6-sol`, while the app defaults to `gpt-6-luna`. The final run must use the model the app will actually ship with. That is the user's decision; once made, Claude changes `model.ts` and the harness override is removed.
5. Repair accounting from the lean plan is unchanged: C0 frozen before results, two integrated rounds, one reserved for holdout findings.

## 3. Claude: API cost changes (for Codex's awareness)

Ordered by expected saving. Each item is measured offline before and after on the same serialized requests. No paid calls without user approval.

1. **One model call per turn.** Let `finish_turn` travel in the same step as the business call. The server accepts it only after every sibling call in that step succeeded; otherwise the loop continues and the model repairs. The finish validation runs after the step completes, so it never races the business call. In the measured journey, finish calls were half the cost.
2. **Smaller history.** Drop null-only fields from past tool-call arguments (strict mode makes the model emit every field as null), and keep past tool results to the compact envelope the next decision needs.
3. **Supplier-only tool set for v1, behind a flag.** Removes `official_quote`, `port_information`, vessel and memory tools from supplier-v1 requests, about half of the 71 KB of tool definitions. This is a user decision because it hides official tariffs in v1.
4. **Cache-friendly prompt order.** Fixed instructions first; saved quotes and work results after them. Whether the provider actually caches is unmeasured (all observed `cached_tokens` were 0). Checking it costs about $0.10 and needs approval.
5. **Report:** bytes per request before and after, model calls per turn, and any added calls, using the same corpus.

## 4. Decisions only the user can make

1. **Ship model:** Sol (passed 12/12; about 20× Luna's price per token) or Luna (9/12).
2. **Supplier-only tools in v1:** yes or no.
3. **Budget:** about $1.17 remains of the $3. Expected need after cost changes: about $0.20 for the re-forecast plus about $1–1.50 for the run (estimates).
4. **Key limit:** the OpenRouter key shows a $100 limit. Only the harness enforces $3. Set the key limit to what you are willing to spend.
5. **Diagnostic overspend:** that phase spent $0.93 against its $0.20 allowance (74 calls against a 36-call cap). Confirm you approved it.
