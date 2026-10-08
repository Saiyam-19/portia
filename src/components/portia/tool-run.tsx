'use client'

import { useState } from 'react'
import { Anchor, Calculator, ChevronDown, Search, Ship } from 'lucide-react'
import type { Segment } from '@/lib/portia/types'
import { cn } from '@/lib/portia/cn'
import { Collapse, Elapsed, Shimmer } from '@/components/ui/motion'

type Tool = Extract<Segment, { kind: 'tool' }>

const ICONS: Record<Tool['tool'], typeof Ship> = {
  consult_port_agent: Anchor,
  search_vessels: Search,
  get_vessel: Ship,
  calculate_charges: Calculator,
}

const EASE = 'cubic-bezier(0.23,1,0.32,1)'

function StatusGlyph({ status }: { status: Tool['status'] }) {
  if (status === 'running')
    return (
      <span
        className="size-3 shrink-0 rounded-full border-[1.5px] border-line-strong border-t-ink-2"
        style={{ animation: 'spin 700ms linear infinite' }}
      />
    )
  if (status === 'error')
    return (
      <span className="flex size-3.5 items-center justify-center rounded-full bg-red-tint text-red" style={{ animation: 'pop-in 250ms both' }}>
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </span>
    )
  return (
    <span className="t-success-check text-green">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </span>
  )
}

function ToolRow({ tool }: { tool: Tool }) {
  const [open, setOpen] = useState(false)
  const Icon = ICONS[tool.tool]
  const running = tool.status === 'running'
  return (
    <div style={{ animation: `fade-up 300ms ${EASE} both` }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="group/row -mx-1 flex h-8 w-[calc(100%+8px)] min-w-0 items-center gap-2 rounded-control px-1 text-left transition-colors duration-100 hover:bg-hover-2"
      >
        <span className="relative flex size-4 shrink-0 items-center justify-center text-ink-3">
          <Icon
            className={cn('size-[14px] transition-opacity duration-100 group-hover/row:opacity-0', open && 'opacity-0')}
            strokeWidth={1.9}
          />
          <ChevronDown
            className={cn(
              'absolute size-3.5 transition-[opacity,transform] duration-150 group-hover/row:opacity-100',
              open ? 'opacity-100' : 'opacity-0',
            )}
            strokeWidth={2.2}
            style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          />
        </span>
        <span className="shrink-0 text-[12.5px] font-medium text-ink">
          {running ? <Shimmer>{tool.label.replace(/^Consulted/, 'Consulting').replace(/^Calculated/, 'Calculating').replace(/^Looked up/, 'Looking up')}</Shimmer> : tool.label}
        </span>
        <span
          className={cn(
            'inline-flex h-5.5 min-w-0 shrink items-center truncate rounded-chip bg-field px-1.5 font-mono text-[11px] text-ink-2 shadow-hairline',
            tool.status === 'error' && 'text-red',
          )}
        >
          <span className="truncate">{tool.chip}</span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2 pl-2">
          {running ? (
            <Elapsed since={tool.startedAt} />
          ) : (
            <Elapsed since={tool.startedAt} until={tool.endedAt} className="opacity-0 transition-opacity duration-150 group-hover/row:opacity-100" />
          )}
          <StatusGlyph status={tool.status} />
        </span>
      </button>

      <Collapse open={open}>
        <div className="mt-0.5 mb-1.5 ml-[7px] flex flex-col gap-0.5 border-l border-line-strong/70 py-0.5 pl-4">
          {tool.detail.map((line) => (
            <span
              key={line}
              className={cn(
                'font-mono text-[11.5px] leading-[1.65]',
                tool.status === 'error' ? 'text-red' : line.startsWith('=') ? 'text-green' : 'text-ink-2',
              )}
            >
              {line}
            </span>
          ))}
        </div>
      </Collapse>
    </div>
  )
}

/* Tool Chips — an agent run as compact rows with inline chips.
 * Open while the turn is live; folds into one line once settled. */
export function ToolRun({ tools, settled }: { tools: Tool[]; settled: boolean }) {
  const [manual, setManual] = useState<boolean | null>(null)
  const open = manual ?? !settled
  const running = tools.some((t) => t.status === 'running')
  const failed = tools.some((t) => t.status === 'error')
  const summary = running
    ? `Running ${tools.length === 1 ? 'a tool' : `${tools.length} tools`}`
    : `${failed ? 'Ran' : 'Used'} ${tools.length} tool${tools.length === 1 ? '' : 's'}`

  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setManual(!open)}
        className="-mx-1.5 flex w-fit items-center gap-1.5 rounded-control px-1.5 py-1 text-[12.5px] text-ink-2 transition-colors duration-100 hover:bg-hover-2"
      >
        <ChevronDown
          className="size-3 transition-transform duration-200"
          strokeWidth={2.4}
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
        <span className="tabular-nums">{summary}</span>
        {!open && (
          <span className="ml-1 flex -space-x-1" style={{ animation: 'fade-in 200ms both' }}>
            {tools.slice(0, 4).map((t) => {
              const Icon = ICONS[t.tool]
              return (
                <span key={t.id} className="flex size-4.5 items-center justify-center rounded-full bg-surface text-ink-3 shadow-[0_0_0_1.5px_var(--page),0_0_0_2.5px_var(--line-strong)]">
                  <Icon className="size-2.5" strokeWidth={2.2} />
                </span>
              )
            })}
          </span>
        )}
      </button>
      <Collapse open={open} className="-mx-1.5 px-1.5">
        <div className="flex flex-col gap-0.5 pt-1 pb-0.5">
          {tools.map((t) => (
            <ToolRow key={t.id} tool={t} />
          ))}
        </div>
      </Collapse>
    </div>
  )
}
