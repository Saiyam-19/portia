Stays: calculator, official tariff handlers, storage, UI, stale dispatch and cue checks; legacy retained.
Changes: strict semantic enums; numeric/date grounding only; catalog identity; numbered items; multi-input recovery.
Offline first. No holdout access, UI run or readiness claim.

Entry: `2ad38a5`, branch `pass1/golden-and-repairs`.
Budget: under USD 1, stop/reserve at USD 0.80. No new live calls yet.
Stop rule: same minimum 9.5 percentage-point reducer improvement after two changes;
with 60 captures, require at least 6 new acceptances and no regressions. Record full-answer checks separately.
Replay original 42 v1 proposals and 18 v2 fact outputs with their frozen dispatch snapshots.
Keep model arguments unchanged. Report any code-owned compatibility normalization explicitly;
old-contract replay is not evidence that a fresh model follows the new wire schema.
