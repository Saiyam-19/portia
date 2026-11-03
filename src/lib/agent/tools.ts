import { z } from "zod";
import { formInputSchema } from "../chat/contracts";
import { calculateChargeBatch, chargeCalculationsSchema } from "../maritime/calculator-batch";
import { getVessel, searchVessels } from "../maritime/vessels";
import type { AgentStore } from "./store";
import { conversationWorkspace } from "./workspace";

/** What every tool call of a session receives as `context`, set when the route opens the session. */
export type ToolScope = { ownerId: string; conversationId: string };

type ToolContext = { signal: AbortSignal; executionId: string; sessionId: string; context?: unknown };
type HostTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  idempotent: boolean;
  writes?: boolean;
  execute(input: unknown, context: ToolContext): Promise<unknown> | unknown;
};

/** JSON Schema without the `$schema` key, so the serialized tool list is compact and stable. */
function schema(type: z.ZodType) {
  const { $schema: _ignored, ...json } = z.toJSONSchema(type, { io: "input" }) as Record<string, unknown>;
  void _ignored;
  return json;
}

function scope(context: ToolContext): ToolScope {
  const value = context.context as Partial<ToolScope> | undefined;
  if (typeof value?.ownerId !== "string" || typeof value.conversationId !== "string") throw new Error("This session has no conversation scope.");
  return { ownerId: value.ownerId, conversationId: value.conversationId };
}

const bashInput = z.object({ command: z.string().min(1).max(16 * 1024) }).strict();
const calculationInput = z.object({ calculations: chargeCalculationsSchema }).strict();
const searchInput = z.object({ query: z.string().min(1).max(160), limit: z.number().int().min(1).max(50).default(5) }).strict();
const vesselInput = z.object({ id: z.string().min(1).max(20), id_type: z.enum(["imo", "mmsi"]).default("imo") }).strict();

export const FORM_TOOL = "ask_user_input";

/**
 * The tool list is built once and never varies by user or turn: tool schemas sit
 * near the start of every request, so any change there would invalidate the cache.
 */
export function createTools(deps: { store: AgentStore; fetchImpl?: typeof fetch }): HostTool[] {
  return [
    {
      name: "bash",
      description: "Run a bash command in this conversation's sandbox: read tariffs under /ports, read and edit saved memory under /memories and working notes at /notes/current.md, and use /work and /tmp as scratch. Edits to /memories and /notes are saved when the command succeeds. No network. Not for arithmetic: use calculate_charge_batch.",
      inputSchema: schema(bashInput),
      // A rerun after a crash could repeat an append, so libfx never replays it on its own.
      idempotent: false,
      writes: true,
      async execute(input, context) {
        const { command } = bashInput.parse(input);
        const { ownerId, conversationId } = scope(context);
        const workspace = await conversationWorkspace(deps.store, conversationId, ownerId);
        const result = await workspace.bash(command, context.signal);
        const parts = [result.stdout];
        if (result.stderr) parts.push(`[stderr]\n${result.stderr}`);
        if (result.exitCode !== 0) parts.push(`[exit code ${result.exitCode}]`);
        return parts.filter(Boolean).join("\n") || "[no output]";
      },
    },
    {
      name: "calculate_charge_batch",
      description: "Calculate financial line items, totals, comparisons, GST, FX and rounding with exact decimal arithmetic. Ordered expressions reference earlier results with $id. Supports + - * / **, parentheses, ceil, floor, min, max and half-up round. All items fail together if one is invalid.",
      inputSchema: schema(calculationInput),
      idempotent: true,
      execute(input) {
        const { calculations } = calculationInput.parse(input);
        try { return { calculations: calculateChargeBatch(calculations) }; }
        catch (error) { return { error: `Calculation error: ${error instanceof Error ? error.message : "Invalid arithmetic."}` }; }
      },
    },
    {
      name: "search_vessels",
      description: "Search vessels by name, IMO, MMSI or callsign.",
      inputSchema: schema(searchInput),
      idempotent: true,
      execute(input, context) {
        const { query, limit } = searchInput.parse(input);
        return searchVessels(query, limit, { fetchImpl: deps.fetchImpl, abortSignal: context.signal });
      },
    },
    {
      name: "get_vessel",
      description: "Get vessel particulars by IMO or MMSI.",
      inputSchema: schema(vesselInput),
      idempotent: true,
      execute(input, context) {
        const { id, id_type } = vesselInput.parse(input);
        return getVessel(id, id_type, { fetchImpl: deps.fetchImpl, abortSignal: context.signal });
      },
    },
    {
      name: FORM_TOOL,
      description: "Show the user a form for missing details, such as voyage particulars. Call it alone, after any lookups. The user's answers arrive as their next message, so end your turn after it returns.",
      inputSchema: schema(formInputSchema),
      idempotent: true,
      writes: true,
      execute(input) {
        formInputSchema.parse(input);
        return "The form is now shown to the user. End your turn with one short sentence; do not call more tools.";
      },
    },
  ];
}
