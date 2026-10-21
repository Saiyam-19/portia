import { MemoryFeatureProvider } from '@/components/memory/feature'
import { getCurrentUser, getMigrationToken } from '@/lib/migration/auth-server'
import { MigrationProvider } from '@/components/migration/provider'
import SessionGate from '@/components/dashboard/session-gate'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/dashboard/sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import { cookies } from 'next/headers'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser().catch(() => null)
  if (!user) redirect('/login')
  const token = await getMigrationToken()
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false'

  return (
    <MigrationProvider key={user.id} initialToken={token}><SessionGate userId={user.id}><MemoryFeatureProvider enabled={process.env.PORTIA_MEMORY_ENABLED === 'true'}><SidebarProvider defaultOpen={defaultOpen} className="app-root chat-workspace h-dvh min-h-0 overflow-hidden bg-sidebar" style={{ '--sidebar-width': '268px' } as React.CSSProperties}>
      <a href="#workspace-main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">Skip to conversation</a>
      <Sidebar email={user.email ?? ''} name={user.name ?? ''} />
      <main id="workspace-main" tabIndex={-1} className="relative flex min-w-0 flex-1 flex-col overflow-clip bg-page outline-none transition-[margin] duration-300 lg:my-2 lg:mr-2 lg:rounded-[14px] lg:shadow-card lg:peer-data-[state=collapsed]:ml-2">{children}</main>
    </SidebarProvider></MemoryFeatureProvider></SessionGate></MigrationProvider>
  )
}
