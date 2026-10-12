import { MigrationProvider } from "@/components/migration/provider";
import { getMigrationToken } from "@/lib/migration/auth-server";
import { migrationPreviewEnabled } from "@/lib/migration/config";

export const dynamic = "force-dynamic";

export default async function MigrationLayout({ children }: { children: React.ReactNode }) {
  if (!migrationPreviewEnabled()) return <>{children}</>;
  const token = await getMigrationToken().catch(() => null);
  return <MigrationProvider initialToken={token}>{children}</MigrationProvider>;
}
