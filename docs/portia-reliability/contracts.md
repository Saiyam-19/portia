> Historical specification/review. Implementation and coverage changed; use [current coverage](../portia-coverage.md) and [cleanup report](2026-10-18-repository-cleanup.md). Old experiment paths are provenance, not runnable instructions.

# B/C/D/E interface review proposal

Version `reliability-v1-draft`, 14 October 2026. **Design only; not implemented or approved.** Targets the existing Next.js 16.3.8 / AI SDK 7.0.134 / Convex stack. Installed route-handler and ToolLoopAgent docs inspected. Existing source and saved dirty work take precedence over the stale graph (generation 2026-10-13T18:25:09Z).

## Shared identity and trust

All server-generated records bind to `{schemaVersion, ownerId, conversationId, runId, runFence, conversationRevision, contextRevision, contextHash, sourceRegistryHash, ruleSetHash}`. IDs and hashes are computed/checked server-side, not accepted from the language model or browser. `conversationRevision` is the existing durable state-machine revision; **contextRevision is separate**, because claim/completion increments need not change any fact. Canonical JSON serialization, sorted keys, exact decimal strings and source content hashes define digest inputs. No secret/provider ID is included in public payloads.

Sources are distinct classes: `user-statement`, `submitted-form`, `cancel-note`, `vessel-lookup`, `remembered-fact`, `official-tariff`, `bundled-reference`, `supplied-quotation`, `derived`. A copied string does not change class. Assistant prose, previous answers, tool instructions, memories and source text cannot grant authority. An official document's publication date alone does not establish each clause's validity.

## B: request context — `call-context.ts`

```
CallContextV1
  identity: shared identity
  tasks[]: {id, kind, scopeId, requestedChargeIds[], compareGroupId?, exclusions[], originRef}
  scopes[]: {id, vesselId?, legId?, portCandidates[], selectedPortId?, terminalCandidates[]}
  facts[]: {id, scopeId, field, value, unit, status, revision, origin, supersedes[], dependsOn[]}
  conflicts[]: {id, scopeId, field, candidateFactIds[], reason, affectedTaskIds[]}
  missing[]: {field, scopeId, requiredByRuleIds[], affectedTaskIds[], reason}
  sourceRegistryVersion, previousContextHash

FactOrigin
  messageId OR (formId, toolCallId, fieldName) OR lookupReceiptId OR memoryFactId
  messageRole, rawSpan {start,end,textHash}, parserVersion, receivedAt
  normalizedBy[]: allowlisted lossless transformations; original text retained

FactStatus = proposed | established | conflicting | invalid | superseded | deleted
TaskKind = tariff-price | tariff-rule | supplied-quote | arithmetic | elapsed-time |
           comparison | vessel-lookup | general | memory-action
```

Use immutable facts/operations with a materialized current projection. Fields include GT/GRT, NT/NRT, DWT, displacement, LOA, draught, vessel age/type, cargo type/mass/volume, container count/size/status, voyage class, berth, operation, event times, delay attribution, currency/FX date, annual calls and tax/exclusion instructions. Maintain explicit aliases/normalizations per field; GT/GRT equivalence requires the tariff's defined measure. Never equate cargo tonnes with ship tonnage. Zero may be legal for a count/duration but not positive tonnage; finite range/decimal bounds are field-specific.

**Extraction contract:** model proposes task/fact patch and exact evidence references using a strict schema; code verifies referenced authenticated message/form/lookup bytes, unit compatibility and supported normalization. Literal source-span presence proves provenance, not semantic role: selecting “50” as GT from a pilotage clause is still invalid. Use field-labelled span parsing/controlled normalization; unsupported semantic assignment becomes a field conflict for focused clarification, not an established fact. A validated proposal from this run cannot cite a private memory string as a user instruction. No global “tariff consulted” boolean authorizes computation.

**Correction reducer:** apply `{opId, expectedContextRevision, scopeId, field, replacementFact, supersededFactIds}` atomically. Explicit current corrections outrank prior statements and remembered facts. Preserve unresolved conflicting lookup evidence for explanation; do not overwrite the user. A new vessel/leg allocates a new scope. An ambiguous “make it 30” asks which field only when multiple live candidates matter. A switch of port invalidates port-dependent rules/ledger items, while supplied arithmetic and unchanged independent scopes remain available. Removing a fact invalidates all descendants through dependency IDs; no value survives merely because it appears elsewhere in history.

**Forms:** each generated field binds to a `scopeId + field + missing-requirement ID`. Resolve the stored form exactly once using existing `toolCallId`, owner and revision checks. Cancelled form `values` are not established; only the cancellation `note` proposes current user facts. On normal submit, conflicting note/value pairs remain a conflict unless an explicit correction resolves them. A prose reply uses the same reducer. Invalid one-field input must not clear valid independent results.

**Clarification planner:** determine missing inputs from candidate task/rule requirements, not a universal intake list. Return one grouped set of necessary questions (current max 8), with partial completed tasks. No form for an answerable rule explanation, supplied quote, or generic arithmetic. Source gaps request the missing document/period/identity; they do not request vessel data that cannot resolve the source gap.

Bounds proposed: 32 tasks, 16 scopes, 256 facts, 64 conflicts, 32 dependencies per derived item; serialized context at most 128 KiB UTF-8 and within existing bridge/history budgets. Validate these against the largest independent fixture before locking; exceeding a limit yields an explicit scope-preserving split request, never silent truncation. No new browser request limit.

## A → C: versioned rule authority — `tariff-rules.ts`

```
TariffRuleV1
  id, version, sourceRefs[] {sourceId, sha256, sectionId, lines, passageHash}
  issuingAuthority, portId, terminalId?, evidenceClass
  effective {from, through?, timeZone, dateBasis, inclusivity}
  supersedesRuleIds[], amendsRuleIds[], authorityStatus, adjudicationRef
  chargeKind, requiredFacts[], eligibilityPredicate, exclusions[]
  quantityBasis, rate {decimal, currency, denominatorUnits}
  formulaTemplateId, parameters, roundingStages[], taxRuleIds[], fxRuleId?
  dependencies[] {ruleId, purpose, applicabilityPredicate}, duplicateChargeKey
```

Rules are reviewed versioned data or bounded functions authored from sources. Model selects **candidate rule IDs**; C independently checks identity, effective interval, eligibility and requirements. Only `approved` rules execute as official. Historical rules can execute for matching historical requests with historical labels. A supplied quotation has explicit user-span rule/rate/conditions and its own class; no port/date intake unless necessary to interpret the supplied quotation. An unsupported current source cannot silently downgrade to an old “official” rate. The user can still ask for a clearly labelled historical/reference calculation.

Cross-authority dependencies are explicit, e.g. conditional MBPA dues in JNPA, an ICTPL berth multiplier over a particular MbPA rule, or national navigation-dues validity. No wildcard permission to use another port's entire tariff. Same-visit duplicate keys prevent adding a shared national charge twice; separate hypothetical comparisons keep each scenario complete without summing them into one invoice. Retain old assets and reviewed aliases; do not replace histories by editing a rate in place.

## C: typed calculation ledger — `calculation-ledger.ts`

```
CalculationRequest = {taskId, scopeId, contextRevision, ruleId, factBindings}
LedgerItemV1
  id, taskId, scopeId, contextRevision, contextHash
  status: calculated | not-applicable | needs-fact | source-gap | interpretation-gap | invalidated
  ruleRef, sourceRefs[], evidenceClass, eligibility {decision, reasons[], factRefs[]}
  operands[] {name, factOrLedgerRef, exactValue, dimension}
  operationTrace[] {templateOperationId, inputs[], exactOutput, rounding?}
  elapsedTime?, billableQuantity?, rate, result {exactDecimal, currency, displayedDecimal}
  dependencies[], assumptions[], exclusions[], warnings[], duplicateChargeKey

LedgerTotal
  id, taskId, scopeId, itemIds[], currency, totalRuleRef, exactDecimal, displayDecimal
  completeness: scoped-complete | partial-subtotal | unresolved
  requestedItemIds[], pendingItemIds[], excludedItemIds[], notApplicableItemIds[]
  dependentObligations[]: {id, ruleId, kind, status, reason, relatedItemIds[]}
  coverageLabel, allIn: boolean
```

Retain existing bounded decimal engine. Tariff calculation templates generate the expression from validated facts; a model-provided expression cannot become a tariff ledger item. Retain `calculate_charges`/`calculate_charge_batch` for explicit arithmetic requests and supplied expression audits; label their output arithmetic until validated rule bindings exist. Never auto-upgrade a successful calculator call to a verified port quote.

Dimensional checks precede evaluation: e.g. `GRT × USD/GRT/hour × billable hours = USD`. NT, TEU, tonne, metre, visit and activity are distinct units. Reject implicit FX and wrong denominator quantities independently of numeric correctness. Decimal strings throughout; rates/precise intermediate values need not use monetary display precision. Rounding records distinguish quantity rounding, line rounding and grand-total rounding. Tax/cap/FX order is a source-defined operation graph, not a fixed universal sequence.

Approved template families: linear unit charge; flat call/activity; bracket-selected rate; progressive marginal slab; min/max cap; included-period plus excess; ceil-to-hour/day/part period; calendar/day/free-period exclusions; duration exemption; attribution-specific penalty; percentage rebate/surcharge; sequential percentage; cargo/container matrix; FX with date/rate evidence; tax split/exemption; referenced-authority charge; validity-window reuse. Each actual source rule chooses explicitly and needs independent below/at/above boundary oracles. Never assume every slab is progressive or every charge is monotonic.

Independent valid tasks may produce a partial ledger when another task is missing data. Each total enumerates its full scoped item set, excluded/pending items and currency. Validator checks the disjoint union of included, pending, excluded and not-applicable item identities against the immutable requested scope. A missing identity, duplicate identity or pending mandatory dependency rejects `scoped-complete`/`allIn`. Any pending requested item forces the visible label “Partial subtotal — [named pending items]”; no “total/final payable/all-in” label is available. Comparisons declare common scope and unmatched items.

Dependent obligations have three kinds: `calculation-essential` (e.g. FX required to apply an INR cap), `mandatory-within-requested-scope` (e.g. applicable tax for an expressly all-in request), and `informational-outside-requested-scope` (e.g. port dues when the user asks for berth hire only). Explicit user exclusions stay explicit: a pre-tax/supplied-quote calculation may be complete for that narrow scope, while `allIn=false` and excluded identities remain visible. Do not add unrequested charges to narrow arithmetic or silently ignore mandatory conditions of the requested charge. A conflicting request to omit an essential calculation dependency produces a focused unresolved item, not an invented amount. A full-call request expands rule-required charge obligations before completeness validation; a narrow berth-only request does not expand to every port service.

## D: answer payload and publication — `answer-contract.ts`

```
AnswerV1
  identity, answerId, requestedTaskIds[], contextHash, ledgerHash
  taskResults[]: {taskId, disposition, ledgerItemIds[], ruleClaimIds[], pendingRequirementIds[]}
  ruleClaims[]: {id, ruleId, passageRefs[], templateClaimId, factBindings, limitations[]}
  tableRows[]: {ledgerItemId}                 // no free-form amount/formula/charge substitution
  totals[]: {ledgerTotalId}
  assumptions[], exclusions[], limitations[], clarification?, explanatoryFragments[]
  completeness: complete | partial | needs-clarification | evidence-unavailable
```

Every task has exactly one explicit disposition, and every referenced result belongs to the current scope/revision. `source-gap` is a valid diagnostic outcome but **fails a promised successful-price journey**. Necessary clarification must reference the precise missing requirement; a broad refusal or irrelevant form fails usefulness acceptance. Compare all requested sides or expose exactly which side is unresolved.

Render financial names, units, formulas, amounts, totals, source/version citations and validity warnings from ledger/rule data. Model prose cannot supply these fields. Rule explanations use source-bound claim templates or an accurately cited direct passage with bounded quotation; unreviewed semantic claims are marked unresolved rather than passed by citation-existence alone. Model commentary may select/order verified claim IDs and approved connective templates, but cannot insert arbitrary text in their amount, unit, condition or source slots. No “validator model said yes” substitutes for source/operand checks.

**No fresh general/legacy bypass:** every newly generated answer uses `AnswerV1` and the same publication validator. `TaskKind` is a planning hint, never an authorization switch. Existing legacy history is display-only; a new run cannot certify arbitrary historical/general text by pointing at it. `explanatoryFragments` is a discriminated union of approved nonfinancial conversation/capability templates, source-bound maritime definition/claim IDs, and ledger/rule references. It has no unrestricted `text` variant. Template substitution accepts typed entities/quantities at designated slots, escapes user strings, and cannot place user/model prose into narrative authority slots. Non-price general maritime explanations compose reviewed definitions/claims or correctly labelled source excerpts; greetings, navigation help and ordinary capability answers use nonfinancial templates without tariff intake. Expand that claim/template coverage to preserve existing useful general answers; incomplete coverage is a parity failure, not permission for blanket refusals. Source matching alone cannot validate a paraphrased claim.

Adversarial requirement: a model labels a quote or tariff-rule request `general` and tries to emit “the berth costs two thousand dollars”, “about 2k”, a Unicode amount, or an uncited minimum via every payload field. The schema/render path must reject the unbound claim before streaming or durable completion, without depending on monetary regex. Positive neighbors: greetings, “what is gross tonnage?”, “what does berth hire mean?”, and “what details would improve this estimate?” remain useful general/rule answers and must not trigger an irrelevant vessel-intake form. Test both `generate` and streaming wrappers and direct bridge completion; no code path may certify new financial text outside the envelope.

Publication requires current identity, matching hashes, all dependency statuses, legitimate task dispositions and clean terminal finish. `publish_report` becomes an opaque **validated-answer token**, scoped to run/fence/context/hash; no raw specialist text approval. A correction invalidates old tokens even when total is coincidentally unchanged. Multiple reports merge by task/ledger IDs; approval cannot select one and drop a comparison side.

No unverified financial text streams to users. Stream safe progress/tool state immediately; validated text/table segments can publish after their dependencies pass, with incomplete state until durable final commit. Keep Stop responsive during validation/buffering. If model output is malformed: deterministic representation-only normalization once (e.g. removable optional null); reconstruct answer from valid ledger/tasks when possible; otherwise preserve valid partial work and state exact unresolved format/field. No automatic inference retry. Financial fallback cannot be a generic intake form.

## E: durable state integration and compatibility

Use existing authenticated bridge and Convex ownership/fence/lease/epoch checks. Add optional typed metadata for old rows; **absence means legacy/unverified, never synthesized verified**. Store bounded context, ledger and answer snapshots in owner-scoped tables keyed by conversation/run/revision with explicit schema version and digest. Preserve existing Agent messages for history/tool pairs and canonical routes.

Proposed internal operations (not browser-callable):

1. `commitContext(runId, fence, expectedContextRevision, operationIds, contextSnapshot, hash)` checks active run, conversation owner/revision, memory epoch and referenced input receipts; identical operation IDs replay without inference, conflicting hashes reject.
2. `checkpointEvidence(runId, fence, step, contextHash, ledgerDelta, answerDraft?)` validates structured payload and contiguous step; writes message/evidence checkpoint atomically. No client-asserted authority flag.
3. Extend `completeRun` with `{answerId, answerHash, contextHash, ledgerHash, schemaVersion}`. In one transaction, recheck owner, active run, fence, lease, current context, source/rule versions and memory epoch, then persist rendered final message plus answer receipt and terminal state. Stream final-completed status only after success. A crash after durable commit is recovered by saved state; no second inference.
4. Extend pending forms with bounded field-to-requirement bindings/context hash. Form consumption remains existing atomic `resolveFormAndClaim`; stale context conflicts cannot bind values to a different task.

Existing `checkpointRun` can save partial tool work. It must not implicitly certify `checkpointHasText` as a validated financial answer. Legacy historical messages remain readable, but all new answer kinds use the common envelope/publication operation; classification cannot be supplied solely by a model to bypass checks. New rules/context apply to subsequent requests; historical rendered messages remain labelled historical, not destructively rewritten.

Deletion revokes the conversation before paginated evidence cleanup; read/publish checks root status every time. Context derived from remembered facts carries memory epoch and source provenance; forget/clear/source-chat deletion invalidates affected derivations and clears stale projections. Never restore deleted values from a cached context or assistant history. Unrelated explicit user facts stay independent. Memory is opt-in as today; no automatic cross-chat learning.

Diagnostics use stable codes: `FACT_CONFLICT`, `SOURCE_MISSING`, `SOURCE_OUT_OF_PERIOD`, `RULE_UNADJUDICATED`, `UNIT_MISMATCH`, `STALE_CONTEXT`, `ANSWER_INCOMPLETE`, `OUTPUT_FORMAT`, plus existing provider rate-limit/auth/payment/timeout/cancel/persistence distinctions. Sanitize raw provider bodies, keys, private model IDs and user text in telemetry. Usage unknown remains unknown.

## G budget boundary

Existing call limits (16 provider calls, 3 specialists, 12 agent steps, maxRetries=0) remain ceilings. Add atomic run/suite reservations before **every** main/specialist dispatch: `{reservationId, ownerId, suiteId, runId, pricingVersion, worstCaseInputTokens, maxOutputTokens, maxCost, status}`. Strict decimal money, conservative context/token accounting including source/tool schema overhead, and locked model/provider price caps. Unknown price/token bound denies dispatch. Completion reconciles observed usage; disconnect/unknown charge retains the reservation until bounded resolution. Concurrent tasks cannot spend the same remaining cap. This milestone's cap is $0; no provider traffic was performed. Paid production acceptance needs a concrete batch and separately established hard cap.

## Dependency order and rollback

After review: B reducer/provenance regressions → A approved rule slices + C reference tests → C ledger → D renderer/publication → E per-slice persistence integration, followed by lifecycle/budget completion. Do not replace guards wholesale before neighboring positive/negative checks pass. Start with source-independent elapsed/supplied-rate tasks while tariff adjudication proceeds; this does not declare full port coverage complete.

F derives tariff oracles from original authoritative documents and independent interpretation/calculation **without reading the new encoded rule data or candidate output**. Implementer-authored rule tests remain ordinary regressions even if they match external rates. The 2,068 extracted fragments are candidates only; each needs semantic mapping and disposition, and mapping itself does not approve a rule. Freeze oracle source hashes, clauses, applicability, operation order and amounts before running the candidate.

Schema additions are optional and additive; deploy compatible backend before frontend only at stage 6. Retain historical assets and old-rendered history. Rollback uses the prior frontend artifact plus compatible additive backend; never roll back by deleting new user data. Any new answer format must remain readable by the rollback frontend or have a persisted plain-text projection. An emergency fallback must advertise unverified quotation status, not re-enable silently unsafe official quoting.

## Adversarial disposition register

| Counterexample | Earliest broken contract | Required design response / positive neighbor |
|---|---|---|
| CE-01 swapped berth/pilot amounts still accepted | C/D | Ledger identity-rendered row; same numbers under correct rows pass |
| CE-02 invented `666*999` accepted once rate exists | C | Rule templates bind named operands; explicit arithmetic `666*999` still works |
| CE-03 GTI rejected while slug accepted | B/A | Reviewed alias identity; generic “Gateway” ambiguity preserved |
| CE-04 reversed timestamp blocks independent `2+3` | B/D | Per-task validity; return 5 plus focused timestamp question |
| CE-05 cancelled form GT2000 overrides note GT3000 | B/E | Ignore cancelled values; preserve note and prior stay10h |
| CE-06 end-time correction drops original start | B | Field patch yields 3h; explicitly new leg does not inherit old start |
| Prior Mumbai leg remains in context after Chennai correction | B/A | New scope/current selection; answer independent arithmetic; do not consult Mumbai |
| A fresh PDF repeats an expired MUC clause | A/C | Charge-level effective authority; require extension instrument |
| KLL November tariff applied to October visit | A/C | Effective-date selection, future schedule retained but inactive |
| JNPA legitimately references MBPA dues | A/C | Explicit condition/dependency; do not blanket-reject every cross-port source |
| Navigation dues copied into 16 assets become 16 fees | A/C | National identity + payment-validity rule; per-scenario comparisons not aggregate invoices |
| Citation exists but claim reverses its exception | D | Controlled claim/rule template and condition binding; not citation-string membership |
| User updates context after an approved report | D/E | Token bound to current revision/hash; stale result rejected even if amount equal |
| Two users share content-hash cache | E | Immutable tariff cache may be shared; user context/quote cache owner-scoped |
| Delete/forget during final persistence | E | Atomic root/epoch/fence check and dependency invalidation |
| Partial SSE saved as completed after provider 429 | E | Distinct error terminal; no completion receipt; no implicit retry |
| Valid full quote is replaced with “can't verify” | D/F | Independent usefulness gate fails; source/scope issue remains open |

All responses above are **proposed dispositions**. Reproduced defects are in `output/reliability-gate-20261014/design-counterexamples.json`. Independent adversarial design approval remains the orchestrator's review gate.
