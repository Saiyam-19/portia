import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getToken: vi.fn(() => { throw new Error("must not run"); }) }));
vi.mock("@/lib/migration/config", () => ({ migrationPreviewEnabled: () => false }));
vi.mock("@/lib/migration/auth-server", () => ({ getMigrationToken: auth.getToken }));
vi.mock("@/components/migration/provider", () => ({
  MigrationProvider: ({ children }: { children: React.ReactNode }) => <div>provider{children}</div>,
}));

import MigrationLayout from "../../src/app/migration/layout";

it("skips auth and provider initialization while the preview is disabled", async () => {
  const tree = await MigrationLayout({ children: <span>disabled child</span> });
  expect(renderToStaticMarkup(tree)).toBe("<span>disabled child</span>");
  expect(auth.getToken).not.toHaveBeenCalled();
});
