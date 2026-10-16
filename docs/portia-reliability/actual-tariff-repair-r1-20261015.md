# Actual-tariff input repairs: bounded completion

Both reported regressions are repaired. Only production file changed: `src/lib/migration/official-berth.ts`. [Scoped diff](../../output/actual-tariff-repair-r1-20261015/revision.patch) · [File hashes](../../output/actual-tariff-repair-r1-20261015/changed-files.json).

| Finding | Change | Verified outcome |
|---|---|---|
| Cargo text swallowed a governing qualifier | Cargo coverage ends at modifying clauses. The already-required operating-condition dimensions are checked independently of neutral coverage; vessel/itinerary names remain separate from those conditions. | Original `with priority berthing` probe now asks only about conflicting priority information and produces no ledger/amount. Penalty, rebate, ousting and narrative-position neighbors also require clarification. Plain cargo descriptions and names containing “Priority” retain the ordinary result. |
| Rule explanations triggered quote intake | The new quote path requires a direct estimation/calculation request. Merely discussing how a calculation works does not activate it. | Original rule question bypasses new intake. Existing main→specialist→rule-answer path runs without forced vessel/visit questions in mocked-model integration. No live rule-explanation behavior is claimed. |

The unchanged four-case parent probe now gives: control ready/verifiedINR51,094; rule question outside quote intake; cargo and separate priority clauses each produce focused clarification. [Exact observations](../../output/actual-tariff-repair-r1-20261015/parent-probe-after.json). No priority-rate or other new rule family was introduced.

Before repair,11of13new assertions failed. After repair,68focused checks across6files passed, followed by17final input checks including two additional identity-name positives. These sets overlap. Typecheck, final Webpack build and changed-file lint passed. The previous parent611/60file full-suite result remains historical; no unchanged broad suite was repeated.

**Genuine unchanged Mumbai rerun passed on15Oct2026 around14:00IST:** INR43,300 berth hire +INR7,794 GST =**INR51,094**. Stream clean; completed saved message and reload match; final response is byte-identical to the earlier successful response. Input, source/oracle freeze, D01 and prior quotation repairs remain unchanged.

[Actual response](../../output/actual-tariff-repair-r1-20261015/actual-response.txt) · [Displayed](../../output/actual-tariff-repair-r1-20261015/live-display.png) · [Reload](../../output/actual-tariff-repair-r1-20261015/live-reload.png) · [Journey](../../output/actual-tariff-repair-r1-20261015/live-journey.json) · [Verification](../../output/actual-tariff-repair-r1-20261015/verification.json).

Acceptance-harness change: evidence logging can use a new directory while reservations remain in the original durable budget directory. The rerun ceiling was4overall, so only slots3and4 were available. Both returnedHTTP200; exactly2additional free dispatches, **4of8total tariff-batch calls**, same pinned model/key, zero prices, retries0, fallbackfalse. Earlier logs/evidence retain their hashes. [New dispatch events](../../output/actual-tariff-repair-r1-20261015/provider-events.jsonl). No provider/key probe or cycling.

All16ports,17original source assets, approved source versions, three original frozen files and the newly approved case freeze remain intact. Holdout unread. No source research, provider migration, deployment, commit or push.

Owned backend/app/browser/check groups stopped; all15pre-live listener endpoints preserved. Entry-to-pre-live snapshots show only macOS `rapportd` PID917 changed its port; no existing software was stopped or reused. Broader original coverage/release limits from the [actual-tariff packet](actual-tariff-flow-20261015.md) remain. Write ownership released for bounded review.
