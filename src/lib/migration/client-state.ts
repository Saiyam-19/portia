import { migrationChatRequestSchema, type ModelAlias } from "./contracts";

export function makeQuestionRequest(input: {
  requestId: string; conversationId: string; expectedRevision: number;
  modelAlias: ModelAlias; text: string;
}) {
  const { text, ...base } = input;
  return migrationChatRequestSchema.parse({ ...base, kind: "question", question: text });
}

export function migrationRunState(
  transportStatus: string,
  streamedRunId: string | undefined,
  conversation: { state: string; activeRunId: string | null } | undefined,
) {
  const transportBusy = transportStatus === "streaming" || transportStatus === "submitted";
  const sharedRunning = conversation?.state === "running";
  return {
    running: transportBusy || sharedRunning,
    activeRunId: streamedRunId ?? conversation?.activeRunId ?? undefined,
  };
}

export type QuestionDraftState = {
  input: string;
  editVersion: number;
  pending: { text: string; editVersion: number; revision: number; runId?: string } | null;
};
export const initialQuestionDraft: QuestionDraftState = { input: "", editVersion: 0, pending: null };

type RunMetadata = { runId?: string; revision?: number } | undefined;
type QuestionDraftAction =
  | { type: "edit"; value: string }
  | { type: "question"; text: string; revision: number }
  | { type: "transport-failed" }
  | { type: "observe"; metadata: RunMetadata }
  | { type: "saved"; runId: string; status: string | null; transportBusy: boolean };

/** A closed HTTP stream is not a durable acknowledgement of a successful run. */
export function questionDraftReducer(state: QuestionDraftState, action: QuestionDraftAction): QuestionDraftState {
  if (action.type === "edit") return { ...state, input: action.value, editVersion: state.editVersion + 1 };
  if (action.type === "question") return {
    ...state,
    input: action.text,
    pending: { text: action.text, editVersion: state.editVersion, revision: action.revision },
  };
  const pending = state.pending;
  if (!pending) return state;
  if (action.type === "observe") {
    if (!action.metadata?.runId || action.metadata.revision !== pending.revision || action.metadata.runId === pending.runId) return state;
    return { ...state, pending: { ...pending, runId: action.metadata.runId } };
  }
  if (action.type === "saved") {
    if (action.transportBusy || action.runId !== pending.runId) return state;
    if (action.status === "completed") {
      return { ...state, input: state.editVersion === pending.editVersion ? "" : state.input, pending: null };
    }
    if (!["error", "cancelled", "expired"].includes(action.status ?? "")) return state;
  }
  // Failure may arrive after the composer became editable. Preserve all newer edits,
  // including an intentionally emptied draft, instead of restoring stale text.
  if (state.editVersion !== pending.editVersion || state.input === pending.text) return state;
  return { ...state, input: pending.text };
}
