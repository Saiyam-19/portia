import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  paginated: vi.fn(() => { throw new Error("protected paginated query invoked"); }),
  query: vi.fn(() => { throw new Error("protected query invoked"); }),
}));

vi.mock("@/lib/migration/auth-client", () => ({
  migrationAuthClient: {
    useSession: () => ({ isPending: false, data: null }),
    signIn: { email: vi.fn() },
    signOut: vi.fn(),
  },
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: false }),
  usePaginatedQuery: hooks.paginated,
  useQuery: hooks.query,
}));
vi.mock("@ai-sdk/react", () => ({ useChat: vi.fn(() => ({
  messages: [], sendMessage: vi.fn(), status: "ready", stop: vi.fn(),
  error: null, setMessages: vi.fn(),
})) }));

import { MigrationPreview } from "../../src/components/migration/migration-preview";

it("renders login without invoking protected Convex queries", () => {
  const html = renderToStaticMarkup(<MigrationPreview developmentModel={false} />);
  expect(html).toContain("Migration sign in");
  expect(hooks.paginated).not.toHaveBeenCalled();
  expect(hooks.query).not.toHaveBeenCalled();
});
