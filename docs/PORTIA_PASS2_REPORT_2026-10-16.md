Stays: calculator and tariff engine, persistence, UI, dispatch-snapshot stale checks.
Stays: negation, either/or-date, per-call/per-block cue checks; all R1 and D11 regressions.
Changes: model emits flat facts; code owns units, saved state, grounding and arithmetic.
Changes: enum yes/no fields, one internal repair, code-owned errors and tariff gaps.
Changes: keep instructions are no-ops; corrections replace one named line item.

Work in progress on `pass1/golden-and-repairs`, starting at `6781157`.
Sealed holdout excluded. No UI run or readiness claim.
Budget: strictly below USD 1; stop/reserve at USD 0.80. No paid calls yet.

Replay metric fixed before changes: all 42 dispatches remain in the denominator,
including missing/incomplete outputs. A reducer pass has no schema/evidence error
or conflicting new fact. Complete rendered answers are counted separately.
After two changes, continue only if reducer passes increase by at least 4/42
(9.5 percentage points), with no previously accepted output regressing.
The same unchanged captures are replayed against the legacy reducer. Flat-fact
adapter results, if measured, must be labelled separately and cannot replace this metric.
