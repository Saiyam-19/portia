import { DefaultChatTransport, type UIMessage } from "ai";

export const migrationTransport = new DefaultChatTransport<UIMessage>({
  api: "/api/chat",
  credentials: "include",
  prepareSendMessagesRequest: ({ body }) => {
    if (!body) throw new Error("Migration request body is required.");
    return { body };
  },
});
