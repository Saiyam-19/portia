# Phase A quotation oracle — author draft

**DRAFT—INDEPENDENT APPROVAL PENDING**

Version 1.0-draft · 17 October 2026 · external inference calls: 0 · external inference cost: USD 0.00.

Five original cases supply six messages. Ten Codex-authored paraphrases for independent review make 16 independently evaluable records. Corrections include the preceding authored initial message, never model state. Labels below are Codex author work only, awaiting independent recomputation.

These are supplied fictional quotation exercises. Quoted terms govern. Official tariffs are neither required nor a substitute. This document makes no application readiness or verified tariff-authority claim.

## Reading rules

Supplied/none facts have exact substring evidence. `none` means explicitly excluded; `not_stated` means absent and must never become zero, false or an invented term. Numeric zeros, billable periods and converted durations are derived outputs. Context facts stay separate from current-message extraction. Semantic normalizations and assumptions are disclosed. No code-derived extraction values are used.

Canonical source: `tests/migration/pass1/inputs.json`, SHA-256 `52b1162c8ba5a54e9903028565f46da4c0100cf2b79adf2263a90143b58b1832`. Copies, decoded-message hashes and pointers: `source/manifest.json`. See SOURCE_EVIDENCE.md for provenance limits.

## D11-original

Case `D11` · original · source pointer `/inputs/D11/0` · variant of `None`

Original decoded-message SHA-256: `ca0830370cdc5e4f93be1f85048d4f02dd6d158c7e2d025be00bac0145422310`

### Exact current user message

```text
Check a quote labelled Nhava Sheva International Container Terminal for fictional MV Glass Petrel. It says berth hire is USD 0.04 per GT for each started 12-hour block, with a USD 1,100 minimum per call and a USD 1,800 cap per call. We are 9,000 GT and alongside for 25 hours. No other charges or tax. What is payable?
```

Prior-user context: none (first-turn record).

### Current-message extraction

| Fact | Status | Supplied value / meaning | Exact supporting substring |
|---|---|---|---|
| `current.request.type` | supplied | "calculate_payable_quoted_berth_hire" | “What is payable?” |
| `current.quote.label` | supplied | "Nhava Sheva International Container Terminal" | “Nhava Sheva International Container Terminal” |
| `current.vessel.name` | supplied | "MV Glass Petrel" | “MV Glass Petrel” |
| `current.vessel.fictional_qualifier` | supplied | "fictional" | “fictional MV Glass Petrel” |
| `current.vessel.tonnage` | supplied | {"value": "9000", "unit": "GT"} | “9,000 GT” |
| `current.stay.duration_components` | supplied | [{"value": "25", "unit": "hours"}] | “25 hours” |
| `current.charge.name` | supplied | "berth hire" | “berth hire” |
| `current.charge.kind` | supplied | "rate" | “USD 0.04 per GT for each started 12-hour block” |
| `current.charge.rate` | supplied | {"value": "0.04", "currency": "USD"} | “USD 0.04” |
| `current.charge.tonnage_denominator` | supplied | {"value": "1", "unit": "GT"} — The word per expresses a unit denominator; retain GT, never substitute GRT. | “per GT” |
| `current.charge.period` | supplied | {"value": "12", "unit": "hours"} | “12-hour block” |
| `current.charge.period_rounding` | supplied | {"mode": "ceiling", "stage": "total alongside duration divided by 12 hours", "scope": "call"} | “each started 12-hour block” |
| `current.charge.minimum` | supplied | {"value": "1100", "currency": "USD", "scope": "per call"} | “USD 1,100 minimum per call” |
| `current.charge.cap` | supplied | {"value": "1800", "currency": "USD", "scope": "per call"} | “USD 1,800 cap per call” |
| `current.tax` | none | null | “No other charges or tax” |
| `current.other_charges` | none | null | “No other charges or tax” |

### Context-only facts

None.

### Not stated

`vessel.GRT`, `vessel.other_particulars`, `stay.start_timestamp`, `stay.end_timestamp`, `stay.time_zone`, `monetary_rounding`, `discounts`, `other_adjustments`, `fx`.

Scope: current message plus explicit prior-user context. These fields are not silently assigned values.

### Hand-worked arithmetic — derived oracle outputs

| Step | Arithmetic | Result | Dependencies |
|---|---|---|---|
| `billable_blocks` | ceil(25 / 12) = ceil(2 + 1/12) = 3 | 3 12-hour blocks | `current.stay.duration_components`, `current.charge.period`, `current.charge.period_rounding` |
| `charge_per_block` | 9000 × 0.04 = 360 | 360.00 USD/block | `current.vessel.tonnage`, `current.charge.rate`, `current.charge.tonnage_denominator` |
| `unconstrained_berth_hire` | 360 × 3 = 1080 | 1080.00 USD | `charge_per_block`, `billable_blocks` |
| `after_call_minimum` | max(1080, 1100) = 1100 | 1100.00 USD | `unconstrained_berth_hire`, `current.charge.minimum` |
| `after_call_cap` | min(1100, 1800) = 1100 | 1100.00 USD | `after_call_minimum`, `current.charge.cap` |
| `tax_amount` | No tax ⇒ additive tax amount 0 — Derived tax zero; not a supplied numeric tax rate or amount. | 0.00 USD | `current.tax` |
| `other_charge_amount` | No other charges ⇒ additional charge amount 0 | 0.00 USD | `current.other_charges` |
| `payable` | 1100 + 0 + 0 = 1100 | 1100.00 USD | `after_call_cap`, `tax_amount`, `other_charge_amount` |

### Expected final answer — derived

3 started 12-hour blocks. Raw berth hire USD 1,080.00; per-call minimum raises it to USD 1,100.00; USD 1,800 cap does not bind. Payable USD 1,100.00.

### Ambiguities / assumptions / scope limits

- **D11-scope (assumption)**: Treat the quote label only as the supplied quotation identity. Apply its minimum and cap once to the call. Do not substitute an official terminal tariff. Unstated discounts/adjustments are not invented. Impact: The result is for the supplied quotation only. Independent review: pending.
- **D11-money-rounding (unspecified_detail)**: Monetary rounding is not stated. Two decimal places here only format exact amounts. Impact: None: all derived USD amounts are exact cents. Independent review: pending.

Code-derived extraction values: none.

## D11-v1

Case `D11` · authored_paraphrase · source pointer `/inputs/D11/0` · variant of `D11-original`

Original decoded-message SHA-256: `ca0830370cdc5e4f93be1f85048d4f02dd6d158c7e2d025be00bac0145422310`

### Exact current user message

```text
For fictional MV Glass Petrel, check the quote labelled Nhava Sheva International Container Terminal. The vessel is 9,000 GT; its alongside stay is 25 hours. Berth hire: USD 0.04 per GT for each started 12-hour block. The minimum is USD 1,100 per call and the cap is USD 1,800 per call. No other charges or tax. What amount is payable?
```

Prior-user context: none (first-turn record).

### Current-message extraction

| Fact | Status | Supplied value / meaning | Exact supporting substring |
|---|---|---|---|
| `current.request.type` | supplied | "calculate_payable_quoted_berth_hire" | “What amount is payable?” |
| `current.quote.label` | supplied | "Nhava Sheva International Container Terminal" | “Nhava Sheva International Container Terminal” |
| `current.vessel.name` | supplied | "MV Glass Petrel" | “MV Glass Petrel” |
| `current.vessel.fictional_qualifier` | supplied | "fictional" | “fictional MV Glass Petrel” |
| `current.vessel.tonnage` | supplied | {"value": "9000", "unit": "GT"} | “9,000 GT” |
| `current.stay.duration_components` | supplied | [{"value": "25", "unit": "hours"}] | “25 hours” |
| `current.charge.name` | supplied | "berth hire" | “Berth hire” |
| `current.charge.kind` | supplied | "rate" | “USD 0.04 per GT for each started 12-hour block” |
| `current.charge.rate` | supplied | {"value": "0.04", "currency": "USD"} | “USD 0.04” |
| `current.charge.tonnage_denominator` | supplied | {"value": "1", "unit": "GT"} — The word per expresses a unit denominator; retain GT, never substitute GRT. | “per GT” |
| `current.charge.period` | supplied | {"value": "12", "unit": "hours"} | “12-hour block” |
| `current.charge.period_rounding` | supplied | {"mode": "ceiling", "stage": "total alongside duration divided by 12 hours", "scope": "call"} | “each started 12-hour block” |
| `current.charge.minimum` | supplied | {"value": "1100", "currency": "USD", "scope": "per call"} | “minimum is USD 1,100 per call” |
| `current.charge.cap` | supplied | {"value": "1800", "currency": "USD", "scope": "per call"} | “cap is USD 1,800 per call” |
| `current.tax` | none | null | “No other charges or tax” |
| `current.other_charges` | none | null | “No other charges or tax” |

### Context-only facts

None.

### Not stated

`vessel.GRT`, `vessel.other_particulars`, `stay.start_timestamp`, `stay.end_timestamp`, `stay.time_zone`, `monetary_rounding`, `discounts`, `other_adjustments`, `fx`.

Scope: current message plus explicit prior-user context. These fields are not silently assigned values.

### Hand-worked arithmetic — derived oracle outputs

| Step | Arithmetic | Result | Dependencies |
|---|---|---|---|
| `billable_blocks` | ceil(25 / 12) = ceil(2 + 1/12) = 3 | 3 12-hour blocks | `current.stay.duration_components`, `current.charge.period`, `current.charge.period_rounding` |
| `charge_per_block` | 9000 × 0.04 = 360 | 360.00 USD/block | `current.vessel.tonnage`, `current.charge.rate`, `current.charge.tonnage_denominator` |
| `unconstrained_berth_hire` | 360 × 3 = 1080 | 1080.00 USD | `charge_per_block`, `billable_blocks` |
| `after_call_minimum` | max(1080, 1100) = 1100 | 1100.00 USD | `unconstrained_berth_hire`, `current.charge.minimum` |
| `after_call_cap` | min(1100, 1800) = 1100 | 1100.00 USD | `after_call_minimum`, `current.charge.cap` |
| `tax_amount` | No tax ⇒ additive tax amount 0 — Derived tax zero; not a supplied numeric tax rate or amount. | 0.00 USD | `current.tax` |
| `other_charge_amount` | No other charges ⇒ additional charge amount 0 | 0.00 USD | `current.other_charges` |
| `payable` | 1100 + 0 + 0 = 1100 | 1100.00 USD | `after_call_cap`, `tax_amount`, `other_charge_amount` |

### Expected final answer — derived

3 started 12-hour blocks. Raw berth hire USD 1,080.00; per-call minimum raises it to USD 1,100.00; USD 1,800 cap does not bind. Payable USD 1,100.00.

### Ambiguities / assumptions / scope limits

- **D11-scope (assumption)**: Treat the quote label only as the supplied quotation identity. Apply its minimum and cap once to the call. Do not substitute an official terminal tariff. Unstated discounts/adjustments are not invented. Impact: The result is for the supplied quotation only. Independent review: pending.
- **D11-money-rounding (unspecified_detail)**: Monetary rounding is not stated. Two decimal places here only format exact amounts. Impact: None: all derived USD amounts are exact cents. Independent review: pending.

Code-derived extraction values: none.

## D11-v2

Case `D11` · authored_paraphrase · source pointer `/inputs/D11/0` · variant of `D11-original`

Original decoded-message SHA-256: `ca0830370cdc5e4f93be1f85048d4f02dd6d158c7e2d025be00bac0145422310`

### Exact current user message

```text
What do we pay under the quote labelled Nhava Sheva International Container Terminal for fictional MV Glass Petrel? Alongside time is 25 hours and vessel tonnage is 9,000 GT. Charge berth hire at USD 0.04 per GT for each started 12-hour block, subject to a USD 1,100 minimum per call and a USD 1,800 cap per call. No other charges or tax.
```

Prior-user context: none (first-turn record).

### Current-message extraction

| Fact | Status | Supplied value / meaning | Exact supporting substring |
|---|---|---|---|
| `current.request.type` | supplied | "calculate_payable_quoted_berth_hire" | “What do we pay” |
| `current.quote.label` | supplied | "Nhava Sheva International Container Terminal" | “Nhava Sheva International Container Terminal” |
| `current.vessel.name` | supplied | "MV Glass Petrel" | “MV Glass Petrel” |
| `current.vessel.fictional_qualifier` | supplied | "fictional" | “fictional MV Glass Petrel” |
| `current.vessel.tonnage` | supplied | {"value": "9000", "unit": "GT"} | “9,000 GT” |
| `current.stay.duration_components` | supplied | [{"value": "25", "unit": "hours"}] | “25 hours” |
| `current.charge.name` | supplied | "berth hire" | “berth hire” |
| `current.charge.kind` | supplied | "rate" | “USD 0.04 per GT for each started 12-hour block” |
| `current.charge.rate` | supplied | {"value": "0.04", "currency": "USD"} | “USD 0.04” |
| `current.charge.tonnage_denominator` | supplied | {"value": "1", "unit": "GT"} — The word per expresses a unit denominator; retain GT, never substitute GRT. | “per GT” |
| `current.charge.period` | supplied | {"value": "12", "unit": "hours"} | “12-hour block” |
| `current.charge.period_rounding` | supplied | {"mode": "ceiling", "stage": "total alongside duration divided by 12 hours", "scope": "call"} | “each started 12-hour block” |
| `current.charge.minimum` | supplied | {"value": "1100", "currency": "USD", "scope": "per call"} | “USD 1,100 minimum per call” |
| `current.charge.cap` | supplied | {"value": "1800", "currency": "USD", "scope": "per call"} | “USD 1,800 cap per call” |
| `current.tax` | none | null | “No other charges or tax” |
| `current.other_charges` | none | null | “No other charges or tax” |

### Context-only facts

None.

### Not stated

`vessel.GRT`, `vessel.other_particulars`, `stay.start_timestamp`, `stay.end_timestamp`, `stay.time_zone`, `monetary_rounding`, `discounts`, `other_adjustments`, `fx`.

Scope: current message plus explicit prior-user context. These fields are not silently assigned values.

### Hand-worked arithmetic — derived oracle outputs

| Step | Arithmetic | Result | Dependencies |
|---|---|---|---|
| `billable_blocks` | ceil(25 / 12) = ceil(2 + 1/12) = 3 | 3 12-hour blocks | `current.stay.duration_components`, `current.charge.period`, `current.charge.period_rounding` |
| `charge_per_block` | 9000 × 0.04 = 360 | 360.00 USD/block | `current.vessel.tonnage`, `current.charge.rate`, `current.charge.tonnage_denominator` |
| `unconstrained_berth_hire` | 360 × 3 = 1080 | 1080.00 USD | `charge_per_block`, `billable_blocks` |
| `after_call_minimum` | max(1080, 1100) = 1100 | 1100.00 USD | `unconstrained_berth_hire`, `current.charge.minimum` |
| `after_call_cap` | min(1100, 1800) = 1100 | 1100.00 USD | `after_call_minimum`, `current.charge.cap` |
| `tax_amount` | No tax ⇒ additive tax amount 0 — Derived tax zero; not a supplied numeric tax rate or amount. | 0.00 USD | `current.tax` |
| `other_charge_amount` | No other charges ⇒ additional charge amount 0 | 0.00 USD | `current.other_charges` |
| `payable` | 1100 + 0 + 0 = 1100 | 1100.00 USD | `after_call_cap`, `tax_amount`, `other_charge_amount` |

### Expected final answer — derived

3 started 12-hour blocks. Raw berth hire USD 1,080.00; per-call minimum raises it to USD 1,100.00; USD 1,800 cap does not bind. Payable USD 1,100.00.

### Ambiguities / assumptions / scope limits

- **D11-scope (assumption)**: Treat the quote label only as the supplied quotation identity. Apply its minimum and cap once to the call. Do not substitute an official terminal tariff. Unstated discounts/adjustments are not invented. Impact: The result is for the supplied quotation only. Independent review: pending.
- **D11-money-rounding (unspecified_detail)**: Monetary rounding is not stated. Two decimal places here only format exact amounts. Impact: None: all derived USD amounts are exact cents. Independent review: pending.

Code-derived extraction values: none.

## D19-initial-original

Case `D19` · original · source pointer `/inputs/D19/0` · variant of `None`

Original decoded-message SHA-256: `780686db49359bf083a67bbc5b0b796fff3dfad578f6488068887fc4c9dbfb53`

### Exact current user message

```text
For a fictional vessel quote, add USD 825 berth hire, USD 390 pilotage and USD 65 water supply. No tax. Please keep the line items.
```

Prior-user context: none (first-turn record).

### Current-message extraction

| Fact | Status | Supplied value / meaning | Exact supporting substring |
|---|---|---|---|
| `current.request.type` | supplied | "sum_quoted_line_amounts" | “add USD 825” |
| `current.request.keep_line_items` | supplied | "keep" | “Please keep the line items” |
| `current.quote.fictional_qualifier` | supplied | "fictional vessel quote" | “fictional vessel quote” |
| `current.lines.berth_hire` | supplied | {"name": "berth hire", "kind": "amount", "value": "825", "currency": "USD"} — Quoted monetary line amount, not a unit rate; no vessel or time multiplication. | “USD 825 berth hire” |
| `current.lines.pilotage` | supplied | {"name": "pilotage", "kind": "amount", "value": "390", "currency": "USD"} — Quoted monetary line amount, not a unit rate; no vessel or time multiplication. | “USD 390 pilotage” |
| `current.lines.water_supply` | supplied | {"name": "water supply", "kind": "amount", "value": "65", "currency": "USD"} — Quoted monetary line amount, not a unit rate; no vessel or time multiplication. | “USD 65 water supply” |
| `current.tax` | none | null | “No tax” |

### Context-only facts

None.

### Not stated

`vessel.name`, `vessel.GT`, `vessel.GRT`, `vessel.other_particulars`, `port`, `stay.duration_components`, `stay.start_timestamp`, `stay.end_timestamp`, `stay.time_zone`, `unit_rates`, `basis_denominator`, `billing_period`, `duration_rounding`, `monetary_rounding`, `minimum`, `cap`, `discounts`, `surcharges`, `other_charges`, `fx`.

Scope: current message plus explicit prior-user context. These fields are not silently assigned values.

### Hand-worked arithmetic — derived oracle outputs

| Step | Arithmetic | Result | Dependencies |
|---|---|---|---|
| `berth_plus_pilotage` | 825 + 390 = 1215 | 1215.00 USD | `current.lines.berth_hire`, `current.lines.pilotage` |
| `line_subtotal` | 1215 + 65 = 1280 | 1280.00 USD | `berth_plus_pilotage`, `current.lines.water_supply` |
| `tax_amount` | No tax ⇒ additive tax amount 0 | 0.00 USD | `current.tax` |
| `total` | 1280 + 0 = 1280 | 1280.00 USD | `line_subtotal`, `tax_amount` |

### Expected final answer — derived

Berth hire USD 825.00; pilotage USD 390.00; water supply USD 65.00. Total USD 1280.00; no tax.

### Ambiguities / assumptions / scope limits

- **D19-amounts (scope_assumption)**: Add the listed money amounts as amounts, not rates. Minimum, cap, duration, extras, and FX are not supplied. Impact: This is the requested line-item sum, not a claim that every possible port charge is absent. Independent review: pending.

Code-derived extraction values: none.

## D19-initial-v1

Case `D19` · authored_paraphrase · source pointer `/inputs/D19/0` · variant of `D19-initial-original`

Original decoded-message SHA-256: `780686db49359bf083a67bbc5b0b796fff3dfad578f6488068887fc4c9dbfb53`

### Exact current user message

```text
Please total these amounts for a fictional vessel quote and retain the line items: water supply USD 65, berth hire USD 825, and pilotage USD 390. No tax.
```

Prior-user context: none (first-turn record).

### Current-message extraction

| Fact | Status | Supplied value / meaning | Exact supporting substring |
|---|---|---|---|
| `current.request.type` | supplied | "sum_quoted_line_amounts" | “Please total these amounts” |
| `current.request.keep_line_items` | supplied | "keep" | “retain the line items” |
| `current.quote.fictional_qualifier` | supplied | "fictional vessel quote" | “fictional vessel quote” |
| `current.lines.berth_hire` | supplied | {"name": "berth hire", "kind": "amount", "value": "825", "currency": "USD"} — Quoted monetary line amount, not a unit rate; no vessel or time multiplication. | “berth hire USD 825” |
| `current.lines.pilotage` | supplied | {"name": "pilotage", "kind": "amount", "value": "390", "currency": "USD"} — Quoted monetary line amount, not a unit rate; no vessel or time multiplication. | “pilotage USD 390” |
| `current.lines.water_supply` | supplied | {"name": "water supply", "kind": "amount", "value": "65", "currency": "USD"} — Quoted monetary line amount, not a unit rate; no vessel or time multiplication. | “water supply USD 65” |
| `current.tax` | none | null | “No tax” |

### Context-only facts

None.

### Not stated

`vessel.name`, `vessel.GT`, `vessel.GRT`, `vessel.other_particulars`, `port`, `stay.duration_components`, `stay.start_timestamp`, `stay.end_timestamp`, `stay.time_zone`, `unit_rates`, `basis_denominator`, `billing_period`, `duration_rounding`, `monetary_rounding`, `minimum`, `cap`, `discounts`, `surcharges`, `other_charges`, `fx`.

Scope: current message plus explicit prior-user context. These fields are not silently assigned values.

### Hand-worked arithmetic — derived oracle outputs

| Step | Arithmetic | Result | Dependencies |
|---|---|---|---|
| `berth_plus_pilotage` | 825 + 390 = 1215 | 1215.00 USD | `current.lines.berth_hire`, `current.lines.pilotage` |
| `line_subtotal` | 1215 + 65 = 1280 | 1280.00 USD | `berth_plus_pilotage`, `current.lines.water_supply` |
| `tax_amount` | No tax ⇒ additive tax amount 0 | 0.00 USD | `current.tax` |
| `total` | 1280 + 0 = 1280 | 1280.00 USD | `line_subtotal`, `tax_amount` |

### Expected final answer — derived

Berth hire USD 825.00; pilotage USD 390.00; water supply USD 65.00. Total USD 1280.00; no tax.

### Ambiguities / assumptions / scope limits

- **D19-amounts (scope_assumption)**: Add the listed money amounts as amounts, not rates. Minimum, cap, duration, extras, and FX are not supplied. Impact: This is the requested line-item sum, not a claim that every possible port charge is absent. Independent review: pending.

Code-derived extraction values: none.

## D19-correction-original

Case `D19` · original · source pointer `/inputs/D19/1` · variant of `None`

Original decoded-message SHA-256: `ea0c4184c579e7fc9463d0c9f75516a44b57e8e39b439d5d4adee1cfe5072077`

### Exact current user message

```text
The water supply is now USD 80. Please update the total and keep the other two charges.
```

### Explicit prior-user context

User message `D19-initial-original`; source `/inputs/D19/0`; original.

```text
For a fictional vessel quote, add USD 825 berth hire, USD 390 pilotage and USD 65 water supply. No tax. Please keep the line items.
```

### Current-message extraction

| Fact | Status | Supplied value / meaning | Exact supporting substring |
|---|---|---|---|
| `current.request.type` | supplied | "replace_line_amount_and_retotal" | “Please update the total” |
| `current.correction.target` | supplied | "water supply" | “water supply” |
| `current.correction.operation` | supplied | "replace_existing_amount" | “is now USD 80” |
| `current.lines.water_supply` | supplied | {"name": "water supply", "kind": "amount", "value": "80", "currency": "USD"} | “water supply is now USD 80” |
| `current.correction.keep_other_lines` | supplied | "keep the other two charges unchanged" — Other two charges resolve to berth hire and pilotage only by reading the supplied prior user message. | “keep the other two charges” |

### Context-only facts

| Fact | Status | Supplied value / meaning | Exact supporting substring |
|---|---|---|---|
| `context.lines.berth_hire` | supplied | {"name": "berth hire", "kind": "amount", "value": "825", "currency": "USD"} | “USD 825 berth hire” |
| `context.lines.pilotage` | supplied | {"name": "pilotage", "kind": "amount", "value": "390", "currency": "USD"} | “USD 390 pilotage” |
| `context.lines.water_supply` | supplied | {"name": "water supply", "kind": "amount", "value": "65", "currency": "USD"} | “USD 65 water supply” |
| `context.tax` | none | null | “No tax” |
| `context.request.keep_line_items` | supplied | "keep" | “Please keep the line items” |
| `context.quote.fictional_qualifier` | supplied | "fictional vessel quote" | “fictional vessel quote” |

### Not stated

`vessel.name`, `vessel.GT`, `vessel.GRT`, `vessel.other_particulars`, `port`, `stay.duration_components`, `stay.start_timestamp`, `stay.end_timestamp`, `stay.time_zone`, `unit_rates`, `basis_denominator`, `billing_period`, `duration_rounding`, `monetary_rounding`, `minimum`, `cap`, `discounts`, `surcharges`, `other_charges`, `fx`.

Scope: current message plus explicit prior-user context. These fields are not silently assigned values.

### Correction resolution

- `lines.berth_hire`: carry_forward from `context.lines.berth_hire`.
- `lines.pilotage`: carry_forward from `context.lines.pilotage`.
- `lines.water_supply`: replace from `current.lines.water_supply`; supersedes `context.lines.water_supply`.
- `tax`: carry_forward from `context.tax`.
- `request.keep_line_items`: carry_forward from `context.request.keep_line_items`.
- `quote.fictional_qualifier`: carry_forward from `context.quote.fictional_qualifier`.

### Hand-worked arithmetic — derived oracle outputs

| Step | Arithmetic | Result | Dependencies |
|---|---|---|---|
| `unchanged_line_subtotal` | 825 + 390 = 1215 | 1215.00 USD | `context.lines.berth_hire`, `context.lines.pilotage`, `current.correction.keep_other_lines` |
| `corrected_line_subtotal` | 1215 + 80 = 1295 | 1295.00 USD | `unchanged_line_subtotal`, `current.lines.water_supply`, `current.correction.operation` |
| `tax_amount` | Prior No tax remains unamended ⇒ additive tax amount 0 | 0.00 USD | `context.tax` |
| `total` | 1295 + 0 = 1295 | 1295.00 USD | `corrected_line_subtotal`, `tax_amount` |
| `change_from_previous_total` | (80 − 65) = 15 | 15.00 USD | `current.lines.water_supply`, `context.lines.water_supply` |

### Expected final answer — derived

Berth hire USD 825.00; pilotage USD 390.00; water supply USD 80.00. Total USD 1295.00; no tax.

### Ambiguities / assumptions / scope limits

- **D19-correction-carry (assumption)**: A correction replaces only the water amount. Prior no-tax instruction and line-item presentation remain in force; the other two charges are explicitly retained. Current message alone does not supply USD 825, USD 390, the old USD 65, or no tax. Impact: Corrected total depends on the explicit authored prior-user context. Independent review: pending.
- **D19-amounts (scope_assumption)**: Add the listed money amounts as amounts, not rates. Minimum, cap, duration, extras, and FX are not supplied. Impact: This is the requested line-item sum, not a claim that every possible port charge is absent. Independent review: pending.

Code-derived extraction values: none.

## D19-correction-v1

Case `D19` · authored_paraphrase · source pointer `/inputs/D19/1` · variant of `D19-correction-original`

Original decoded-message SHA-256: `ea0c4184c579e7fc9463d0c9f75516a44b57e8e39b439d5d4adee1cfe5072077`

### Exact current user message

```text
Revise the water supply amount to USD 80, update the total, and leave the other two charges unchanged.
```

### Explicit prior-user context

User message `D19-initial-v1`; source `/inputs/D19/0`; authored_paraphrase.

```text
Please total these amounts for a fictional vessel quote and retain the line items: water supply USD 65, berth hire USD 825, and pilotage USD 390. No tax.
```

### Current-message extraction

| Fact | Status | Supplied value / meaning | Exact supporting substring |
|---|---|---|---|
| `current.request.type` | supplied | "replace_line_amount_and_retotal" | “update the total” |
| `current.correction.target` | supplied | "water supply" | “water supply” |
| `current.correction.operation` | supplied | "replace_existing_amount" | “Revise the water supply amount to USD 80” |
| `current.lines.water_supply` | supplied | {"name": "water supply", "kind": "amount", "value": "80", "currency": "USD"} | “water supply amount to USD 80” |
| `current.correction.keep_other_lines` | supplied | "keep the other two charges unchanged" — Other two charges resolve to berth hire and pilotage only by reading the supplied prior user message. | “leave the other two charges unchanged” |

### Context-only facts

| Fact | Status | Supplied value / meaning | Exact supporting substring |
|---|---|---|---|
| `context.lines.berth_hire` | supplied | {"name": "berth hire", "kind": "amount", "value": "825", "currency": "USD"} | “berth hire USD 825” |
| `context.lines.pilotage` | supplied | {"name": "pilotage", "kind": "amount", "value": "390", "currency": "USD"} | “pilotage USD 390” |
| `context.lines.water_supply` | supplied | {"name": "water supply", "kind": "amount", "value": "65", "currency": "USD"} | “water supply USD 65” |
| `context.tax` | none | null | “No tax” |
| `context.request.keep_line_items` | supplied | "keep" | “retain the line items” |
| `context.quote.fictional_qualifier` | supplied | "fictional vessel quote" | “fictional vessel quote” |

### Not stated

`vessel.name`, `vessel.GT`, `vessel.GRT`, `vessel.other_particulars`, `port`, `stay.duration_components`, `stay.start_timestamp`, `stay.end_timestamp`, `stay.time_zone`, `unit_rates`, `basis_denominator`, `billing_period`, `duration_rounding`, `monetary_rounding`, `minimum`, `cap`, `discounts`, `surcharges`, `other_charges`, `fx`.

Scope: current message plus explicit prior-user context. These fields are not silently assigned values.

### Correction resolution

- `lines.berth_hire`: carry_forward from `context.lines.berth_hire`.
- `lines.pilotage`: carry_forward from `context.lines.pilotage`.
- `lines.water_supply`: replace from `current.lines.water_supply`; supersedes `context.lines.water_supply`.
- `tax`: carry_forward from `context.tax`.
- `request.keep_line_items`: carry_forward from `context.request.keep_line_items`.
- `quote.fictional_qualifier`: carry_forward from `context.quote.fictional_qualifier`.

### Hand-worked arithmetic — derived oracle outputs

| Step | Arithmetic | Result | Dependencies |
|---|---|---|---|
| `unchanged_line_subtotal` | 825 + 390 = 1215 | 1215.00 USD | `context.lines.berth_hire`, `context.lines.pilotage`, `current.correction.keep_other_lines` |
| `corrected_line_subtotal` | 1215 + 80 = 1295 | 1295.00 USD | `unchanged_line_subtotal`, `current.lines.water_supply`, `current.correction.operation` |
| `tax_amount` | Prior No tax remains unamended ⇒ additive tax amount 0 | 0.00 USD | `context.tax` |
| `total` | 1295 + 0 = 1295 | 1295.00 USD | `corrected_line_subtotal`, `tax_amount` |
| `change_from_previous_total` | (80 − 65) = 15 | 15.00 USD | `current.lines.water_supply`, `context.lines.water_supply` |

### Expected final answer — derived

Berth hire USD 825.00; pilotage USD 390.00; water supply USD 80.00. Total USD 1295.00; no tax.

### Ambiguities / assumptions / scope limits

- **D19-correction-carry (assumption)**: A correction replaces only the water amount. Prior no-tax instruction and line-item presentation remain in force; the other two charges are explicitly retained. Current message alone does not supply USD 825, USD 390, the old USD 65, or no tax. Impact: Corrected total depends on the explicit authored prior-user context. Independent review: pending.
- **D19-amounts (scope_assumption)**: Add the listed money amounts as amounts, not rates. Minimum, cap, duration, extras, and FX are not supplied. Impact: This is the requested line-item sum, not a claim that every possible port charge is absent. Independent review: pending.

Code-derived extraction values: none.

## D24-original

Case `D24` · original · source pointer `/inputs/D24/0` · variant of `None`

Original decoded-message SHA-256: `568e1c9bd809e1b2322f7e66c37065aa8e2971d3c2ef20c126daae45c98b69c6`

### Exact current user message

```text
Two fictional berth quotes: A is USD 1,275.35 plus USD 84.65. B is INR 114,500 all-in. Compare them in INR at my fixed USD/INR rate of 83.25. No tax or other extras; round to paise only after adding each quotation.
```

Prior-user context: none (first-turn record).

### Current-message extraction

| Fact | Status | Supplied value / meaning | Exact supporting substring |
|---|---|---|---|
| `current.request.type` | supplied | "compare_quotations" | “Compare them in INR” |
| `current.request.output_currency` | supplied | "INR" | “Compare them in INR” |
| `current.quote.fictional_qualifier` | supplied | "two fictional berth quotes" | “Two fictional berth quotes” |
| `current.quotes.A.identity` | supplied | "A" | “A is USD” |
| `current.quotes.A.line_1` | supplied | {"kind": "amount", "value": "1275.35", "currency": "USD"} — Line number 1 is an author locator by textual position; the user gives no service name. | “USD 1,275.35” |
| `current.quotes.A.line_2` | supplied | {"kind": "amount", "value": "84.65", "currency": "USD"} — Line number 2 is an author locator by textual position; the user gives no service name. | “USD 84.65” |
| `current.quotes.A.operation` | supplied | "addition" | “plus USD 84.65” |
| `current.quotes.B.identity` | supplied | "B" | “B is INR” |
| `current.quotes.B.amount` | supplied | {"kind": "amount", "value": "114500", "currency": "INR"} | “INR 114,500” |
| `current.quotes.B.inclusion` | supplied | "all-in" | “all-in” |
| `current.fx.quotation` | supplied | {"pair_as_written": "USD/INR", "rate": "83.25", "fixed_by": "user"} | “my fixed USD/INR rate of 83.25” |
| `current.fx.direction` | supplied | {"normalized_direction": "INR per USD", "explicit_equality_status": "not_stated"} — Interpretation of pair notation: quote currency INR per base currency USD. The message does not spell out an equality; this convention is exposed for independent review. | “USD/INR rate of 83.25” |
| `current.rounding.currency_precision` | supplied | "paise" | “round to paise” |
| `current.rounding.stage` | supplied | "only after adding each quotation" | “round to paise only after adding each quotation” |
| `current.tax` | none | null | “No tax or other extras” |
| `current.other_extras` | none | null | “No tax or other extras” |

### Context-only facts

None.

### Not stated

`vessel.name`, `vessel.GT`, `vessel.GRT`, `vessel.other_particulars`, `port`, `stay.duration_components`, `stay.start_timestamp`, `stay.end_timestamp`, `stay.time_zone`, `unit_rates`, `basis_denominator`, `billing_period`, `minimum`, `cap`, `discounts`, `rounding.tie_breaking_mode`, `quote_A_line_service_names`, `fx.explicit_equality`.

Scope: current message plus explicit prior-user context. These fields are not silently assigned values.

### Hand-worked arithmetic — derived oracle outputs

| Step | Arithmetic | Result | Dependencies |
|---|---|---|---|
| `A_sum_USD` | 1275.35 + 84.65 = 1360.00 | 1360.00 USD | `current.quotes.A.line_1`, `current.quotes.A.line_2`, `current.quotes.A.operation` |
| `A_INR_unrounded` | 1360.00 × 83.25 INR/USD = 113220.0000 | 113220.0000 INR | `A_sum_USD`, `current.fx.quotation`, `current.fx.direction` |
| `A_INR_final` | 113220.0000 rounded to paise after summing = 113220.00 | 113220.00 INR | `A_INR_unrounded`, `current.rounding.currency_precision`, `current.rounding.stage` |
| `B_INR_final` | 114500 all-in, already INR; format to paise = 114500.00 | 114500.00 INR | `current.quotes.B.amount`, `current.quotes.B.inclusion`, `current.rounding.currency_precision` |
| `tax_per_quote` | No tax ⇒ additive tax amount for each quote 0 | 0.00 INR per quotation | `current.tax` |
| `extras_per_quote` | No other extras ⇒ additional amount for each quote 0 | 0.00 INR per quotation | `current.other_extras` |
| `B_minus_A` | 114500.00 − 113220.00 = 1280.00 | 1280.00 INR | `B_INR_final`, `A_INR_final` |

### Expected final answer — derived

A: USD 1,360.00 = INR 113,220.00. B: INR 114,500.00 all-in. A is cheaper by INR 1,280.00.

### Ambiguities / assumptions / scope limits

- **D24-fx-direction (interpretive_convention)**: Read fixed USD/INR 83.25 as 83.25 INR for 1 USD, so multiply USD by 83.25. The source uses pair notation rather than an explicit equality. Impact: All INR results use this stated interpretation. Independent review: pending.
- **D24-rounding-mode (unspecified_detail)**: The user specifies precision and stage but no tie-breaking rule (half-up, half-even, etc.). Do not label a specific tie mode as supplied. Sum A in USD, convert its sum, then express in paise; B is already INR. Impact: No numerical difference: the computed quote totals already have exact paise, and no rounding tie occurs. Independent review: pending.
- **D24-line-names (unspecified_detail)**: A has two unnamed monetary components. Their numbers 1 and 2 are author locators, not supplied service names. B is one all-in amount. Impact: Do not invent berth/pilotage/water names for A’s components. Independent review: pending.

Code-derived extraction values: none.

## D24-v1

Case `D24` · authored_paraphrase · source pointer `/inputs/D24/0` · variant of `D24-original`

Original decoded-message SHA-256: `568e1c9bd809e1b2322f7e66c37065aa8e2971d3c2ef20c126daae45c98b69c6`

### Exact current user message

```text
Compare two fictional berth quotes in INR using my fixed USD/INR rate of 83.25. Quote B is INR 114,500 all-in; quote A is USD 1,275.35 plus USD 84.65. No tax or other extras. Add each quotation before rounding to paise.
```

Prior-user context: none (first-turn record).

### Current-message extraction

| Fact | Status | Supplied value / meaning | Exact supporting substring |
|---|---|---|---|
| `current.request.type` | supplied | "compare_quotations" | “Compare two fictional berth quotes in INR” |
| `current.request.output_currency` | supplied | "INR" | “Compare two fictional berth quotes in INR” |
| `current.quote.fictional_qualifier` | supplied | "two fictional berth quotes" | “two fictional berth quotes” |
| `current.quotes.A.identity` | supplied | "A" | “quote A is USD” |
| `current.quotes.A.line_1` | supplied | {"kind": "amount", "value": "1275.35", "currency": "USD"} — Line number 1 is an author locator by textual position; the user gives no service name. | “USD 1,275.35” |
| `current.quotes.A.line_2` | supplied | {"kind": "amount", "value": "84.65", "currency": "USD"} — Line number 2 is an author locator by textual position; the user gives no service name. | “USD 84.65” |
| `current.quotes.A.operation` | supplied | "addition" | “plus USD 84.65” |
| `current.quotes.B.identity` | supplied | "B" | “Quote B is INR” |
| `current.quotes.B.amount` | supplied | {"kind": "amount", "value": "114500", "currency": "INR"} | “INR 114,500” |
| `current.quotes.B.inclusion` | supplied | "all-in" | “all-in” |
| `current.fx.quotation` | supplied | {"pair_as_written": "USD/INR", "rate": "83.25", "fixed_by": "user"} | “my fixed USD/INR rate of 83.25” |
| `current.fx.direction` | supplied | {"normalized_direction": "INR per USD", "explicit_equality_status": "not_stated"} — Interpretation of pair notation: quote currency INR per base currency USD. The message does not spell out an equality; this convention is exposed for independent review. | “USD/INR rate of 83.25” |
| `current.rounding.currency_precision` | supplied | "paise" | “rounding to paise” |
| `current.rounding.stage` | supplied | "only after adding each quotation" | “Add each quotation before rounding to paise” |
| `current.tax` | none | null | “No tax or other extras” |
| `current.other_extras` | none | null | “No tax or other extras” |

### Context-only facts

None.

### Not stated

`vessel.name`, `vessel.GT`, `vessel.GRT`, `vessel.other_particulars`, `port`, `stay.duration_components`, `stay.start_timestamp`, `stay.end_timestamp`, `stay.time_zone`, `unit_rates`, `basis_denominator`, `billing_period`, `minimum`, `cap`, `discounts`, `rounding.tie_breaking_mode`, `quote_A_line_service_names`, `fx.explicit_equality`.

Scope: current message plus explicit prior-user context. These fields are not silently assigned values.

### Hand-worked arithmetic — derived oracle outputs

| Step | Arithmetic | Result | Dependencies |
|---|---|---|---|
| `A_sum_USD` | 1275.35 + 84.65 = 1360.00 | 1360.00 USD | `current.quotes.A.line_1`, `current.quotes.A.line_2`, `current.quotes.A.operation` |
| `A_INR_unrounded` | 1360.00 × 83.25 INR/USD = 113220.0000 | 113220.0000 INR | `A_sum_USD`, `current.fx.quotation`, `current.fx.direction` |
| `A_INR_final` | 113220.0000 rounded to paise after summing = 113220.00 | 113220.00 INR | `A_INR_unrounded`, `current.rounding.currency_precision`, `current.rounding.stage` |
| `B_INR_final` | 114500 all-in, already INR; format to paise = 114500.00 | 114500.00 INR | `current.quotes.B.amount`, `current.quotes.B.inclusion`, `current.rounding.currency_precision` |
| `tax_per_quote` | No tax ⇒ additive tax amount for each quote 0 | 0.00 INR per quotation | `current.tax` |
| `extras_per_quote` | No other extras ⇒ additional amount for each quote 0 | 0.00 INR per quotation | `current.other_extras` |
| `B_minus_A` | 114500.00 − 113220.00 = 1280.00 | 1280.00 INR | `B_INR_final`, `A_INR_final` |

### Expected final answer — derived

A: USD 1,360.00 = INR 113,220.00. B: INR 114,500.00 all-in. A is cheaper by INR 1,280.00.

### Ambiguities / assumptions / scope limits

- **D24-fx-direction (interpretive_convention)**: Read fixed USD/INR 83.25 as 83.25 INR for 1 USD, so multiply USD by 83.25. The source uses pair notation rather than an explicit equality. Impact: All INR results use this stated interpretation. Independent review: pending.
- **D24-rounding-mode (unspecified_detail)**: The user specifies precision and stage but no tie-breaking rule (half-up, half-even, etc.). Do not label a specific tie mode as supplied. Sum A in USD, convert its sum, then express in paise; B is already INR. Impact: No numerical difference: the computed quote totals already have exact paise, and no rounding tie occurs. Independent review: pending.
- **D24-line-names (unspecified_detail)**: A has two unnamed monetary components. Their numbers 1 and 2 are author locators, not supplied service names. B is one all-in amount. Impact: Do not invent berth/pilotage/water names for A’s components. Independent review: pending.

Code-derived extraction values: none.

## D24-v2

Case `D24` · authored_paraphrase · source pointer `/inputs/D24/0` · variant of `D24-original`

Original decoded-message SHA-256: `568e1c9bd809e1b2322f7e66c37065aa8e2971d3c2ef20c126daae45c98b69c6`

### Exact current user message

```text
My two fictional berth quotes are A: USD 1,275.35 plus USD 84.65, and B: INR 114,500 all-in. Which is cheaper in INR at my fixed USD/INR rate of 83.25? No tax or other extras; rounding to paise must wait until after adding each quotation.
```

Prior-user context: none (first-turn record).

### Current-message extraction

| Fact | Status | Supplied value / meaning | Exact supporting substring |
|---|---|---|---|
| `current.request.type` | supplied | "compare_quotations" | “Which is cheaper in INR” |
| `current.request.output_currency` | supplied | "INR" | “Which is cheaper in INR” |
| `current.quote.fictional_qualifier` | supplied | "two fictional berth quotes" | “two fictional berth quotes” |
| `current.quotes.A.identity` | supplied | "A" | “A: USD” |
| `current.quotes.A.line_1` | supplied | {"kind": "amount", "value": "1275.35", "currency": "USD"} — Line number 1 is an author locator by textual position; the user gives no service name. | “USD 1,275.35” |
| `current.quotes.A.line_2` | supplied | {"kind": "amount", "value": "84.65", "currency": "USD"} — Line number 2 is an author locator by textual position; the user gives no service name. | “USD 84.65” |
| `current.quotes.A.operation` | supplied | "addition" | “plus USD 84.65” |
| `current.quotes.B.identity` | supplied | "B" | “B: INR” |
| `current.quotes.B.amount` | supplied | {"kind": "amount", "value": "114500", "currency": "INR"} | “INR 114,500” |
| `current.quotes.B.inclusion` | supplied | "all-in" | “all-in” |
| `current.fx.quotation` | supplied | {"pair_as_written": "USD/INR", "rate": "83.25", "fixed_by": "user"} | “my fixed USD/INR rate of 83.25” |
| `current.fx.direction` | supplied | {"normalized_direction": "INR per USD", "explicit_equality_status": "not_stated"} — Interpretation of pair notation: quote currency INR per base currency USD. The message does not spell out an equality; this convention is exposed for independent review. | “USD/INR rate of 83.25” |
| `current.rounding.currency_precision` | supplied | "paise" | “rounding to paise” |
| `current.rounding.stage` | supplied | "only after adding each quotation" | “rounding to paise must wait until after adding each quotation” |
| `current.tax` | none | null | “No tax or other extras” |
| `current.other_extras` | none | null | “No tax or other extras” |

### Context-only facts

None.

### Not stated

`vessel.name`, `vessel.GT`, `vessel.GRT`, `vessel.other_particulars`, `port`, `stay.duration_components`, `stay.start_timestamp`, `stay.end_timestamp`, `stay.time_zone`, `unit_rates`, `basis_denominator`, `billing_period`, `minimum`, `cap`, `discounts`, `rounding.tie_breaking_mode`, `quote_A_line_service_names`, `fx.explicit_equality`.

Scope: current message plus explicit prior-user context. These fields are not silently assigned values.

### Hand-worked arithmetic — derived oracle outputs

| Step | Arithmetic | Result | Dependencies |
|---|---|---|---|
| `A_sum_USD` | 1275.35 + 84.65 = 1360.00 | 1360.00 USD | `current.quotes.A.line_1`, `current.quotes.A.line_2`, `current.quotes.A.operation` |
| `A_INR_unrounded` | 1360.00 × 83.25 INR/USD = 113220.0000 | 113220.0000 INR | `A_sum_USD`, `current.fx.quotation`, `current.fx.direction` |
| `A_INR_final` | 113220.0000 rounded to paise after summing = 113220.00 | 113220.00 INR | `A_INR_unrounded`, `current.rounding.currency_precision`, `current.rounding.stage` |
| `B_INR_final` | 114500 all-in, already INR; format to paise = 114500.00 | 114500.00 INR | `current.quotes.B.amount`, `current.quotes.B.inclusion`, `current.rounding.currency_precision` |
| `tax_per_quote` | No tax ⇒ additive tax amount for each quote 0 | 0.00 INR per quotation | `current.tax` |
| `extras_per_quote` | No other extras ⇒ additional amount for each quote 0 | 0.00 INR per quotation | `current.other_extras` |
| `B_minus_A` | 114500.00 − 113220.00 = 1280.00 | 1280.00 INR | `B_INR_final`, `A_INR_final` |

### Expected final answer — derived

A: USD 1,360.00 = INR 113,220.00. B: INR 114,500.00 all-in. A is cheaper by INR 1,280.00.

### Ambiguities / assumptions / scope limits

- **D24-fx-direction (interpretive_convention)**: Read fixed USD/INR 83.25 as 83.25 INR for 1 USD, so multiply USD by 83.25. The source uses pair notation rather than an explicit equality. Impact: All INR results use this stated interpretation. Independent review: pending.
- **D24-rounding-mode (unspecified_detail)**: The user specifies precision and stage but no tie-breaking rule (half-up, half-even, etc.). Do not label a specific tie mode as supplied. Sum A in USD, convert its sum, then express in paise; B is already INR. Impact: No numerical difference: the computed quote totals already have exact paise, and no rounding tie occurs. Independent review: pending.
- **D24-line-names (unspecified_detail)**: A has two unnamed monetary components. Their numbers 1 and 2 are author locators, not supplied service names. B is one all-in amount. Impact: Do not invent berth/pilotage/water names for A’s components. Independent review: pending.

Code-derived extraction values: none.

## original-19-original

Case `original-19` · original · source pointer `/inputs/original-19/0` · variant of `None`

Original decoded-message SHA-256: `6167a973a1bf6aed2b4e62dffada732aedd7f8247e942111818f4777e773fda0`

### Exact current user message

```text
Please check our agent’s calculation using only the quotation below.
GT: 10,000. Berth hire: INR 0.25 per GT per hour or part thereof. Round the total berth stay up to the next whole hour. No minimum charge, discounts, surcharges, or taxes apply to this exercise.
Calculate separately for:
A. 24 hours exactly
B. 24 hours and 1 minute
C. 48 hours exactly
Show billable hours and each total.
```

Prior-user context: none (first-turn record).

### Current-message extraction

| Fact | Status | Supplied value / meaning | Exact supporting substring |
|---|---|---|---|
| `current.request.type` | supplied | "calculate_three_separate_stays" | “Calculate separately for” |
| `current.request.check_agent_calculation` | supplied | "check" | “check our agent’s calculation” |
| `current.request.authority` | supplied | "only supplied quotation" | “using only the quotation below” |
| `current.request.output` | supplied | "billable hours and each total" | “Show billable hours and each total” |
| `current.vessel.tonnage` | supplied | {"value": "10000", "unit": "GT"} | “GT: 10,000” |
| `current.charge.name` | supplied | "berth hire" | “Berth hire” |
| `current.charge.kind` | supplied | "rate" | “INR 0.25 per GT per hour or part thereof” |
| `current.charge.rate` | supplied | {"value": "0.25", "currency": "INR"} | “INR 0.25” |
| `current.charge.tonnage_denominator` | supplied | {"value": "1", "unit": "GT"} | “per GT” |
| `current.charge.period` | supplied | {"value": "1", "unit": "hour"} | “per hour or part thereof” |
| `current.rounding.duration` | supplied | {"mode": "ceiling", "stage": "total berth stay", "precision": "whole hour"} — With per hour or part thereof, exact whole-hour stays remain at that integer; next does not add an extra hour to an exact stay. | “Round the total berth stay up to the next whole hour” |
| `current.stays.A` | supplied | {"scenario": "A", "components": [{"value": "24", "unit": "hours"}], "duration_precision": "exact"} | “A. 24 hours exactly” |
| `current.stays.B` | supplied | {"scenario": "B", "components": [{"value": "24", "unit": "hours"}, {"value": "1", "unit": "minute"}], "duration_precision": "hours_and_minutes"} | “B. 24 hours and 1 minute” |
| `current.stays.C` | supplied | {"scenario": "C", "components": [{"value": "48", "unit": "hours"}], "duration_precision": "exact"} | “C. 48 hours exactly” |
| `current.minimum_charge` | none | null | “No minimum charge, discounts, surcharges, or taxes apply to this exercise” |
| `current.discounts` | none | null | “No minimum charge, discounts, surcharges, or taxes apply to this exercise” |
| `current.surcharges` | none | null | “No minimum charge, discounts, surcharges, or taxes apply to this exercise” |
| `current.taxes` | none | null | “No minimum charge, discounts, surcharges, or taxes apply to this exercise” |

### Context-only facts

None.

### Not stated

`vessel.name`, `vessel.GRT`, `vessel.other_particulars`, `port`, `stay.start_timestamp`, `stay.end_timestamp`, `stay.time_zone`, `cap`, `other_charges`, `monetary_rounding`, `fx`, `agent_reported_numbers`.

Scope: current message plus explicit prior-user context. These fields are not silently assigned values.

### Hand-worked arithmetic — derived oracle outputs

| Step | Arithmetic | Result | Dependencies |
|---|---|---|---|
| `hourly_vessel_charge` | 10000 × 0.25 = 2500 | 2500.00 INR/hour | `current.vessel.tonnage`, `current.charge.rate`, `current.charge.tonnage_denominator` |
| `A_billable_hours` | ceil(24) = 24 | 24 hours | `current.stays.A`, `current.rounding.duration`, `current.charge.period` |
| `B_total_minutes` | 24 × 60 + 1 = 1441 | 1441 minutes | `current.stays.B` |
| `B_exact_hours` | 1441 / 60 = 24 + 1/60 | 1441/60 hours | `B_total_minutes` |
| `B_billable_hours` | ceil(1441 / 60) = 25 | 25 hours | `B_exact_hours`, `current.rounding.duration`, `current.charge.period` |
| `C_billable_hours` | ceil(48) = 48 | 48 hours | `current.stays.C`, `current.rounding.duration`, `current.charge.period` |
| `tax_per_scenario` | No taxes ⇒ additive tax amount for each scenario 0 | 0.00 INR per scenario | `current.taxes` |
| `discount_per_scenario` | No discounts ⇒ discount amount for each scenario 0 | 0.00 INR per scenario | `current.discounts` |
| `surcharge_per_scenario` | No surcharges ⇒ surcharge amount for each scenario 0 | 0.00 INR per scenario | `current.surcharges` |
| `A_total` | 2500 × 24 − 0 + 0 + 0 = 60000.00 | 60000.00 INR | `hourly_vessel_charge`, `A_billable_hours`, `tax_per_scenario`, `discount_per_scenario`, `surcharge_per_scenario`, `current.minimum_charge` |
| `B_total` | 2500 × 25 − 0 + 0 + 0 = 62500.00 | 62500.00 INR | `hourly_vessel_charge`, `B_billable_hours`, `tax_per_scenario`, `discount_per_scenario`, `surcharge_per_scenario`, `current.minimum_charge` |
| `C_total` | 2500 × 48 − 0 + 0 + 0 = 120000.00 | 120000.00 INR | `hourly_vessel_charge`, `C_billable_hours`, `tax_per_scenario`, `discount_per_scenario`, `surcharge_per_scenario`, `current.minimum_charge` |

### Expected final answer — derived

A: 24 billable hours, INR 60,000.00. B: 25 billable hours, INR 62,500.00. C: 48 billable hours, INR 120,000.00. Separate scenarios; do not sum them.

### Ambiguities / assumptions / scope limits

- **original-19-ceiling (interpretation)**: Interpret next whole hour together with per hour or part thereof as ceiling: 24 exactly stays 24, 48 exactly stays 48, and 24 hours 1 minute becomes 25. Impact: Strictly adding one hour even to an exact stay would conflict with the part-thereof billing reading; independent reviewer must check this interpretation. Independent review: pending.
- **original-19-agent-numbers (missing_input)**: No existing agent calculation numbers are supplied. Give independent quotation results; cannot declare a particular unseen agent calculation right or wrong. Impact: No numerical effect on the requested three calculations. Independent review: pending.
- **original-19-scope (scope_assumption)**: No cap is stated; it is not labelled explicitly absent. Apply the supplied rate and exclusions without inventing an unquoted cap or other fee. Impact: Expected amounts are the requested quotation exercise, not a complete official port bill. Independent review: pending.

Code-derived extraction values: none.

## original-19-v1

Case `original-19` · authored_paraphrase · source pointer `/inputs/original-19/0` · variant of `original-19-original`

Original decoded-message SHA-256: `6167a973a1bf6aed2b4e62dffada732aedd7f8247e942111818f4777e773fda0`

### Exact current user message

```text
Using only this quotation, check our agent’s calculation for GT: 10,000. Berth hire is INR 0.25 per GT per hour or part thereof. Round the total berth stay up to the next whole hour. No minimum charge, discounts, surcharges, or taxes apply to this exercise. Work out separate cases A: 24 hours exactly; B: 24 hours and 1 minute; C: 48 hours exactly. Give the billable hours and total for each.
```

Prior-user context: none (first-turn record).

### Current-message extraction

| Fact | Status | Supplied value / meaning | Exact supporting substring |
|---|---|---|---|
| `current.request.type` | supplied | "calculate_three_separate_stays" | “Work out separate cases” |
| `current.request.check_agent_calculation` | supplied | "check" | “check our agent’s calculation” |
| `current.request.authority` | supplied | "only supplied quotation" | “Using only this quotation” |
| `current.request.output` | supplied | "billable hours and each total" | “Give the billable hours and total for each” |
| `current.vessel.tonnage` | supplied | {"value": "10000", "unit": "GT"} | “GT: 10,000” |
| `current.charge.name` | supplied | "berth hire" | “Berth hire” |
| `current.charge.kind` | supplied | "rate" | “INR 0.25 per GT per hour or part thereof” |
| `current.charge.rate` | supplied | {"value": "0.25", "currency": "INR"} | “INR 0.25” |
| `current.charge.tonnage_denominator` | supplied | {"value": "1", "unit": "GT"} | “per GT” |
| `current.charge.period` | supplied | {"value": "1", "unit": "hour"} | “per hour or part thereof” |
| `current.rounding.duration` | supplied | {"mode": "ceiling", "stage": "total berth stay", "precision": "whole hour"} — With per hour or part thereof, exact whole-hour stays remain at that integer; next does not add an extra hour to an exact stay. | “Round the total berth stay up to the next whole hour” |
| `current.stays.A` | supplied | {"scenario": "A", "components": [{"value": "24", "unit": "hours"}], "duration_precision": "exact"} | “A: 24 hours exactly” |
| `current.stays.B` | supplied | {"scenario": "B", "components": [{"value": "24", "unit": "hours"}, {"value": "1", "unit": "minute"}], "duration_precision": "hours_and_minutes"} | “B: 24 hours and 1 minute” |
| `current.stays.C` | supplied | {"scenario": "C", "components": [{"value": "48", "unit": "hours"}], "duration_precision": "exact"} | “C: 48 hours exactly” |
| `current.minimum_charge` | none | null | “No minimum charge, discounts, surcharges, or taxes apply to this exercise” |
| `current.discounts` | none | null | “No minimum charge, discounts, surcharges, or taxes apply to this exercise” |
| `current.surcharges` | none | null | “No minimum charge, discounts, surcharges, or taxes apply to this exercise” |
| `current.taxes` | none | null | “No minimum charge, discounts, surcharges, or taxes apply to this exercise” |

### Context-only facts

None.

### Not stated

`vessel.name`, `vessel.GRT`, `vessel.other_particulars`, `port`, `stay.start_timestamp`, `stay.end_timestamp`, `stay.time_zone`, `cap`, `other_charges`, `monetary_rounding`, `fx`, `agent_reported_numbers`.

Scope: current message plus explicit prior-user context. These fields are not silently assigned values.

### Hand-worked arithmetic — derived oracle outputs

| Step | Arithmetic | Result | Dependencies |
|---|---|---|---|
| `hourly_vessel_charge` | 10000 × 0.25 = 2500 | 2500.00 INR/hour | `current.vessel.tonnage`, `current.charge.rate`, `current.charge.tonnage_denominator` |
| `A_billable_hours` | ceil(24) = 24 | 24 hours | `current.stays.A`, `current.rounding.duration`, `current.charge.period` |
| `B_total_minutes` | 24 × 60 + 1 = 1441 | 1441 minutes | `current.stays.B` |
| `B_exact_hours` | 1441 / 60 = 24 + 1/60 | 1441/60 hours | `B_total_minutes` |
| `B_billable_hours` | ceil(1441 / 60) = 25 | 25 hours | `B_exact_hours`, `current.rounding.duration`, `current.charge.period` |
| `C_billable_hours` | ceil(48) = 48 | 48 hours | `current.stays.C`, `current.rounding.duration`, `current.charge.period` |
| `tax_per_scenario` | No taxes ⇒ additive tax amount for each scenario 0 | 0.00 INR per scenario | `current.taxes` |
| `discount_per_scenario` | No discounts ⇒ discount amount for each scenario 0 | 0.00 INR per scenario | `current.discounts` |
| `surcharge_per_scenario` | No surcharges ⇒ surcharge amount for each scenario 0 | 0.00 INR per scenario | `current.surcharges` |
| `A_total` | 2500 × 24 − 0 + 0 + 0 = 60000.00 | 60000.00 INR | `hourly_vessel_charge`, `A_billable_hours`, `tax_per_scenario`, `discount_per_scenario`, `surcharge_per_scenario`, `current.minimum_charge` |
| `B_total` | 2500 × 25 − 0 + 0 + 0 = 62500.00 | 62500.00 INR | `hourly_vessel_charge`, `B_billable_hours`, `tax_per_scenario`, `discount_per_scenario`, `surcharge_per_scenario`, `current.minimum_charge` |
| `C_total` | 2500 × 48 − 0 + 0 + 0 = 120000.00 | 120000.00 INR | `hourly_vessel_charge`, `C_billable_hours`, `tax_per_scenario`, `discount_per_scenario`, `surcharge_per_scenario`, `current.minimum_charge` |

### Expected final answer — derived

A: 24 billable hours, INR 60,000.00. B: 25 billable hours, INR 62,500.00. C: 48 billable hours, INR 120,000.00. Separate scenarios; do not sum them.

### Ambiguities / assumptions / scope limits

- **original-19-ceiling (interpretation)**: Interpret next whole hour together with per hour or part thereof as ceiling: 24 exactly stays 24, 48 exactly stays 48, and 24 hours 1 minute becomes 25. Impact: Strictly adding one hour even to an exact stay would conflict with the part-thereof billing reading; independent reviewer must check this interpretation. Independent review: pending.
- **original-19-agent-numbers (missing_input)**: No existing agent calculation numbers are supplied. Give independent quotation results; cannot declare a particular unseen agent calculation right or wrong. Impact: No numerical effect on the requested three calculations. Independent review: pending.
- **original-19-scope (scope_assumption)**: No cap is stated; it is not labelled explicitly absent. Apply the supplied rate and exclusions without inventing an unquoted cap or other fee. Impact: Expected amounts are the requested quotation exercise, not a complete official port bill. Independent review: pending.

Code-derived extraction values: none.

## original-19-v2

Case `original-19` · authored_paraphrase · source pointer `/inputs/original-19/0` · variant of `original-19-original`

Original decoded-message SHA-256: `6167a973a1bf6aed2b4e62dffada732aedd7f8247e942111818f4777e773fda0`

### Exact current user message

```text
Please show billable hours and each total separately for A. 24 hours exactly, B. 24 hours and 1 minute, and C. 48 hours exactly. Check our agent’s calculation using only this quotation: GT: 10,000; berth hire INR 0.25 per GT per hour or part thereof. Round the total berth stay up to the next whole hour. No minimum charge, discounts, surcharges, or taxes apply to this exercise.
```

Prior-user context: none (first-turn record).

### Current-message extraction

| Fact | Status | Supplied value / meaning | Exact supporting substring |
|---|---|---|---|
| `current.request.type` | supplied | "calculate_three_separate_stays" | “each total separately” |
| `current.request.check_agent_calculation` | supplied | "check" | “Check our agent’s calculation” |
| `current.request.authority` | supplied | "only supplied quotation" | “using only this quotation” |
| `current.request.output` | supplied | "billable hours and each total" | “show billable hours and each total separately” |
| `current.vessel.tonnage` | supplied | {"value": "10000", "unit": "GT"} | “GT: 10,000” |
| `current.charge.name` | supplied | "berth hire" | “berth hire” |
| `current.charge.kind` | supplied | "rate" | “INR 0.25 per GT per hour or part thereof” |
| `current.charge.rate` | supplied | {"value": "0.25", "currency": "INR"} | “INR 0.25” |
| `current.charge.tonnage_denominator` | supplied | {"value": "1", "unit": "GT"} | “per GT” |
| `current.charge.period` | supplied | {"value": "1", "unit": "hour"} | “per hour or part thereof” |
| `current.rounding.duration` | supplied | {"mode": "ceiling", "stage": "total berth stay", "precision": "whole hour"} — With per hour or part thereof, exact whole-hour stays remain at that integer; next does not add an extra hour to an exact stay. | “Round the total berth stay up to the next whole hour” |
| `current.stays.A` | supplied | {"scenario": "A", "components": [{"value": "24", "unit": "hours"}], "duration_precision": "exact"} | “A. 24 hours exactly” |
| `current.stays.B` | supplied | {"scenario": "B", "components": [{"value": "24", "unit": "hours"}, {"value": "1", "unit": "minute"}], "duration_precision": "hours_and_minutes"} | “B. 24 hours and 1 minute” |
| `current.stays.C` | supplied | {"scenario": "C", "components": [{"value": "48", "unit": "hours"}], "duration_precision": "exact"} | “C. 48 hours exactly” |
| `current.minimum_charge` | none | null | “No minimum charge, discounts, surcharges, or taxes apply to this exercise” |
| `current.discounts` | none | null | “No minimum charge, discounts, surcharges, or taxes apply to this exercise” |
| `current.surcharges` | none | null | “No minimum charge, discounts, surcharges, or taxes apply to this exercise” |
| `current.taxes` | none | null | “No minimum charge, discounts, surcharges, or taxes apply to this exercise” |

### Context-only facts

None.

### Not stated

`vessel.name`, `vessel.GRT`, `vessel.other_particulars`, `port`, `stay.start_timestamp`, `stay.end_timestamp`, `stay.time_zone`, `cap`, `other_charges`, `monetary_rounding`, `fx`, `agent_reported_numbers`.

Scope: current message plus explicit prior-user context. These fields are not silently assigned values.

### Hand-worked arithmetic — derived oracle outputs

| Step | Arithmetic | Result | Dependencies |
|---|---|---|---|
| `hourly_vessel_charge` | 10000 × 0.25 = 2500 | 2500.00 INR/hour | `current.vessel.tonnage`, `current.charge.rate`, `current.charge.tonnage_denominator` |
| `A_billable_hours` | ceil(24) = 24 | 24 hours | `current.stays.A`, `current.rounding.duration`, `current.charge.period` |
| `B_total_minutes` | 24 × 60 + 1 = 1441 | 1441 minutes | `current.stays.B` |
| `B_exact_hours` | 1441 / 60 = 24 + 1/60 | 1441/60 hours | `B_total_minutes` |
| `B_billable_hours` | ceil(1441 / 60) = 25 | 25 hours | `B_exact_hours`, `current.rounding.duration`, `current.charge.period` |
| `C_billable_hours` | ceil(48) = 48 | 48 hours | `current.stays.C`, `current.rounding.duration`, `current.charge.period` |
| `tax_per_scenario` | No taxes ⇒ additive tax amount for each scenario 0 | 0.00 INR per scenario | `current.taxes` |
| `discount_per_scenario` | No discounts ⇒ discount amount for each scenario 0 | 0.00 INR per scenario | `current.discounts` |
| `surcharge_per_scenario` | No surcharges ⇒ surcharge amount for each scenario 0 | 0.00 INR per scenario | `current.surcharges` |
| `A_total` | 2500 × 24 − 0 + 0 + 0 = 60000.00 | 60000.00 INR | `hourly_vessel_charge`, `A_billable_hours`, `tax_per_scenario`, `discount_per_scenario`, `surcharge_per_scenario`, `current.minimum_charge` |
| `B_total` | 2500 × 25 − 0 + 0 + 0 = 62500.00 | 62500.00 INR | `hourly_vessel_charge`, `B_billable_hours`, `tax_per_scenario`, `discount_per_scenario`, `surcharge_per_scenario`, `current.minimum_charge` |
| `C_total` | 2500 × 48 − 0 + 0 + 0 = 120000.00 | 120000.00 INR | `hourly_vessel_charge`, `C_billable_hours`, `tax_per_scenario`, `discount_per_scenario`, `surcharge_per_scenario`, `current.minimum_charge` |

### Expected final answer — derived

A: 24 billable hours, INR 60,000.00. B: 25 billable hours, INR 62,500.00. C: 48 billable hours, INR 120,000.00. Separate scenarios; do not sum them.

### Ambiguities / assumptions / scope limits

- **original-19-ceiling (interpretation)**: Interpret next whole hour together with per hour or part thereof as ceiling: 24 exactly stays 24, 48 exactly stays 48, and 24 hours 1 minute becomes 25. Impact: Strictly adding one hour even to an exact stay would conflict with the part-thereof billing reading; independent reviewer must check this interpretation. Independent review: pending.
- **original-19-agent-numbers (missing_input)**: No existing agent calculation numbers are supplied. Give independent quotation results; cannot declare a particular unseen agent calculation right or wrong. Impact: No numerical effect on the requested three calculations. Independent review: pending.
- **original-19-scope (scope_assumption)**: No cap is stated; it is not labelled explicitly absent. Apply the supplied rate and exclusions without inventing an unquoted cap or other fee. Impact: Expected amounts are the requested quotation exercise, not a complete official port bill. Independent review: pending.

Code-derived extraction values: none.

## D02-original

Case `D02` · original · source pointer `/inputs/D02/0` · variant of `None`

Original decoded-message SHA-256: `714382388d1442fc52a561c518082e7822cf6cb69176ae7972d503862fcbc1f6`

### Exact current user message

```text
At Jaigarh, MV Cedar Kite was alongside from 18 October 2026 at 22:45 to 20 October 2026 at 05:15, both India time. Our agreed berth charge is INR 4,000 for each started six-hour block. No tax. How long is that and what do we owe?
```

Prior-user context: none (first-turn record).

### Current-message extraction

| Fact | Status | Supplied value / meaning | Exact supporting substring |
|---|---|---|---|
| `current.request.type` | supplied | "elapsed_duration_and_quoted_berth_charge" | “How long is that and what do we owe?” |
| `current.port` | supplied | "Jaigarh" | “Jaigarh” |
| `current.vessel.name` | supplied | "MV Cedar Kite" | “MV Cedar Kite” |
| `current.stay.start_timestamp` | supplied | "18 October 2026 at 22:45" | “18 October 2026 at 22:45” |
| `current.stay.end_timestamp` | supplied | "20 October 2026 at 05:15" | “20 October 2026 at 05:15” |
| `current.stay.time_zone` | supplied | {"literal": "India time", "scope": "both timestamps"} | “both India time” |
| `current.stay.activity` | supplied | "alongside" | “alongside” |
| `current.charge.name` | supplied | "berth charge" | “berth charge” |
| `current.charge.agreed_qualifier` | supplied | "agreed" | “Our agreed berth charge” |
| `current.charge.kind` | supplied | "rate" | “INR 4,000 for each started six-hour block” |
| `current.charge.rate` | supplied | {"value": "4000", "currency": "INR"} | “INR 4,000” |
| `current.charge.basis` | supplied | "per time block per quoted vessel stay" — No tonnage denominator is supplied; do not multiply this block charge by GT/GRT. | “for each started six-hour block” |
| `current.charge.period` | supplied | {"value": "6", "unit": "hours"} — six normalized to 6; supplied quantity, not a derived billable period. | “six-hour block” |
| `current.charge.period_rounding` | supplied | {"mode": "ceiling", "stage": "elapsed alongside duration divided by six hours"} | “each started six-hour block” |
| `current.tax` | none | null | “No tax” |

### Context-only facts

None.

### Not stated

`vessel.GT`, `vessel.GRT`, `vessel.other_particulars`, `stay.duration_components`, `stay.explicit_utc_offset`, `stay.explicit_iana_zone`, `minimum`, `cap`, `discounts`, `surcharges`, `other_charges`, `monetary_rounding`, `fx`.

Scope: current message plus explicit prior-user context. These fields are not silently assigned values.

### Hand-worked arithmetic — derived oracle outputs

| Step | Arithmetic | Result | Dependencies |
|---|---|---|---|
| `first_midnight_minutes` | 18 Oct 22:45 → 19 Oct 00:00 = 1 hour 15 minutes = 75 minutes | 75 minutes | `current.stay.start_timestamp`, `current.stay.time_zone` |
| `full_middle_day_minutes` | 19 Oct 00:00 → 20 Oct 00:00 = 24 × 60 = 1440 minutes | 1440 minutes | `current.stay.start_timestamp`, `current.stay.end_timestamp`, `current.stay.time_zone` |
| `last_midnight_minutes` | 20 Oct 00:00 → 20 Oct 05:15 = 5 × 60 + 15 = 315 minutes | 315 minutes | `current.stay.end_timestamp`, `current.stay.time_zone` |
| `elapsed_minutes` | 75 + 1440 + 315 = 1830 | 1830 minutes | `first_midnight_minutes`, `full_middle_day_minutes`, `last_midnight_minutes` |
| `elapsed_hours` | 1830 / 60 = 30.5 = 30 hours 30 minutes | 30.5 hours | `elapsed_minutes` |
| `billable_blocks` | ceil(30.5 / 6) = ceil(61/12) = 6 | 6 six-hour blocks | `elapsed_hours`, `current.charge.period`, `current.charge.period_rounding` |
| `billed_hour_equivalent` | 6 × 6 = 36 — Billing equivalent only; actual alongside duration remains 30 hours 30 minutes. | 36 hours | `billable_blocks`, `current.charge.period` |
| `berth_subtotal` | 6 × 4000 = 24000 | 24000.00 INR | `billable_blocks`, `current.charge.rate` |
| `tax_amount` | No tax ⇒ additive tax amount 0 | 0.00 INR | `current.tax` |
| `quoted_berth_payable` | 24000 + 0 = 24000 | 24000.00 INR | `berth_subtotal`, `tax_amount` |

### Expected final answer — derived

Alongside 30 hours 30 minutes. Six started six-hour blocks; quoted berth charge INR 24,000.00, no tax. This is the quoted berth amount; other charges, minimums, caps, discounts and surcharges are not specified.

### Ambiguities / assumptions / scope limits

- **D02-zone (interpretive_assumption)**: Both timestamps use the same supplied India time. Subtract in that common local time with no offset change across this interval; no UTC offset or IANA zone is inserted into extraction. Intermediate midnights are derived decomposition points. Impact: 30 hours 30 minutes under this explicitly stated common-zone interpretation. Independent review: pending.
- **D02-unquoted-terms (scope_limitation)**: Only no tax is explicit. Minimum, cap, discounts, surcharges and other charges are not_stated, not none or zero. The answer is the agreed berth charge using the supplied terms. Impact: INR 24,000 is not a claim that every unquoted port cost is absent. Independent review: pending.
- **D02-rounding (unspecified_detail)**: No monetary rounding rule is supplied. Six started blocks is derived; 36 hours is a billing equivalent, not actual elapsed stay. Impact: All amounts are whole rupees, so formatting to paise causes no numerical rounding. Independent review: pending.

Code-derived extraction values: none.

## D02-v1

Case `D02` · authored_paraphrase · source pointer `/inputs/D02/0` · variant of `D02-original`

Original decoded-message SHA-256: `714382388d1442fc52a561c518082e7822cf6cb69176ae7972d503862fcbc1f6`

### Exact current user message

```text
For MV Cedar Kite at Jaigarh, what is the alongside duration and the amount owed? The stay began on 18 October 2026 at 22:45 and ended on 20 October 2026 at 05:15, both India time. Our agreed berth charge is INR 4,000 for each started six-hour block. No tax.
```

Prior-user context: none (first-turn record).

### Current-message extraction

| Fact | Status | Supplied value / meaning | Exact supporting substring |
|---|---|---|---|
| `current.request.type` | supplied | "elapsed_duration_and_quoted_berth_charge" | “what is the alongside duration and the amount owed?” |
| `current.port` | supplied | "Jaigarh" | “Jaigarh” |
| `current.vessel.name` | supplied | "MV Cedar Kite" | “MV Cedar Kite” |
| `current.stay.start_timestamp` | supplied | "18 October 2026 at 22:45" | “18 October 2026 at 22:45” |
| `current.stay.end_timestamp` | supplied | "20 October 2026 at 05:15" | “20 October 2026 at 05:15” |
| `current.stay.time_zone` | supplied | {"literal": "India time", "scope": "both timestamps"} | “both India time” |
| `current.stay.activity` | supplied | "alongside" | “alongside” |
| `current.charge.name` | supplied | "berth charge" | “berth charge” |
| `current.charge.agreed_qualifier` | supplied | "agreed" | “Our agreed berth charge” |
| `current.charge.kind` | supplied | "rate" | “INR 4,000 for each started six-hour block” |
| `current.charge.rate` | supplied | {"value": "4000", "currency": "INR"} | “INR 4,000” |
| `current.charge.basis` | supplied | "per time block per quoted vessel stay" — No tonnage denominator is supplied; do not multiply this block charge by GT/GRT. | “for each started six-hour block” |
| `current.charge.period` | supplied | {"value": "6", "unit": "hours"} — six normalized to 6; supplied quantity, not a derived billable period. | “six-hour block” |
| `current.charge.period_rounding` | supplied | {"mode": "ceiling", "stage": "elapsed alongside duration divided by six hours"} | “each started six-hour block” |
| `current.tax` | none | null | “No tax” |

### Context-only facts

None.

### Not stated

`vessel.GT`, `vessel.GRT`, `vessel.other_particulars`, `stay.duration_components`, `stay.explicit_utc_offset`, `stay.explicit_iana_zone`, `minimum`, `cap`, `discounts`, `surcharges`, `other_charges`, `monetary_rounding`, `fx`.

Scope: current message plus explicit prior-user context. These fields are not silently assigned values.

### Hand-worked arithmetic — derived oracle outputs

| Step | Arithmetic | Result | Dependencies |
|---|---|---|---|
| `first_midnight_minutes` | 18 Oct 22:45 → 19 Oct 00:00 = 1 hour 15 minutes = 75 minutes | 75 minutes | `current.stay.start_timestamp`, `current.stay.time_zone` |
| `full_middle_day_minutes` | 19 Oct 00:00 → 20 Oct 00:00 = 24 × 60 = 1440 minutes | 1440 minutes | `current.stay.start_timestamp`, `current.stay.end_timestamp`, `current.stay.time_zone` |
| `last_midnight_minutes` | 20 Oct 00:00 → 20 Oct 05:15 = 5 × 60 + 15 = 315 minutes | 315 minutes | `current.stay.end_timestamp`, `current.stay.time_zone` |
| `elapsed_minutes` | 75 + 1440 + 315 = 1830 | 1830 minutes | `first_midnight_minutes`, `full_middle_day_minutes`, `last_midnight_minutes` |
| `elapsed_hours` | 1830 / 60 = 30.5 = 30 hours 30 minutes | 30.5 hours | `elapsed_minutes` |
| `billable_blocks` | ceil(30.5 / 6) = ceil(61/12) = 6 | 6 six-hour blocks | `elapsed_hours`, `current.charge.period`, `current.charge.period_rounding` |
| `billed_hour_equivalent` | 6 × 6 = 36 — Billing equivalent only; actual alongside duration remains 30 hours 30 minutes. | 36 hours | `billable_blocks`, `current.charge.period` |
| `berth_subtotal` | 6 × 4000 = 24000 | 24000.00 INR | `billable_blocks`, `current.charge.rate` |
| `tax_amount` | No tax ⇒ additive tax amount 0 | 0.00 INR | `current.tax` |
| `quoted_berth_payable` | 24000 + 0 = 24000 | 24000.00 INR | `berth_subtotal`, `tax_amount` |

### Expected final answer — derived

Alongside 30 hours 30 minutes. Six started six-hour blocks; quoted berth charge INR 24,000.00, no tax. This is the quoted berth amount; other charges, minimums, caps, discounts and surcharges are not specified.

### Ambiguities / assumptions / scope limits

- **D02-zone (interpretive_assumption)**: Both timestamps use the same supplied India time. Subtract in that common local time with no offset change across this interval; no UTC offset or IANA zone is inserted into extraction. Intermediate midnights are derived decomposition points. Impact: 30 hours 30 minutes under this explicitly stated common-zone interpretation. Independent review: pending.
- **D02-unquoted-terms (scope_limitation)**: Only no tax is explicit. Minimum, cap, discounts, surcharges and other charges are not_stated, not none or zero. The answer is the agreed berth charge using the supplied terms. Impact: INR 24,000 is not a claim that every unquoted port cost is absent. Independent review: pending.
- **D02-rounding (unspecified_detail)**: No monetary rounding rule is supplied. Six started blocks is derived; 36 hours is a billing equivalent, not actual elapsed stay. Impact: All amounts are whole rupees, so formatting to paise causes no numerical rounding. Independent review: pending.

Code-derived extraction values: none.

## D02-v2

Case `D02` · authored_paraphrase · source pointer `/inputs/D02/0` · variant of `D02-original`

Original decoded-message SHA-256: `714382388d1442fc52a561c518082e7822cf6cb69176ae7972d503862fcbc1f6`

### Exact current user message

```text
Work out how long MV Cedar Kite was alongside at Jaigarh, and what we owe for berth charges. From 18 October 2026 at 22:45 until 20 October 2026 at 05:15, both India time. We agreed INR 4,000 for each started six-hour block. No tax.
```

Prior-user context: none (first-turn record).

### Current-message extraction

| Fact | Status | Supplied value / meaning | Exact supporting substring |
|---|---|---|---|
| `current.request.type` | supplied | "elapsed_duration_and_quoted_berth_charge" | “Work out how long MV Cedar Kite was alongside” |
| `current.port` | supplied | "Jaigarh" | “Jaigarh” |
| `current.vessel.name` | supplied | "MV Cedar Kite" | “MV Cedar Kite” |
| `current.stay.start_timestamp` | supplied | "18 October 2026 at 22:45" | “18 October 2026 at 22:45” |
| `current.stay.end_timestamp` | supplied | "20 October 2026 at 05:15" | “20 October 2026 at 05:15” |
| `current.stay.time_zone` | supplied | {"literal": "India time", "scope": "both timestamps"} | “both India time” |
| `current.stay.activity` | supplied | "alongside" | “alongside” |
| `current.charge.name` | supplied | "berth charge" | “berth charges” |
| `current.charge.agreed_qualifier` | supplied | "agreed" | “We agreed” |
| `current.charge.kind` | supplied | "rate" | “INR 4,000 for each started six-hour block” |
| `current.charge.rate` | supplied | {"value": "4000", "currency": "INR"} | “INR 4,000” |
| `current.charge.basis` | supplied | "per time block per quoted vessel stay" — No tonnage denominator is supplied; do not multiply this block charge by GT/GRT. | “for each started six-hour block” |
| `current.charge.period` | supplied | {"value": "6", "unit": "hours"} — six normalized to 6; supplied quantity, not a derived billable period. | “six-hour block” |
| `current.charge.period_rounding` | supplied | {"mode": "ceiling", "stage": "elapsed alongside duration divided by six hours"} | “each started six-hour block” |
| `current.tax` | none | null | “No tax” |

### Context-only facts

None.

### Not stated

`vessel.GT`, `vessel.GRT`, `vessel.other_particulars`, `stay.duration_components`, `stay.explicit_utc_offset`, `stay.explicit_iana_zone`, `minimum`, `cap`, `discounts`, `surcharges`, `other_charges`, `monetary_rounding`, `fx`.

Scope: current message plus explicit prior-user context. These fields are not silently assigned values.

### Hand-worked arithmetic — derived oracle outputs

| Step | Arithmetic | Result | Dependencies |
|---|---|---|---|
| `first_midnight_minutes` | 18 Oct 22:45 → 19 Oct 00:00 = 1 hour 15 minutes = 75 minutes | 75 minutes | `current.stay.start_timestamp`, `current.stay.time_zone` |
| `full_middle_day_minutes` | 19 Oct 00:00 → 20 Oct 00:00 = 24 × 60 = 1440 minutes | 1440 minutes | `current.stay.start_timestamp`, `current.stay.end_timestamp`, `current.stay.time_zone` |
| `last_midnight_minutes` | 20 Oct 00:00 → 20 Oct 05:15 = 5 × 60 + 15 = 315 minutes | 315 minutes | `current.stay.end_timestamp`, `current.stay.time_zone` |
| `elapsed_minutes` | 75 + 1440 + 315 = 1830 | 1830 minutes | `first_midnight_minutes`, `full_middle_day_minutes`, `last_midnight_minutes` |
| `elapsed_hours` | 1830 / 60 = 30.5 = 30 hours 30 minutes | 30.5 hours | `elapsed_minutes` |
| `billable_blocks` | ceil(30.5 / 6) = ceil(61/12) = 6 | 6 six-hour blocks | `elapsed_hours`, `current.charge.period`, `current.charge.period_rounding` |
| `billed_hour_equivalent` | 6 × 6 = 36 — Billing equivalent only; actual alongside duration remains 30 hours 30 minutes. | 36 hours | `billable_blocks`, `current.charge.period` |
| `berth_subtotal` | 6 × 4000 = 24000 | 24000.00 INR | `billable_blocks`, `current.charge.rate` |
| `tax_amount` | No tax ⇒ additive tax amount 0 | 0.00 INR | `current.tax` |
| `quoted_berth_payable` | 24000 + 0 = 24000 | 24000.00 INR | `berth_subtotal`, `tax_amount` |

### Expected final answer — derived

Alongside 30 hours 30 minutes. Six started six-hour blocks; quoted berth charge INR 24,000.00, no tax. This is the quoted berth amount; other charges, minimums, caps, discounts and surcharges are not specified.

### Ambiguities / assumptions / scope limits

- **D02-zone (interpretive_assumption)**: Both timestamps use the same supplied India time. Subtract in that common local time with no offset change across this interval; no UTC offset or IANA zone is inserted into extraction. Intermediate midnights are derived decomposition points. Impact: 30 hours 30 minutes under this explicitly stated common-zone interpretation. Independent review: pending.
- **D02-unquoted-terms (scope_limitation)**: Only no tax is explicit. Minimum, cap, discounts, surcharges and other charges are not_stated, not none or zero. The answer is the agreed berth charge using the supplied terms. Impact: INR 24,000 is not a claim that every unquoted port cost is absent. Independent review: pending.
- **D02-rounding (unspecified_detail)**: No monetary rounding rule is supplied. Six started blocks is derived; 36 hours is a billing equivalent, not actual elapsed stay. Impact: All amounts are whole rupees, so formatting to paise causes no numerical rounding. Independent review: pending.

Code-derived extraction values: none.

