# Berthwise v1: handover

Berthwise is a chat assistant for marine companies. It estimates and compares port-call costs at 12 Indian ports from each port's published rate schedule, answers questions from the ports' own documents and from the company's documents, and remembers the company's ships and agreed rates.

Status on 26 October 2026: built and tested on branch `berthwise-v1`; **not deployed**. The scope is section 1 of [the plan](../berthwise-plan.md).

## What v1 does

| From the plan | Where it is |
|---|---|
| Estimate a port call: port dues, pilotage, towage, berth hire, mooring and other standard charges, with each line's working and source page, total before GST | `estimate_port_call`; estimate card |
| Cargo charges (wharfage) for the main cargo types, from the cargo quantity | `estimate_port_call` with cargo; 123 rows across the 12 ports (`scripts/rulebook/wharfage.py`) |
| Voyage view: departure and arrival with a combined total | `estimate_port_call` with two calls |
| Compare ports: berth hire, whole bill, tariffs | `compare_ports` (views `berth-hire`, `whole-bill`, `tariff`) |
| Check rates are current: schedule in force, when checked, what changed | `port_tariff`; monthly link check and fuel-surcharge warnings ([updating rates](updating-rates.md)) |
| Ask about a port's berths, depths, rules, required documents and timings | `search_port_documents` over 67 official documents |
| Upload company documents and ask about them | Company documents page; `search_company_documents` |
| Use the company's agreed rates in estimates | Agreed rates page; shown beside published rates |
| Ship details typed once ("My fleet") | My fleet page; `find_ship`, `save_ship`, automatic fill-in |
| Plain English, assume and show | Agent instructions; assumptions listed on every estimate |
| Coverage page | Ports covered page |

Out of v1, as agreed: supplier quotes, team accounts, email, GST lines, landing-page changes, automatic ship look-up by IMO number (paid services only).

## Why the figures can be trusted

- **Two independent readings** of every rate schedule (Claude and Codex), compared over 14,700 priced calls; every difference was settled against the documents: [rulebook-resolutions.md](../rulebook-resolutions.md).
- **Wharfage read twice too:** 140 rates matched and 37 differed; each difference was settled against the documents, and the 20 that remain are deliberate and explained: [wharfage-resolutions.md](../wharfage-resolutions.md).
- **Every figure is checked** against a verbatim quote from its page by `tests/berthwise/rulebook-data.test.ts`.
- **Seven figures from the earlier, separately reviewed engine** reproduce exactly: `tests/berthwise/rulebook-oracles.test.ts`.
- **The model can't make up numbers:** every figure in a reply must come from the user or a tool result, or the reply is rewritten once and otherwise replaced.
- **Ship particulars, exchange rates and anchorage time come from the user,** never from the model: the tools drop anything the user didn't say.
- **Everyday questions** run end to end through the real model: 30 of 30 on both models after the code-review fixes ([Luna](evaluation/openai-gpt-6-luna-2026-10-25.md), [Sol](evaluation/openai-gpt-6-sol-2026-10-25.md)); with wharfage added, on the final code, 30 of 32 on Sol ([26 October](evaluation/openai-gpt-6-sol-2026-10-26.md)). Every answer was also read by hand: the two misses were correct answers worded in ways the automatic checks didn't list (the checks now accept them), and a reading by hand found one real fault the checks had passed, the saved ship not being filled in when the model repeated its name, which is fixed and covered by a test.

Points the documents leave unclear are listed for the client: [port-questions.md](port-questions.md).

## Codex code review (25 October 2026)

Codex reviewed the whole branch and raised ten findings; all ten are fixed, each with a test:

| Finding | Fix |
|---|---|
| Another account could attach someone else's uploaded file by its storage id | An upload is accepted only from the account that asked for the upload link, within the hour, and only once (`convex/companyDocs.ts`) |
| Cargo charges (wharfage) were silently missing from estimates with cargo | Every such estimate now says wharfage isn't in the rule book yet and isn't included |
| Small invented amounts ("USD 25 agency fee") could pass the number check | Amounts with a currency or a unit are always checked, whatever their size (`number-guard.ts`) |
| The model could supply a stay, anchorage time or exchange rate the user never gave | Each is kept only if the user said it, including short replies to a question ("48") (`user-input.ts`) |
| A whole bill with missing lines could be ranked cheapest | Comparisons with any missing price or open question aren't ranked, and say why |
| A fixed agreed amount added a charge the port doesn't levy | A fixed agreement only replaces a charge that is on the bill |
| Port dues for long stays were charged once | Port dues are charged again every 15 or 30 days as each schedule says (Hazira, Mundra, Chennai, Jaigarh, Pipavav) |
| Very long documents lost pages without saying so | The documents page says how far a long file was read |
| Editing an agreed rate left the old one active | An edit replaces the old rate |
| A bare reply to a question ("48") was ignored | It is read as the answer to what was asked |

## Decisions still open

1. **Model for v1: Sol (decided 26 October 2026).** Both models pass all 30 questions; Sol showed steadier judgement in testing (Luna once compared ports with the wrong tool before the instructions were tightened). Sol cost about US$ 0.02 a question in testing, Luna about US$ 0.001. Sol is the default; `BERTHWISE_MODEL=openai/gpt-6-luna` switches to Luna.
2. **Privacy routing for company documents (D-5).** Passages from uploaded documents are sent to the model through OpenRouter, routed only to Azure with zero data retention and data collection denied (`src/lib/migration/model.ts`). Confirm this is acceptable before clients upload real contracts.
3. **OpenRouter spending limit.** The key has a US$ 9 limit for testing (about US$ 2.64 spent by 26 October 2026). Raise it for real use.

## Deploying

Nothing in this branch has been deployed. Deploying writes to the live Convex and Vercel projects, so do it deliberately, following [deployment.md](../deployment.md):

1. **Convex.** The schema adds `fleetShips`, `companyDocuments`, `companyPassages` (with a full-text search index), `agreedRates` and `sourceChecks`, plus a daily cron (`convex/crons.ts`). `convex.json` tells Convex to install `unpdf`, `mammoth` and `exceljs` for the document reader. Old test chats from before the rebuild are wiped first (decision D-2): back up, clear the chat tables, then `npx convex deploy`. `convex/_generated/api.d.ts` was updated by hand; `npx convex dev` or `deploy` regenerates it.
2. **Environment (Next.js).** `OPENROUTER_API_KEY`, `LLM_ALLOW_PAID=true`, optionally `BERTHWISE_MODEL`, and the existing Convex and auth values in `.env.example`.
3. **Vercel.** Build and promote as in deployment.md. The chat route reads the ports' documents (Markdown copies) at runtime; PDFs are kept out of the bundle.

Not verified yet, because they need the deployed system: sign-in journeys with real accounts, uploads read by the deployed Convex job, the cron's first run, and the live chat with Convex.

## Keeping it current

- How to update rates when a port changes them: [updating-rates.md](updating-rates.md).
- How a second reader enters a schedule: [codex-second-reading.md](../codex-second-reading.md) and [rulebook-format.md](../rulebook-format.md).
- How to run the everyday questions again (about US$ 0.04 on Luna and US$ 0.62 on Sol per run):
  ```bash
  npx vitest run --config vitest.eval.config.ts
  BERTHWISE_MODEL=openai/gpt-6-luna npx vitest run --config vitest.eval.config.ts
  ```

## Known gaps

- **Wharfage** covers 20 cargo kinds at the 12 ports, read twice (Claude and Codex) and settled against the documents: [wharfage-resolutions.md](../wharfage-resolutions.md). Not priced, with the reason shown: liquids at Pipavav (charged per 1,000 litres), liquids at Mumbai (docks and oil terminals differ), JNPA's liquid terminal (its rate expired on 31 March 2025), container wharfage inside terminal or composite handling charges (JNPA, New Mangalore, Pipavav, Mumbai imports), Deendayal containers. Rates that fall with a user's annual volume use the first slab.
- Kamarajar's dry bulk anchorage (unclear unit) and Pipavav's tanker berth-hire minimum: see port-questions.md.
- Not priced: offshore buoy moorings (SPM/SBM), Mundra's crude oil jetty, Chennai cruise ships, Jaigarh's pilotage surcharge by ship age, Pipavav general-cargo berth hire and tankers over 60,000 GRT, Paradip's roadstead charge.
- A new schedule published under a new link (for example the annual indexation each 1 May) isn't detected automatically; check each port's tariff page in late April.
- Scanned company PDFs without a text layer can't be read.
