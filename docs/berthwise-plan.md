# Berthwise agent — fastest plan to v1 handover

**Version 3 · 25 October 2026** · Code base: `pass1/golden-and-repairs` at `a9cdcbf`
**Status:** reviewed independently (verdict: approve with changes; the changes are applied here). Not yet built.
**Goal:** hand a working v1 to the client as soon as possible. The client then reviews it for mistakes.

**One rule:** work that doesn't trace back to the scope below needs the product owner's approval before anyone builds it. Earlier plans drifted into supplier-quote work that was never the product.

## 1. Scope (from the Berthwise landing page, plus two additions)

Users are marine companies. In plain English, v1 lets them:

1. **Estimate a port call (berthing charges first):** port dues, pilotage, towage, berth hire, mooring and other standard charges, plus cargo charges (wharfage) for the main cargo types, using the cargo quantity. Each line shows its rate, the working and the source page, and the estimate ends with a total before GST.
   - **Voyage view:** given a departure port and an arrival port, estimate both calls and show a combined total.
2. **Look up a ship by IMO number**, then change any figure.
3. **Compare ports three ways:** berth hire only, the whole bill, and the tariffs themselves (how each port charges, and what changed since last year).
4. **Check rates are current:** last-checked date, version in force, what changed.
5. **Ask about a port's** berths, depths, rules, compliance requirements (regulations, notices, required documents) and working timings, from the port's own documents.
6. **Upload company documents** (contracts, procedures), ask about them, and use the company's agreed rates in estimates.

**Answer style:** assume common facts and show them as editable assumptions (e.g. "Assumed: foreign-going, general cargo, 2 tugs"). Ask only when the answer would change the price a lot and no sensible default exists. Never guess a rate.

**Out of v1:** supplier quotes and their comparisons and approval forms, the `supplier-v1` mode, team invites, email, password reset, GST lines, landing-page changes, and ports beyond the v1 list.

## 2. v1 ports

Each port is its own release unit. **Handover floor: at least 10 ports passing all their checks**; the rest follow after handover. The list below records what was found online on 25 October 2026. Step B1 confirms each one, and swaps in a reserve where no current schedule can be obtained.

| Status | Ports |
|---|---|
| **Current 2026 documents found** | Mumbai, JNPA (with its terminals GTI, NSIGT, NSICT, NSFT, BMCT, JSW Liquid), JSW Jaigarh, Deendayal (Kandla), Paradip, New Mangalore, Mormugao, Chennai, Pipavav |
| **Likely current; confirm in B1** | Kamarajar (Ennore: rates amended to July 2025), V.O. Chidambaranar (Tuticorin: 2025 indexation found), Mundra, Hazira, Krishnapatnam (Adani: Nov 2024 base tariff plus 2026 fuel-surcharge notices) |
| **Reserves** | Cochin, Visakhapatnam, Kolkata/Haldia (no 2026 schedule found yet) |

JNPA alone is about 7 separate tariffs, so plan by documents, not ports. The repo's small facilities (Redi, Finolex, Konkan LNG, BPCL jetties, ICTPL, Mumbai Cruise Terminal) are not in v1.

## 3. How we check accuracy without a port expert (until handover)

1. **Two readings by different AI model families.** Each rate schedule is read into the rule book twice, independently: once by Claude in Claude Code, and once by Codex (an OpenAI model) in the Codex app. Both run on existing paid plans, so neither costs extra.
   - Codex works from its own copy of the repo, at a commit that has the Markdown documents and the rule-book format but not Claude's reading. That keeps the two readings independent.
   - Claude prepares one instruction file covering all ports. The product owner pastes it into Codex once.
   - Codex writes its reading to a separate folder.
2. **Compare results, not structure.** Both readings run through the calculator over a generated grid: tonnage just below, at and above every band edge × foreign/coastal × two durations. Only cases where the amounts differ are checked against the PDF.
3. **Direct-from-PDF spot checks.** For a sample of grid cases, a model calculates the charge straight from the PDF page without the rule book. Any mismatch is investigated.
4. **The old engine's results become fixed tests.** Before the old code is deleted, its results for Mumbai, JNPA and Jaigarh are saved as test expectations, and the new calculator must match them.
5. **Visible sources.** Every line shows its rate and source page.
6. **Honest label.** Until the client's review, answers carry "rates read from the official schedule; not yet checked by a port expert".

**Remaining risk:** interpretation mistakes, for example which band or exemption applies. Without real past port bills, "zero wrong figures" can't be fully measured. If the client can share 3–5 past proforma disbursement accounts at handover, check against them first.

## 4. Build plan

Sizes are relative (S, M, L), not calendar estimates. **The critical path is B1 → B2 → E** (collect documents → fill the rule book → test). The code work runs alongside it.

### Step 0 — Reset (S, day 1)
- Link this plan from `AGENTS.md`, so every agent works from it.
- Remove the supplier-quote tools and the `supplier-v1` mode from the agent.
- Move the new OpenRouter key from `NEXT_PUBLIC_API_KEY` to `OPENROUTER_API_KEY` in `.env.local`. The app reads that name, and a `NEXT_PUBLIC_` name can end up in code sent to visitors' browsers. The product owner sets a USD 9 limit on the key at openrouter.ai.
- Add a free PDF-reading library as a development tool (for B1).
- Rename Portia (in the agent instructions) and Plisto (in the memory panel) to Berthwise.

### Stream A — The engine and the answers (code)

**A0. New answer loop (M, first code task).**
- The model writes the words. The server attaches estimates and comparisons as structured cards, saved with the chat in Convex.
- Amounts appear only in cards. Any currency figure in the model's text that isn't in a tool result is rejected and the model retries.
- Delete `finish_turn`, the forced tool calls (`toolChoice: "required"`), the saved-quote machinery (`QuoteSession`), the completion check and the approval forms.
- Update the tool allowlist in `convex/migration.ts` (`ALLOWED_MAIN_TOOLS`), the saved-message validators and the strict-mode tool list (`tool-names.ts`).
- **Memory without approval forms.** Saves happen directly, the answer says what was saved, and the user can delete it in the memory panel. This is decision D-1. Memory is switched on only after this step.
- Keep chat history small: compact tool outputs, and old tool results dropped from the replay.
- Log the OpenRouter cost of every run. Measure at turn 10 of a conversation, not just turn 1.
- At cutover, old test chats are wiped (decision D-2). The ~53 test files built on the deleted code are deleted, not ported.

**A1. Rule-book format, calculator and estimate tool (L).**
- **Format, fixed first** by entering the three most different ports:
  - JNPA: bands and coastal percentages;
  - Jaigarh: minimum amounts, tonnage bands, 30-day validity;
  - Mundra: a base tariff plus a fuel-surcharge notice.
- The format must cover:
  - a chain of documents (base schedule + indexation/amendments + surcharge notices);
  - per GRT, per GRT per hour, per call;
  - "first N + per additional";
  - band meaning (whole band vs stepped);
  - minimums and maximums;
  - a percentage of another line;
  - time rounding (started hour, part day);
  - foreign/coastal and currency, and each port's exchange-rate rule;
  - effective dates and source page;
  - **cargo charges:** wharfage per tonne by cargo class, and per container/TEU;
  - **per-port default assumptions** (tug count by size, default berth), which "assume and show" depends on.
- **One exact-decimal calculator** (reusing the existing number code).
- **One `estimate_port_call` tool:** ship + port + time alongside + cargo + assumptions → itemised lines → total before GST in one currency, using the port's exchange-rate rule. It also takes a departure and an arrival port and returns both calls plus a combined voyage total.
- **Define the result shape on day 1**, so A2 can start at once.

**A2. Screens and plain-English answers (M, alongside A1).**
- The estimate card: lines with rate, working and source; total before GST; editable assumptions.
- A live "working" trace (e.g. "Reading Mumbai's rate schedule…").
- Follow-up buttons: "Try 36 hours", "Compare with …", "Show the rates".
- `@port` mentions in the message box.
- A **"Browse coverage"** page built from the rule book: which charges each port supports.
- Plain-English wording for every message, including questions and "not covered" replies.

**A3. Comparisons (M, after A1).**
- Berth hire and whole bill side by side. A port missing a charge is shown as missing, never silently compared as if it were equal.
- Tariff comparison straight from the rule book.
- "What changed": the per-port note written in B2 (below), with citations from both years.

### Stream B — Port sources (research, critical path, day 1)

**B1. Collect documents (M).** For each v1 port, download and record (link, date, version):
- this year's **and last year's** rate schedules, plus amendments;
- the fuel-surcharge notices (Adani ports);
- a **berth table** (berth name, maximum length, draught/depth, cargo type), entered as structured data;
- port rules, compliance notices/regulations and working timings.

Convert every port document to Markdown **once, offline**, and commit it with the data. After that, no AI ever reads the PDF again.
- Claude reads the pages in Claude Code (scanned pages too) and writes clean Markdown tables.
- A free text-extraction tool pulls the raw text from the same PDF. Any number in the Markdown that doesn't appear in the raw text is flagged and checked.
- In the app, estimates use the small rule book, and port questions fetch only the few matching passages. Per-message token cost stays low.
- Only company uploads are processed inside the app.

**B2. Fill the rule book (L; each port in parallel; needs A1's format, not its calculator).**
- The two readings, the grid comparison and the spot checks (section 3).
- A short "what changed since last year" note per port, with citations.
- Each port is released when it passes.

### Stream C — Documents and uploads (code)

**C1. Port questions (M).**
- A search tool over the committed port text and berth tables. Start with keyword search; add meaning-based search only if the test questions need it.
- Answers about berths, depths, rules and timings cite the page or berth table, or say "not in our documents".

**C2. Company uploads (M, after C1).**
- **One login = one company** in v1. Team accounts come later.
- Files are uploaded straight to Convex storage (not through the website server, which caps request size) and read in a Convex background action. PDF, Word and Excel are supported, with a progress indicator, replace and delete.
- Questions about company documents, with citations, never shown to another account.
- **Agreed rates:** a simple table the user fills in (charge, port, fixed rate or % discount). Estimates show "your agreed rate" next to the published rate. AI pre-filling from contracts can come later.

### Stream D — Ship lookup and freshness (code)

**D1. "My fleet" ship card (S).** No free service returns gross and net tonnage by IMO number; the paid ones charge per lookup. So in v1:
- The user types a ship's IMO, GRT, NRT, length and type once, from its tonnage certificate.
- The ship is saved to their company's fleet and filled in automatically next time.
- The ship card is editable.
- The existing lookup code stays switched off. A paid provider (e.g. VesselFinder) can be added later if the client wants automatic fill-in.

Known gap: the landing page promises automatic fill-in from an IMO number.

**D2. "Rates changed" alerts (S).**
- A scheduled job watches each recorded rate-document **link**, not the page around it (pages change constantly).
- Checks run twice a month for the Adani fuel-surcharge notices and monthly for the others.
- A change marks that port "rates may have changed; being checked" in answers.
- A short runbook explains how to update the rule book (the B2 steps).
- Answers show the "last checked" date and the version in force.

### Step E — Finish and hand over (M)

**Tests**
- Offline tests for every port and charge pass, including the grid.
- About 30 everyday-language questions, written before testing and covering all 6 abilities. Run on the cheaper model while building, then once on the chosen model.
- A test proves one account can never see another company's documents.

**Reviews**
- An independent review of the finished work.
- Then Codex review, as the product owner decided.

**Handover pack**
- **Coverage page and known gaps,** including that v1 covers about 10–16 ports, not "every major and private Indian port" as the landing page says.
- **Production setup:**
  - Convex production deploy;
  - environment settings: `PORTIA_ENABLED`, auth mode/allowlist, `LLM_ALLOW_PAID`, model keys, and the memory flag (set in both Vercel and Convex);
  - an OpenRouter spending cap;
  - transfer of key ownership to the client.
- **How to update rates** (the runbook), and what the client should check first.

## 5. Order at a glance

```
Day 1: Step 0 ─┬─► A0 ──► A1 ──► A3 ───────────────┐
               │         A2 (with A1) ─────────────┤
               ├─► B1 ──► B2 (ports in parallel) ──┼──► E (test, review, hand over)
               ├─► C1 ──► C2 ──────────────────────┤
               └─► D1, D2 ─────────────────────────┘
```

## 6. Deliberately not doing (to save time)

- Measuring the old loop's cost (it's already known); cost is logged in the new loop instead.
- An automatic draft-and-recheck pipeline for rate changes; an alert and a runbook replace it.
- Comparing documents during a chat; per-port "what changed" notes replace it.
- AI extraction of contract rates; a user-filled agreed-rates table replaces it.
- Processing port documents inside the app; they are processed once offline.
- Migrating the small facilities, or porting the tests of deleted code.
- Sealed-evaluation ceremonies, budget ledgers, freeze hashes.
- Team invites, email, password reset (put on the client launch list).
- GST lines (the landing page shows rates before GST).
- Meaning-based search before keyword search is shown to fall short.

## 7. Decisions

**On record (25 October 2026)**

| Topic | Decision |
|---|---|
| Users | Marine companies |
| Real bills / pilot users | None before handover; the client reviews v1 |
| Ports | 14–16 targeted; handover floor of 10 passing |
| Missing facts | Assume and show |
| Reviewers | None during the build; Codex reviews after; the client is the expert check |
| Cost target / model | < USD 0.05 per message; a cheaper model tried against Sol |
| Paid AI spend | USD 9 cap in total until handover, for test runs only. Set as the key's limit at openrouter.ai. |
| Test model | GPT-6 Luna for everyday testing while building. The final 30 questions run on Luna. They run on Sol too, as far as the cap allows: all 30 if it fits, otherwise the questions Luna failed. The cheapest model that passes the release gate becomes the model the app uses. |
| Second reading of rate schedules | Codex, on the existing plan (no OpenRouter cost) |
| Accounts | One login = one company in v1 |
| Memory (D-1) | Kept; saves happen directly; users delete them in the memory panel; no approval forms |
| Old test chats (D-2) | Wiped when switching to the new engine |
| Ship details (D-3) | "My fleet": typed once, remembered; no paid lookup in v1 |
| Privacy routing (D-5) | No change now (Azure, zero data retention). Decided again before company uploads go live. |
| GST | Before GST only |
| Rate checks | Monthly; twice a month for fuel surcharges |
| Release gate | Zero critical errors (a wrong figure shown as correct, or company data seen by another account); the whole grid matches; ≥ 90% of the everyday-language questions pass |
| Landing page | Deferred |

**Open:** none that block the build. To be decided before company uploads go live: privacy routing (D-5).

## 8. Risks

- **Interpretation errors without an expert.** Mitigated by section 3; the client review is the final check.
- **Documents.** Some ports post scans, partial notices or nothing. B1 confirms early and uses reserves.
- **Fast-changing items.** Adani fuel surcharges change about twice a month; D2 flags them.
- **AI understanding.** Code does all the maths; the everyday-language questions test understanding.
- **Cost.** Logged per run from A0 onward; history kept small; a cheaper model is tried.
- **Deletion traps.** Convex tool lists and validators must change together with the agent; old data is wiped at cutover (D-2).
