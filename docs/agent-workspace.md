# Berthwise agent workspace

The chat route runs one AI SDK `ToolLoopAgent` with five public tools: `bash`, `calculate_charge_batch`, `search_vessels`, `get_vessel`, and `ask_user_input`. There are no nested model calls. Forms remain unresolved tool calls persisted through the existing Convex Agent history and run lifecycle.

The unified prompt owns tariff selection, filename/section citations, schedule dates and expiry, static-source caveats, units, rounding, GST, dated FX, and missing-voyage forms. All financial arithmetic, including comparisons and totals, uses the existing Decimal batch calculator. Fresh memory and notes are supplied as untrusted data before every model step.

## Files and execution

One `AgentWorkspace` and one command-facing Bash instance belong to each run. Its virtual filesystem contains:

| Path | Contract |
| --- | --- |
| `/ports/<slug>/*.md` | Immutable verified manifest assets, preserving original filenames. |
| `/memory/summary.md` | Immutable summary derived from canonical facts. |
| `/memory/long_term.sqlite` | Writable real SQLite candidate database, format/schema version 2. |
| `/scratchpad/current.md` | Writable private notes for the current chat. |
| `/tmp`, `/work` | Temporary files retained between shell calls within the run. |

Each shell call starts in `/work` with a clean environment. Variables, functions and cwd changes do not survive calls. Networking, Python, JavaScript and external binaries are disabled. A filesystem capability wrapper enforces writes, including parent-directory mutation, copy/move targets, links, path depth and allocation limits. The trusted host retains a separate restore capability. File-buffer reads return copies.

The command lifecycle is restore canonical state → execute → validate → derive typed fact operations/notes → persist → restore the published state. Integrity, exact schema and fact limits are checked before accepting changed databases. Candidate SQLite bytes are never persisted. Shell or validation failures return a nonzero result and restore durable mounts while preserving temporary files. Persistence failures and cancellation abort the shared run before another provider call or checkpoint.

## Saved facts and provenance

The sole table remains `facts(key TEXT PRIMARY KEY, value TEXT NOT NULL, sources TEXT NOT NULL)`. Schema changes are rejected. Explicit writes use an empty source array as a host-assigned provenance marker:

```sql
INSERT INTO facts(key,value,sources) VALUES ('currency','INR','[]')
ON CONFLICT(key) DO UPDATE SET value=excluded.value,sources='[]';
```

Existing nonempty source arrays must match the canonical fact exactly. The host assigns the current conversation as source; an unchanged-value write from another chat adds its provenance. Deleting the first source chat therefore preserves a fact supported by the second. The empty marker never reaches canonical storage. New values replace prior provenance. Cross-chat facts are saved only at the user's explicit request; chat notes can hold concise current progress.

`DELETE` on one key becomes `forget`; deleting the full table becomes `clear`. A successful writable SQLite deletion request still creates a privacy barrier when its key is absent or the table is empty. The SQLite command wrapper inspects dispatched SQL, including stdin and `-cmd`; comments, literals, `EXPLAIN`, read-only calls and other databases do not request a barrier. Calls combining deletion with `ROLLBACK`, or creating triggers, reject recoverably. Partial removals precede additions so replacement at the 64-fact limit is valid. A deletion command cannot also change notes. Privacy barriers advance the epoch once, invalidate older receipts and queued notes, clear prior notes and temporary copies, and fence old actors. Memory deletion and existing chat-history text are separate operations.

## Coordinator and replay

`MemorySession.workspace()` supplies the host persistence adapter and shared abort handling. Acceptance requires the live owner/run, current fence and lease, expected epoch, baseline memory revision, baseline note revision, and an idle namespace. The complete fact projection and source ownership are validated before one queue row accepts the entire envelope.

A durable receipt binds run/tool-call identity to command and payload hashes. Replay is checked before executing the shell. A pending receipt drains accepted work; it never reexecutes the command. A read-only call writes a completed receipt without queueing. Publication atomically replaces the canonical snapshot, writes eligible chat notes, marks receipts done and advances the applied sequence. Accepted work can publish after its originating run is cancelled. Legacy notes writes cannot bypass a queued envelope.

Receipts retain at most 64 calls per run. Indexed cleanup removes old outputs after barriers, removes deleted-chat receipts, and cleans terminal/expired runs after the retention job; active runs retain their receipts. Legacy scalar memory operations and format-2 snapshots remain readable.

## Limits and unavailable memory

- One response: 12 model steps, a 240-second admission deadline, 8192 aggregate output tokens, no automatic provider retries. Each step receives the remaining token allowance from reported SDK usage; missing usage exhausts the allowance before another call.
- One shell call: 16 KiB source, 10 seconds, 5 seconds per SQLite request, 16 KiB combined returned output with an explicit truncation notice, and 16 typed fact operations. A full clear is one operation.
- Saved state: 64 facts, 8 sources per fact, 1024 UTF-8 bytes per value, 6000 bytes of notes, 256 KiB SQLite image and 512 KiB archive. Internal SQLite formatted output allows 1 MiB because the installed formatter preflights at roughly eight times raw cell size; raw database results remain bounded to 256 KiB.
- Files: 1 MiB temporary content, verified asset bytes plus 2 MiB total filesystem capacity, at most 1024 entries with restore reserve, and mutation paths limited to 1024 characters and 64 components.

When persistent memory is disabled, the same verified tariffs and temporary files remain available through an ephemeral workspace. No memory bridge calls occur. Durable mount edits reject and abort rather than claiming a save. Fresh instructions state that cross-chat saving is unavailable.

## Runtime and rollback

The target is Node 24 LTS (`24.x`). Production enables all just-bash defense-in-depth guards with no exclusions. Development retains only the three existing Next hook exceptions. Route tracing must include the SQLite worker and sql.js WASM assets.

Deploy compatible history readers before emitting the five new tools. Keep old tool names in historical decoders and UI labels. Roll back to the compatible-reader release with its compatible coordinator/schema; a frontend rollback does not roll back accepted memory operations. This run's pre-cutover source/build snapshot is retained locally under `.local/rollback/compatible-readers`. Production deployment remains a separate action.
