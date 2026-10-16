# Portia remaining delivery plan — proposed, implementation paused

**Goal:** A user describes a port call or asks a tariff question in ordinary language. Portia understands the requested work, asks only necessary questions, uses the applicable tariff, calculates and explains accurately, and supports corrections, follow-ups and comparisons across all existing ports and features. The user must not need to supply tariff rates or supervise calculations.

**Status:** Planning only. The implementation chat is stopped and has released ownership. The recurring orchestration automation is paused. No code edits, tests, provider calls or deployment are authorized by this document. Resume only after the human approves the next implementation plan.

## What is already available

- Local fact/provenance, alias, invalid-input and correction repairs.
- A supported supplied-quotation path with bound arithmetic and deterministic answer rendering, verified through real-model browser/backend/save/reload journeys.
- One independently sourced ordinary coastal Mumbai Indira Dock berth-hire path including GST, minima and bill rounding. The frozen realistic-but-fully-specified example returns INR51,094 and survives reload.
- The latest cargo-qualifier and rule-question intake fixes are implemented with focused checks and a genuine Mumbai rerun. Their final scoped orchestrator review remains pending.
- All16 port identifiers and17 historical source assets are retained. Existing product capabilities remain preservation requirements; presence is not proof of correctness.
- Changes are local, uncommitted and undeployed. All-port pricing coverage, normal incomplete conversations, complete follow-up/comparison behavior and final product/release acceptance remain unfinished.

Evidence: `docs/portia-reliability/actual-tariff-repair-r1-20261015.md`, `quotation-repair-r1-20261015.md`, `invariants-and-capabilities.md`, and the frozen original/development case files. Historical test counts do not certify those unfinished user outcomes.

## Why change the execution sequence

The previous work found real defects, but too much effort went into narrow parsing examples and repeated review cycles. A fully specified successful example does not prove that a normal user can reach the same answer through conversation. The next work must measure that gap first, then fix shared causes against a finite user-outcome checklist. No new feature, platform migration or smaller product is proposed.

The original full-scope plan remains the requirement source. This document changes delivery order and progress reporting, not its protected scope.

## 1. Establish the remaining user-outcome checklist

**Why:** We need a bounded, evidence-backed account of what fails before choosing more code changes.

**Work after approval:** Reconcile existing evidence and the latest repair checkpoint. Reuse the original19 inputs and24 development cases unchanged. Map all16 ports and existing capability groups to passing, failing, blocked or unrun evidence. Separate incorrect application behavior, unsupported/missing tariff evidence, provider failures and environment failures. Do not create tests from the implementation or claim an unrun row passes.

**Deliverable:** One prioritized failure list with actual responses where available, owning cause, required repair or missing source, affected ports/features and a test/call budget. No duplicate source inventory or redesign. First code batch must name the observed user failures it resolves.

**Acceptance:** Every existing port/capability has a status and an explicit obligation. Unknown behavior stays unknown. Original out-of-catalog prompts test useful limits/partial answers, not an expansion of supported ports.

**Owning surfaces:** Existing frozen inputs, `docs/portia-implementation-status.json`, source/capability registers and prior response evidence. Reconcile stale status fields without treating research as application success.

## 2. Make ordinary conversations reach the requested answer

**Why:** This is the main gap between a narrow demonstration and the intended agent.

**Work:** Repair shared request/context handling for short or incomplete inputs, necessary clarification, prose/form answers, corrections, follow-ups and separate comparison scenarios. Preserve rule explanations without quotation intake. Distinguish current facts from historical, hypothetical, rejected and remembered values. Keep valid independent answers when another field is invalid.

Use the existing model for flexible language interpretation and code for evidence, field/unit validation, state and calculations. Audit the current narrow paths for dependence on exact phrases; do not add another one-off matcher for each failing prompt. A quoted span or recognized number alone is not proof of semantic meaning.

**Acceptance:** An ordinary incomplete request reaches a complete supported estimate after necessary clarification. A correction changes only its dependent results. A comparison retains every requested side. A rule question receives an explanation without an irrelevant questionnaire. Normal paraphrases preserve meaning; contradictions produce focused clarification. Existing complete examples remain passing controls.

**Owning interfaces:** `call-context.ts`, `request-evidence.ts`, `domain-agent.ts`, forms and existing conversation state. Concrete edit locations and changes follow the failure list; no speculative rewrite.

## 3. Make tariff-backed answers reliable across existing coverage

**Why:** Correct arithmetic cannot compensate for the wrong port, date, category or tariff rule.

**Work:** Apply the shared source→rule→calculation→answer contract to the existing supported charge capabilities. Reuse independently collected sources; resolve only the missing authority, validity or interpretation that blocks a required answer. Bind port/terminal, tariff version, eligibility, quantities, units, rounding, minima, taxes and requested exclusions. Financial prose must agree with the verified calculation record. Preserve earlier source versions.

**Acceptance:** Every promised supported-port quotation has independently justified expected results and a successful complete journey. Missing essential sources remain explicit blockers; the port stays visible, but its quotation is not labelled ready. Existing requested charges are retained; berth-only requests do not silently expand into whole-port-call bills. Supplied-rate arithmetic and elapsed-time calculations remain usable independently of official-source gaps.

**Owning interfaces:** Existing port registry and source assets, approved rule data, calculator/ledger, publication renderer and source-only reference packets. The current Mumbai module is one implemented slice, not universal coverage.

## 4. Verify the complete product without regressions

**Why:** A correct reply is insufficient if reload, Stop, forms, memory or ownership break.

**Work:** Run the existing protected journeys on the candidate: saved chats, reload, forms/cancellation, Stop/recovery, comparisons, both model aliases, vessel lookup/manual fallback, explicit remember/recall/forget, deletion and owner isolation. Keep original input bytes. Freeze the candidate before opening the12 held-out cases; once used to guide repairs they cease to be unseen evidence. Report actual outputs and failures separately from infrastructure checks.

**Acceptance:** Requested answers are correct and complete, displayed/saved state agrees, and existing lifecycle/privacy controls remain intact. A refusal is a pass only for a case that requires refusal or clarification. Source-blocked and provider-blocked checks never become correctness passes. Free-model evidence cannot certify the different production model configurations.

**Owning surfaces:** Existing tests and local harness, chat/API/Convex/memory contracts and immutable candidate/evidence manifest. No unrelated UI redesign or feature addition.

## 5. Deploy only the accepted configuration

**Why:** The newer code is still local. Production must match the version and configuration that were actually verified.

**Work:** After required gates pass, verify targets and rollback, deploy compatible backend changes before the matching frontend, and check the canonical production UI/auth/persistence path. If a required source or production-model check is blocked, report the precise remaining gate rather than deploying an uncertified version as complete.

**Acceptance:** Exact deployed code, source, schema and model configuration have the required evidence; rollback and process cleanup are recorded. Final status separates implemented, verified and deployed.

## Execution and cost limits

- One implementation chat remains sole repository writer; this chat coordinates bounded review. No new user-owned chats or recurring work unless requested.
- Preserve all existing ports, features, dirty work and original tests. No provider/platform migration, unrelated cleanup or new product scope.
- Start with deterministic checks and saved-response replay. Use free inference only after cheaper prerequisites pass, in small batches with shared main/specialist call limits and no paid fallback or automatic inference retry.
- Paid inference allowance stays$0. Provider quota blocks live checks only; other independent authorized implementation can continue after plan approval.
- Verify the current credential's availability/expiry when needed without exposing it; do not cycle accounts or keys on quota failure.
- Rerun affected cases and relevant positive neighbors after repairs. Run the full offline suite at meaningful integration milestones. Reserve broad live acceptance for a frozen candidate; stop a batch on a systemic failure.
- New findings must map to an original capability or release risk. Fix material correctness/security/regression blockers; record unrelated improvements instead of adding another open-ended review campaign. Never lower an assertion to make a failure pass.
- Progress updates show completed user journeys, failed journeys, source/provider blockers and deployment state. No completion percentage derived from unit-test counts.

## Immediate next action and stopping condition

After explicit human approval, start **Step1 only**: produce the finite remaining failure list and proposed first shared repair batch. No more standalone demo construction or broad research while the main conversational gaps are unmeasured. Establish a completion forecast from that list, including external source/model dependencies; do not invent an all-port ETA now.

The job is done when the original conversational experience and protected existing capabilities pass the required evidence on the intended deployment. A working Mumbai demonstration is retained evidence, not the definition of done.
