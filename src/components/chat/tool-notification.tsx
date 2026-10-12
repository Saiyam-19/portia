'use client'

import { Loader2, Check, Anchor, Ship, XCircle, BookOpen, NotebookPen } from 'lucide-react'

interface Props { tool: string; label: string; status: 'running' | 'done' | 'error' }
const TOOL_ICONS: Record<string, React.ElementType> = { consult_port_agent: Anchor, search_vessels: Ship, get_vessel: Ship, remember_memory: BookOpen, recall_memory: BookOpen, forget_memory: BookOpen, write_scratchpad: NotebookPen, read_scratchpad: NotebookPen }

export default function ToolNotification({ tool, label, status }: Props) {
  const Icon = TOOL_ICONS[tool] ?? Anchor
  return (
    <div role="status" className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
      {status === 'running' ? <Loader2 className="size-3.5 shrink-0 animate-spin text-brand motion-reduce:animate-none" aria-hidden="true" /> : status === 'error' ? <XCircle className="size-3.5 shrink-0 text-destructive" aria-hidden="true" /> : <Check className="size-3.5 shrink-0 text-brand" aria-hidden="true" />}
      <Icon className="size-3.5 shrink-0" aria-hidden="true" /><span>{label}{status === 'running' && '…'}{status === 'error' && ' · incomplete'}</span>
    </div>
  )
}
