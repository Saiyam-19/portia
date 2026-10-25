import WorkspaceHeader from '@/components/dashboard/workspace-header'
import ResultCard from '@/components/chat/result-card'
import { portBooks } from '@/lib/berthwise/rulebook/books'
import { coverage } from '@/lib/berthwise/rulebook/describe'
import type { CoverageCard } from '@/lib/berthwise/card-types'

export const dynamic = 'force-dynamic'

/** Which ports Berthwise prices, from which schedules, and what it doesn't price. */
export default function CoveragePage() {
  const today = new Date().toISOString().slice(0, 10)
  const card: CoverageCard = { kind: 'coverage', date: today, ports: coverage(portBooks(), today) }
  return (
    <div className="flex h-full flex-col">
      <WorkspaceHeader title="Ports covered" />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-5 pt-5 pb-8 text-sm leading-7 sm:px-8">
          <p className="text-muted-foreground">Berthwise prices port calls from each port&apos;s published rate schedule. Open a port&apos;s notes in a chat (&ldquo;Show how Mundra charges&rdquo;) to see every rate and its source page.</p>
          <ResultCard card={card} />
        </div>
      </div>
    </div>
  )
}
