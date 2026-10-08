'use client'

import { Loader2, CheckCircle2, Anchor, Ship } from 'lucide-react'

interface Props {
  tool: string
  label: string
  status: 'running' | 'done'
}

const TOOL_ICONS: Record<string, React.ElementType> = {
  'consult_port_agent': Anchor,
  'search_vessels':     Ship,
  'get_vessel':         Ship,
}

export default function ToolNotification({ tool, label, status }: Props) {
  const Icon = TOOL_ICONS[tool] ?? Anchor

  return (
    <div className="flex items-center gap-2 text-xs text-slate-400 py-0.5">
      <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-full px-3 py-1">
        {status === 'running' ? (
          <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
        ) : (
          <CheckCircle2 className="w-3 h-3 text-green-500" />
        )}
        <Icon className="w-3 h-3" />
        <span className={status === 'done' ? 'text-slate-400' : 'text-slate-500'}>
          {label}
          {status === 'running' && '…'}
        </span>
      </div>
    </div>
  )
}
