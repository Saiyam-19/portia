# Grounded calculations and structured-output recovery

Goal: separate observed model errors from application defects, enforce source-bound calculation inputs, recover malformed form output, and rerun only original failures/execution errors at zero provider price.

Evidence: saved local Convex messages show case 3 used an invented 22 October timestamp; case 7 invented a 0.05 rate, obtained 120000, then displayed 1200000 and a different rate; case 11 reversed its arguments after the time tool rejected them. The calculators returned correct results for their supplied inputs. Existing prompts do not enforce provenance or bind final answers to tool evidence. Five old interruptions occurred after tool-only checkpoints; two targeted replays did not reproduce them. Their exact rejected form subtype was not retained and must not be asserted as proven.

Implementation:
1. Pure request-evidence helper: only authenticated user messages/form submissions are source facts. Extract supplied timestamps and current particulars; detect negative GT, impossible/reversed dates, stated-duration conflicts and guaranteed-port-bill requests. Bind time-tool inputs to original evidence, resolving unique partial timestamps without guessing.
2. Main-agent evidence guard: disallow quote arithmetic without supplied rates or a consulted tariff; keep verified calculation records; reject invented time inputs and altered monetary results with a deterministic, clearly qualified response. Preserve ordinary specialist flows and incomplete-data clarification.
3. Model boundary: normalize only safe representational form differences (null optional properties / absent required flag / non-radio options). Recover unparseable form output as bounded plain clarification. Defer mixed form calls until executable tools finish. Buffer each bounded model step before exposing an invalid result; do not add paid retries.
4. Local regressions first for original failure patterns and nearby counterexamples. Check SDK-compatible generate/stream behavior, persistence, and existing tests. Deploy any changed backend dependency before acceptance.
5. Rerun cases 1, 2, 3, 5 (both original messages), 7, 10, 11, 12, 13, 14, 17 only. Coverage-only blocks 4, 15, 16 and prior passes are excluded. Pin the same free model/key and preserve original input hash. Record model calls avoided by deterministic validation and any unresolved model limitations.

No tariff expansion, production model switch, paid fallback, or new user-owned chat task. Preserve unrelated dirty work and shut down owned test processes after recording evidence.

Live rerun finding: the first attempt at case 1 substituted Mumbai's tariff for Chennai and displayed an inconsistent total. Saved separately as `output/agent-root-causes-20261014/pre-port-guard-scenario01.json`. Added a pricing-scope port/terminal check before loading a specialist, passed the original user request/current validated facts to the specialist, and recorded specialist arithmetic so consulting a tariff no longer bypasses final amount verification. The final acceptance rerun uses the rebuilt version of all these changes.

Streaming: ordinary non-price replies retain incremental text. Financial/time answers and tool arguments are bounded and validated before release. Mixed forms are dropped from the executable step; the normal next step may ask a fresh question using the tool results. This is not an automatic model retry. Cancellation is checked both before output and while price output is buffered.
