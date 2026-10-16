Routing inspected at pass3; no UI journey performed.

| Entry / flow | Interpreter |
|---|---|
| Current Next.js chat, both model aliases | New flat-fact v3 contract. `src/lib/migration/transport.ts` targets `/api/chat`; that route re-exports `/api/migration/chat`. The handler calls `createMigrationMainAgent` without a legacy override. |
| Supplied quotes, corrections, comparisons, elapsed-time, official quotes/rules | All enter v3 through that same handler; arithmetic and official authority remain code-owned. |
| General chat, lookup, memory actions and form replies through current Next.js chat | Same v3 entrypoint, then existing auxiliary tools/state. Routing verified in source; broader behavioral acceptance not claimed. |
| Successful historical conversation receipts | Retained v1 reducer/replay, including legacy scopes, operations and literal expression receipts. New receipts carry a code-owned `facts-v3` contract tag. |
| Old pass2 flat facts / captured-output replay | Internal v2 compatibility decoder. It normalizes recognized old representation forms; it is not the live model schema. |
| Explicit `createMigrationMainAgent({interpretationFormat:'legacy'})` | Retained v1 interpreter, used by historical mocked-agent regression fixtures. No current application route selects it. |
| Retained Python backend: `/conversations/{id}/stream`, `/conversations/{id}/form_response` | Original Python/LangChain agent in `backend/main.py` / `backend/agent.py`, unchanged. Current Next.js chat does not route there. Direct backend operation not exercised. |

No automatic v3-to-legacy fallback, no legacy deletion, no user-facing interpreter switch added.
New numerical/semantic failures cannot trigger an unbounded alternate-model/interpreter retry.
