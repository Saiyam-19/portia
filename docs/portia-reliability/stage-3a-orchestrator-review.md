# Stage 3A orchestrator review

Reviewed 2026-10-14T19:10:04.152980+00:00. **Changes required before accepting stage3A.**

Comparison: six-file patch against the original archived dirty baseline; HEAD remains b64420fcfe0eea206918bfb34cf9cf38112b8302. All48 checkpoint artifact hashes match the pinned manifest. Parent reran the independent reviewer's12 zero-inference probes on Node22.23.2 and reproduced identical observations. The recorded352-test suite and build pass do not erase these counterexamples.

## Standards

0 documented-rule violations. Two actionable judgment-call findings: duplicated measurement classification applies different negation semantics; duplicated event classification disagrees between prose and forms. Consolidate these classifiers rather than adding divergent phrase-specific patches.

## Spec

### B1 P1: Negated form labels manufacture GT
Location: `src/lib/migration/call-context.ts:95`.
Observed: Deadweight tonnage (DWT), not GT with submitted12345 establishes GT12345. Raw field classification and negation-normalized conflict checking disagree.
Required: Use one canonical negation-aware measurement classification for emission, conflict and unit validation.

### B2 P1: Explicit units are silently replaced
Location: `src/lib/migration/call-context.ts:200`.
Observed: 12000 DWT submitted in a GT field establishes both GT and DWT; LOA500feet and draught30ft establish500metres/30metres.
Required: Parse units together with values. Convert only supported transformations with provenance or retain a focused conflict; never manufacture another dimension.

### B3 P1: Rejected values supersede established facts
Location: `src/lib/migration/call-context.ts:212`.
Observed: Do not use30hours replaces10hours; an end-time correction13:00, not12:00 restores the rejected12:00.
Required: Apply assertion/negation scope consistently before reducer operations; retain unchanged valid facts.

### B4 P1: A new leg reuses the old call scope
Location: `src/lib/migration/call-context.ts:166`.
Observed: Next leg for vessel Alpha: Jaigarh inherits the preceding Mumbai start/end and reports2hours.
Required: Separate vessel identity from call/leg identity. Explicit new-leg intent must invalidate call-specific timing/location/service dependencies.

### B5 P1: Form event corrections leave stale events
Location: `src/lib/migration/call-context.ts:101`.
Observed: Arrival-at-anchorage09:00 becomes intervalStart while old anchorage08:00 survives; berth10–12 yields a false1hour full visit08–09. Cargo completed forms also lose canonical meaning.
Required: Share event classification across prose/forms; replace the intended fact and derive intervals by event roles/scope. Do not sort reversed timestamps into apparent validity.

### B6 P2: A rejected terminal leaks a nested alias
Location: `src/lib/migration/port-identity.ts:42`.
Observed: Use Jaigarh, not JSW JNPT Liquid Terminal becomes Jaigarh/JNPA ambiguity because JNPT survives rejection of the longer label.
Required: Resolve maximal mention spans before applying assertion/negation, retaining correct positive aliases.

## Repair and acceptance gate

Reproduce each counterexample as a failing regression before repair; include positive unit conversion, compatible form units, normal corrections, same-call updates, new legs, prose/form parity and nested positive aliases. Add generate/stream integration for corrected context supplied to the real agent path. Do not weaken frozen independent inputs or substitute broad refusals. If parsing is genuinely ambiguous, retain proposed/conflicting evidence and ask only about the affected fact. Preserve independently valid work.

Re-run relevant tests, full offline suite, typecheck/lint and affected build. Keep provider calls and paid spend at zero; no deployment. Return exact changed hashes/diff and release ownership again.

Existing rejected historical GT also failed a probe, but predates this batch; keep it as an open B obligation without falsely attributing it as a new regression. CE01/02 and visible CE04 remain explicitly deferred.

Evidence: `output/reliability-stage3a-review-20261015/review.json`, `probe.cjs.txt`, `reviewer-observed.json`, `orchestrator-observed.json`.

Standards:2 judgment findings (0 hard violations), worst: inconsistent field interpretation. Spec:6 findings (5P1,1P2), worst: incorrect established measurements/call facts. No end-to-end approval.

## Authorized evidence packaging

The original CommonJS probe is retained byte-identically as `output/reliability-stage3a-review-20261015/probe.cjs.txt` so ordinary project lint does not treat immutable review evidence as application code. SHA256: `ea9ba9d130fc7c89ab04036a6cafc3fdb8abaa5996e3f3bffaad8253c0e6acf5`. To reproduce, copy this text artifact to an agent-owned temporary `.cjs` file and run it with Node 22 from the same checkout. The original executable also remains at `/private/tmp/portia-stage3a-spec.XEGzYU/probe.cjs`. No counterexamples or recorded observations changed. Orchestration explicitly authorized this filename/documentation change during R1.
