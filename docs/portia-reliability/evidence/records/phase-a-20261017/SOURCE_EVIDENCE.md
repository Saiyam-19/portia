# Source evidence

**DRAFT—INDEPENDENT APPROVAL PENDING** · Version 1.0-draft

Only these six decoded message strings from `tests/migration/pass1/inputs.json` were used as answer-label source. No production parser/calculator, previous expected/golden answer, model output, previous numerical report, official tariff or sealed holdout was consulted for the labels.

Canonical source file SHA-256, measured from all file bytes:

`52b1162c8ba5a54e9903028565f46da4c0100cf2b79adf2263a90143b58b1832`

Entry branch: `pass1/golden-and-repairs`. Entry HEAD: `2a77ead22c5a8dc365b58806f38accd4f959b2bd`. These are provenance, not proof that the working source equals a historical Git blob. The measured source hash is controlling.

| Canonical JSON pointer | Exact decoded UTF-8 copy | Original record |
|---|---|---|
| `/inputs/D11/0` | `source/D11-0.txt` | D11-original |
| `/inputs/D19/0` | `source/D19-0.txt` | D19-initial-original |
| `/inputs/D19/1` | `source/D19-1.txt` | D19-correction-original |
| `/inputs/D24/0` | `source/D24-0.txt` | D24-original |
| `/inputs/original-19/0` | `source/original-19-0.txt` | original-19-original |
| `/inputs/D02/0` | `source/D02-0.txt` | D02-original |

`source/manifest.json` records the source byte length, the same full-file hash, all six pointers, and each decoded message’s UTF-8 byte length and SHA-256. The `.txt` copies have exactly the decoded message bytes, with no added trailing newline. Original embedded newlines and Unicode punctuation are preserved.

`source/inputs.selected.json` is a projection retaining only the permitted `inputs` entries and array positions. It contains the exact decoded messages, reserialized as readable JSON. It is **not** a byte-for-byte copy of the entire original file; its own hash is therefore different. The full source is intentionally not included because unrelated messages/provenance are outside the label-authoring scope. A reviewer with only this packet can check all message-copy and packet hashes, but cannot reconstruct or independently verify the full source-file hash without the original repository file. That is a provenance limitation, not an arithmetic answer key.

Each original in messages.json matches its source pointer exactly. A paraphrase records its original pointer and original-message hash as lineage, plus its `variant_of` and variant number. The source pointer does not claim that the paraphrased wording existed in the original file. Paraphrases are Codex-authored message variants for independent review; their exact text is in messages.json, whose packet hash protects those bytes. They are generated in this Codex authoring chat, not captured application-model responses or mocked application outputs.

Labels cite exact message substrings with zero-based Unicode character offsets (end exclusive). Evidence for a variant points into that variant’s authored wording; the original source pointer establishes its lineage. Context evidence identifies the prior user message separately. Context for D19-correction-v1 is the authored D19-initial-v1, itself traceable to `/inputs/D19/0`.

Source copying and document rendering used short-lived Python standard-library scripts. Labels and formulas were authored by Codex from the messages. The scripts did not import project code, invoke an application model, or use an engine as the oracle. Local arithmetic checks are disclosed separately in AUTHOR_CHECKS.txt.
