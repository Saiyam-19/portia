import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@ai-sdk/react", () => ({ useChat: () => ({ messages: [], sendMessage: vi.fn(), status: "ready", stop: vi.fn(), setMessages: vi.fn(), clearError: vi.fn() }) }));
vi.mock("../../src/components/dashboard/workspace-header", () => ({ default: () => null }));
vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
  useQuery: () => ({ conversation: { id: "chat", state: "waiting", revision: 2, activeRunId: null, modelAlias: "model-1" }, forms: [{ toolCallId: "details", title: "Voyage details", status: "pending", fields: [{ name: "berth", label: "Berth", type: "text", required: true }] }] }),
  usePaginatedQuery: () => ({ status: "Exhausted", results: [{ id: "message", role: "assistant", order: 1, stepOrder: 0, runId: "run", runStatus: "waiting", parts: [{ type: "tool-call", toolName: "ask_user_input", toolCallId: "details" }] }] }),
}));
import ChatView from "../../src/components/chat/chat-view";

it("keeps a message composer available while required form fields are pending", () => {
  const html = renderToStaticMarkup(<ChatView conversationId="chat" />);
  expect(html).toContain("Voyage details");
  expect(html).toContain('aria-label="Message composer"');
  expect(html).toContain('aria-label="Message"');
});
