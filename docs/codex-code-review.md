# Task for Codex: review Berthwise v1 before handover

Berthwise v1 is built on branch `berthwise-v1`. Review it as an independent, sceptical reviewer: find defects that could give a marine company a wrong figure, show one company's data to another, or break in production. Report findings; don't fix them.

## Rules

1. Work in your own worktree so the main checkout stays untouched:
   ```bash
   git worktree add ../portia-review berthwise-v1 --detach
   cd ../portia-review && npm ci
   ```
2. Don't change, commit or push anything, and don't run the paid evaluation (`vitest.eval.config.ts`) or any deploy.
3. Read [docs/berthwise-plan.md](berthwise-plan.md) section 1 for the scope and [docs/handover/README.md](handover/README.md) for what was built.

## What to review, most important first

1. **Wrong figures.** `src/lib/berthwise/rulebook/calculate.ts` (bands, minimums per hour/day, minimum hours, percentages of other charges, VLCC fallback, which charges apply) and `src/lib/berthwise/tools.ts` (how ship details, stays and exchange rates are taken from the user, voyage and comparison totals, agreed rates in `agreed-rates.ts`). Spot-check a few estimates by hand against the rate schedules in `data/sources/`.
2. **Data kept apart.** `convex/fleet.ts`, `convex/companyDocs.ts`, `convex/companyDocsNode.ts`, `convex/agreedRates.ts`, `convex/sourceWatch.ts` and `convex/lib/account.ts`: can any account read, change or delete another's ships, documents, passages or rates? Can a replaced or deleted document's passages still be found?
3. **Made-up numbers.** `src/lib/berthwise/answer.ts`, `number-guard.ts` and the agent instructions in `src/lib/migration/domain-agent.ts`: can a figure reach the user that came from neither the user nor a tool?
4. **Production.** `next.config.ts` tracing, `convex.json`, the cron, upload limits, large files, and anything that only works locally.
5. **Plain English and accessibility** of the cards and pages in `src/components/chat/result-card.tsx`, `src/components/fleet/`, `src/components/company/` and `composer.tsx`.

## Check

```bash
npx tsc --noEmit -p . && npx tsc --noEmit -p convex && npx vitest run && npx next build
```

## Report back

A list of findings, most serious first. For each: file and line, what goes wrong, a concrete example (inputs and the wrong result), and how sure you are. Say plainly if you found nothing serious in an area.
