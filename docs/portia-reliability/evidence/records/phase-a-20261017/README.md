# Phase A review packet

**DRAFT—INDEPENDENT APPROVAL PENDING**

Version 1.0-draft · 17 October 2026. Documents/data authoring only. No independent review or approval has occurred. External inference spend: **USD 0.00**, calls: **0**; see COST_LEDGER.json. The overall USD 2 ceiling authorizes no spending here.

## Exact upload / paste order

Use a separate model/session that did not author this packet. Keep the answer key hidden until its blind recomputation is recorded.

1. Paste **REVIEWER_PROMPT.txt in full**, including its standing rules and scope override.
2. Upload **README.md**, then **messages.json**. Neither contains computed answers.
3. Upload **SOURCE_EVIDENCE.md**, **source/manifest.json**, **source/inputs.selected.json**, then these exact decoded source copies: **source/D11-0.txt**, **source/D19-0.txt**, **source/D19-1.txt**, **source/D24-0.txt**, **source/original-19-0.txt**, **source/D02-0.txt**. Finally upload **SHA256SUMS**. The full-file source hash is lineage evidence; the partial projection cannot independently reproduce that full-file hash.
4. Say: “Perform Stage 1 only. Inspect and independently recompute all 16 records from messages and prior-user context. Return the blind record before seeing any answer key.” Wait for the complete blind result. Save that result unchanged.
5. Only then upload **labels.json**, **ORACLE.md**, **CHANGELOG.md**, **AUTHOR_CHECKS.txt**, **COST_LEDGER.json**, and **RESOURCE_DISPOSITION.md**. Say: “Perform Stage 2. Compare every field and number for all 16 records against your saved blind work. List mismatches and ambiguities; give APPROVE / REJECT / NEEDS CLARIFICATION.”
6. Return the reviewer’s full findings to this authoring chat: verdict, coverage table, per-record differences, assumptions needing clarification, reviewer identity/session if available, packet version, and labels.json/messages.json hashes. Preserve the Stage 1 record too. Do not send application-model outputs for label tuning.

If the checker can access the whole directory, instruct it to obey the same read order and not open the answer key early. Do not upload an archive containing the answer key for Stage 1. Author self-checks are not independent approval.

## Coverage

| Original case | Original records | Paraphrases | Independently evaluable records |
|---|---|---|---|
| D11 | D11-original | D11-v1, D11-v2 | 3 |
| D19 | D19-initial-original, D19-correction-original | D19-initial-v1, D19-correction-v1 | 4 |
| D24 | D24-original | D24-v1, D24-v2 | 3 |
| original-19 | original-19-original | original-19-v1, original-19-v2 | 3 |
| D02 | D02-original | D02-v1, D02-v2 | 3 |
| **Total** | **6 messages from 5 cases** | **10 variants** | **16 records** |

Each correction is self-contained with its preceding authored initial message. The original correction uses the exact original initial message; the correction variant uses D19-initial-v1. Those context copies are not extra evaluation records. The approximately 160-call sweep refers to these 16 records, not 16 case families; no sweep or call is authorized or performed here.

These five original cases are **supplied fictional quotations**. Official tariff documents are not needed and must not replace quoted terms. Place names and quotation labels do not certify official tariff authority. No application, engine, production schema/prompt/configuration, tests, commits, deployment, automation or holdout changes belong to this packet.

## Packet conventions

- **messages.json**: inputs, explicit user context, IDs and provenance only. No extraction labels or derived results.
- **labels.json**: Codex-authored extraction facts, context-only facts, explicit `none` versus `not_stated`, correction resolution, and separately marked `DERIVED_ORACLE_OUTPUT` calculations/final answers. Decimal money values are strings.
- **ORACLE.md**: full readable answer key for each of the 16 records, including exact messages, evidence, arithmetic, final answers and assumptions.
- **SOURCE_EVIDENCE.md / source/**: selected input copies, file/message hashes, pointers and provenance limitations. No prior expected answers or model outputs.
- **AUTHOR_CHECKS.txt**: literal local author-check outputs only; no independent verdict.
- **CHANGELOG.md**: initial authoring version. After review, edits require a provable error and logged reason; never tune against model outputs.
- **SHA256SUMS**: every packet file except itself. After all files are present, run `shasum -a 256 -c SHA256SUMS` from this directory.

The answer key discloses interpretation issues rather than silently filling gaps. Review must particularly check supplied versus derived values, quotation scope, ambiguous/unstated conventions, and context carry-forward. Any remaining semantic approval belongs to the separate checker and user.
