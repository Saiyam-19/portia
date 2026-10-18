# Current-runtime safeguard repair and adversarial audit

> Historical pre-authority-repair report. AUTH-01/AUTH-02 closure and current checks: [exact-operation audit](2026-10-18-authority-boundary-audit.md). Counts and findings below describe that earlier snapshot.

**Commit/release/evaluation gate: FAIL — two authority boundaries remain open.**
The two originally reported bugs are fixed. Additional concrete regressions were
repaired. This audit does not establish that every bug has been found.

Base HEAD: `2a77ead22c5a8dc365b58806f38accd4f959b2bd`, dirty branch
`pass1/golden-and-repairs`. No staging, commits, deployment or blind evaluation.
No paid inference or external contact. All executable probes use the current
ordinary-tools runtime; historical implementations were read only as reference.

## Evidence and verification method

- Inventoried 133 pre-cleanup test/support files; read relevant old safeguards and
  traced their current replacements. Inventory is not a claim that every old
  assertion received an independent review.
- Executable tests exercise current `QuoteSession`, business tools, real
  `ToolLoopAgent`, current chat route/publication, and current Convex mutations.
  External model/auth/database transport boundaries are synthetic where stated.
- An isolated copy of the **pre-repair current ordinary-tools runtime** was built
  outside the repo. Six serving-module hashes match this task's entry hashes.
  It does not contain or run `tests/legacy` or the retired engine. On this baseline,
  the final 29-case runtime safeguard suite had 22 failures and seven passes.
  Those cases pass against the repaired runtime. Several cases cover one defect;
  22 failing cases do not mean 22 independent bugs.
- Checkpoint lifecycle regressions were demonstrated separately against the
  current Convex function before moving its checks.
- Two read-only reviewers assessed specification parity and standards/lifecycle
  risks. Their repair findings were reproduced and corrected before completion.
- Ordinary regression command: `npm test -- --maxWorkers=1`.
- Separate blocking command: `npm run test:adversarial`. Its three failing probes
  remain actual failures, not `it.fails`, skips or passing assertions about bugs.
- Detailed commands, exits, source hashes and process checks are retained in
  [runtime-safeguards evidence](evidence/runtime-safeguards/validation.json).

## Final results

- Ordinary current-runtime suite: **843 passed / 73 files**, zero expected failures.
- Adversarial authority gate: **3 failed probes / 2 open P1 families**.
- Typecheck: pass. ESLint: zero errors, six existing warnings.
- Production webpack build: pass on Node22.23.2, build `CqTVJac7DM7B31X2Cw1qj`.
- Both chat routes trace all79 canonical data files; no research archive, logs,
  local state, Git metadata or env files included. All79 data hashes unchanged.
- All368 retained source-provenance mappings recover the original hashes.
- All22 task check process groups exited; existing services preserved. No paid
  inference, new persistent services, commits, deployment or blind evaluation.

The ordinary test command does not include `.probe.ts` files. Both commands are
required readiness gates; the separate adversarial failure must not be omitted
from a release decision. Historical cleanup metrics remain historical records.

## Repaired safeguards

| Area | Defect and corrected behavior | Current verification |
| --- | --- | --- |
| Mixed lookup/calculation | Final rendering dropped lookup unavailability once arithmetic existed. Actual lookup outcomes now survive alongside calculations; invented model prose does not supply the fallback. | `conversation-auxiliary`, `runtime-safeguards`, mixed current-agent/current-route persistence test |
| Historical money currency | Rate/minimum/maximum evidence could disagree with the imported charge currency. Import now retains that incompatibility as unresolved; no conversion or financial baseline is invented. | Original currency regression plus minimum, maximum and rate variants through current import/update/reload |
| Historical requested scope | Missing requested charge rules, per-charge tax, monetary rounding precision and conflicting duration representations could disappear during conversion. Unsupported conditions now remain immutable historical uncertainty. | Current receipt import, attempted generic clearing, and v2 reload regressions |
| Cancelled forms | Cancelled field values could authorize NT despite the cancellation note. Current session ignores cancelled values and preserves the human note. | Cancelled/accepted form neighbors through current session; existing Convex form-consumption tests |
| Partial failures | Successful arithmetic concealed invalid/failed sibling work. Failed tool calls now have explicit dispositions; unrelated success, read-only access and unresolved results cannot certify repair. | Current SDK/route mixed-task test, execution-error and cumulative-observation tests |
| Repair tracking | Initial repair re-added historical errors on later steps and could mistake a same-quote read for a correction. Failure events are now deduplicated; only exact retry or validated correction with unchanged unaffected arguments clears them. | Actual SDK Jaigarh invalid→repair→final test; read-only/unresolved/cumulative negatives |
| Monetary prose | Alternate numeric order, word numbers and Unicode digits evaded the previous narrow filter. Known unbacked amount/applicability forms are withheld; ordinary definitions/capability explanations remain available. | Seven negative amount forms plus greeting/definition/capability positives. This lexical check is **not** a universal provenance guarantee. |
| Tariff interval | A call date inside a schedule could authorize occupancy extending beyond expiry. Source coverage now checks the complete interval, including ambiguity from date-only starts and duration. | GTI, JSW JNPT, BMCT, NSIGT boundary tests; existing source component positives |
| Source invoice rounding | Line-level FX conversion could discard a saved invoice's total rounding adjustment. Incompatible conversion is now rejected rather than comparing a different price. | Current saved-quote comparison test plus existing FX/scope/rounding regressions |
| Checkpoint lifecycle | Identical checkpoint replay returned success before checking active run, fence, lease and conversation root. Those checks now precede the idempotent return. | Active replay positive; cancelled, expired, wrong-fence and lost-root negatives against current Convex mutation |

Historical quotes that cannot be faithfully converted are deliberately not
repaired by dropping their troublesome terms. The user must create a separate
quote from clarified complete terms. Valid old quotes still import, correct and
reload normally. This conservative recovery limitation is explicit in the answer;
it is not claimed as complete old-engine feature parity.

### Source-oracle correction

Four frozen KLL arithmetic rows supplied a 36-hour stay beginning on 31 October
2026, crossing the 1 November source revision. Their arithmetic answers cannot
establish applicability for that entire stay. **The source/oracle data files were
not edited.** Tests now retain those original cases as unresolved and separately
verify the same arithmetic on an explicit 30 October→31 October covered interval,
with consistent synthetic FX dates. This is development-test correction, not a
change to a blind evaluation answer key.

## Open blockers from adversarial probes

### AUTH-01 — model-proposed supplied prices lack human evidence binding (P1)

The current agent accepts a syntactically valid `manage_quote(pricing:"supplied")`
amount without verifying that the authenticated human actually supplied it.
Two current-agent probes reproduce this:

1. Human requests only the official Mumbai tariff and says no supplied quote
   exists; faulty model supplies a new USD 9,876 line, which is accepted.
2. Human supplies USD 100; faulty model changes it to USD 1,000, which is accepted.

The calculator correctly computes the wrong input. Deterministic arithmetic and
rendering therefore do not by themselves establish price provenance. This also
explains why adding more prose regexes cannot close the authority boundary.

Required follow-up: bind price-bearing tool arguments and pricing mode to
verifiable authenticated user evidence or an explicit approved quotation, with
checks for corrections, units, currency, omitted lines and scope. This is a broader
input-contract change, not safely solved by hardcoding the two prompts or detecting
the word “official.” Preserve ordinary supplied-quote usability and test ambiguous
and multi-quote conversations before a release candidate is frozen.

### AUTH-02 — cross-chat memory consent remains model-enforced (P1)

A current-agent probe supplies “Do not remember this,” then injects a faulty
`remember_memory` model call. The real memory tool requests `MemorySession.mutate`
anyway. The mutation boundary is mocked to prevent an actual write; the probe
proves an unauthorized **write request**, not a production data-write incident.

Owner/session checks prevent acting as another user; they do not prove this user
requested that memory operation. Required follow-up: a server-verifiable,
operation-scoped grant or explicit confirmed proposal for cross-chat writes and
forget operations. Automatic chat-only working notes have different semantics and
should not acquire unnecessary confirmation requirements.

Both blockers were reproduced with scripted adversarial model outputs. Their
frequency with a real model, exploitation through retrieved content, and deployed
exposure have not been measured. Neither blocker is waived by the passing suite.

## Regression attribution

The replacement-specific failures include final-answer completeness, historical
quotation conversion and cancelled-form handling. The broader audit also found
issues outside that replacement: memory consent is prompt-only in the unchanged
memory-tool implementation, and the checkpoint replay ordering was pre-existing.
The source-period and comparison cases are current behavior defects; no claim is
made that every one was introduced by replacing the old engine.

## Coverage and limits

| Safeguard family | Evidence boundary |
| --- | --- |
| 16 facility identities / 17 original assets / current source packet | Canonical data hashes and source-loader tests; no new claim of current tariff authority |
| Quotation corrections, withdrawals, competing calls, scoped comparisons | Current quote/state tests; adversarial input provenance remains AUTH-01 |
| Units, periods, tax, minimum/cap, FX, monetary rounding | Calculator/source/component regressions and the added import/comparison cases; not every tariff branch is executable |
| Forms, request IDs, replay, pagination, deletion and late writes | Current Convex/lifecycle tests plus targeted replay/cancellation additions |
| Owner/session/fence/lease/memory epoch/source deletion | Existing current tests and bounded source review; no new cross-owner defect demonstrated |
| Persistence before final output, cancellation and incomplete providers | Current route/publication/cancellation/model-recovery suites; no deployed browser run |
| Remember/recall/forget and scratchpad isolation | Current memory suites; cross-chat intent authorization remains AUTH-02 |
| Model policy / paid recovery / cost | Prior approved bounded recovery retained; failed-attempt usage still requires dispatch/account reconciliation. No new provider calls made. |
| UI, accessibility, deployment and real-model language behavior | Existing tests retained; no fresh visual/browser/production/held-out acceptance performed |

The next independent evaluation needs a fresh author, unseen conversations and
source-derived answers, a frozen deployment/model/settings/source snapshot, and an
explicit budget guard preserving the existing ledger. Do not feed this audit's
prompts into that held-out set or repair the candidate during its scored run.

## Stop decision

The requested two bug fixes are implemented and the bounded adversarial audit has
produced reproducible findings. **Do not commit as a ready release, deploy, or start
the blind evaluation while AUTH-01/AUTH-02 remain unresolved.** The next work is the
input-evidence and memory-consent boundary, followed by new adversarial regression
checks. No claim that all bugs have been found or that unseen-message reliability
has been established.
