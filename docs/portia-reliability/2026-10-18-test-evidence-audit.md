# What the existing tests establish

Historical read-only audit, 18 October 2026. The referenced runtime screen/record scripts and raw provider captures were inspected before cleanup, then retired. Findings and cost/acceptance summaries remain; those raw captures cannot now be replayed from this repo. No application edits or new paid inference. Tariff integration has not begun during this audit.

## Conclusion

The inspected serving path uses an LLM with reusable business tools and encoded tariff rules. It is not restricted to the sixteen acceptance prompts. However, reliable handling of unseen natural-language requests has **not been established**. The known cases influenced code and prompt repairs, so these results are development/regression evidence, not a blind generalization evaluation.

## Direct checks

- `src/app/api/migration/chat/route.ts:258–274` constructs the regular agent and streams conversation messages; no injected mock model in that serving call.
- `src/lib/migration/domain-agent.ts:37–85` exposes quote creation/corrections, tariff lookup, comparisons, elapsed time, arithmetic and vessel tools. The model receives hand-authored instructions and facility vocabulary. The instructions include fixes motivated by observed failures, including Jaigarh J-1 identity and supplied timestamp preservation.
- `src/lib/portia/session.ts:101–104` selects official tariff lookup or supplied-quotation calculation from quote data. Encoded rates, applicability rules and arithmetic are intentional application logic; their existence does not demonstrate language generalization.
- The runtime scopes `src/lib/migration`, `src/lib/portia`, and `src/app/api/migration/chat` were searched for the known case identifiers and acceptance-fixture references. No matches were found for the searched literals. This bounded check is not an exhaustive proof against every possible special case.
- `output/full-scope-20261018/screen.mjs` reads fixed prompts and expected outcomes. It sends the question through the browser, obtains real route/provider responses, reads durable state, reloads, then scores against the expected outcomes. Its Unicode transport preflight uses a synthetic response but explicitly removes that interception before running acceptance cases.
- `output/full-scope-20261018/record.cjs` forwards requests upstream, records provider requests/responses and enforces the existing budget. It does not supply acceptance answers.
- Checked the initial provider request for every sixteen-case full-screen entry and all four targeted reruns: twenty request records identify `openai/gpt-6-luna`, contain the submitted user question, contain no acceptance case ID in model messages, and have no `expected` field in the browser submission. Combined with the harness reads, this supports separation of the answer key from the live model input; it does not make the development process blind.
- `tests/portia/functional-finish.test.ts:11–20`, `tests/portia/route.test.ts`, `tests/portia/identity-followup.test.ts`, and `tests/portia/jaigarh-item-repair.test.ts` include scripted/mock model outputs. These test code behavior and safeguards. They are not evidence that a real model understands unseen wording.

## Limits in the recorded result

The360 passing affected tests are not360 real-model conversations. The sixteen catalog outcomes combine twelve scoped pricing examples and four source-gap responses, including targeted reruns after fixes and results retained from an earlier build. The first complete screen had four literal failures. Automatic checks initially missed two defects, subsequently found through literal review. See [recorded acceptance results](../../docs/portia-reliability/evidence/records/full-scope-20261018/acceptance-results.json) and literal-review findings summarized in the retained acceptance record.

Unsupported charge families, unresolved source applicability and unavailable live vessel lookup remain coverage boundaries. Correct behavior for an unsupported or ambiguous request is a precise limitation or clarification, not an invented amount. Even supported requests can suffer extraction, routing or conversation-state mistakes; the existing examples do not measure their unseen failure rate.

## Next evidence needed

Freeze a candidate before authors see results. Have an independent evaluator create a held-out set from the product requirements and source documents without inspecting implementation, prompts or previous scenarios. Include new quantities, boundary dates, alternate wording, typos, omitted/conflicting facts, multi-turn corrections, mixed requests, unsupported services and injection attempts. Keep reference answers outside model/runtime context. Run the ordinary app with real model calls and score the first unmodified run, including saved state and reload behavior. Any later repaired cases become regression tests; generalization claims then need a fresh held-out set.

Passing such a set would estimate reliability within its coverage, not guarantee correct handling of every possible message.

Graph evidence: project `Users-saiyamchaplot-Documents-portia-main` ready; relevant runtime paths reported metadata-match/no recorded coverage issue. Acceptance files under `output` are excluded by design and were inspected directly. No persistent process was started; shared listeners were preserved.
