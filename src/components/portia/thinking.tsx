'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Segment } from '@/lib/portia/types'
import { Collapse, Elapsed, Shimmer, formatDuration } from '@/components/ui/motion'

type Thinking = Extract<Segment, { kind: 'thinking' }>

const EASE = 'cubic-bezier(0.23,1,0.32,1)'

export function Sparkle({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden className="shrink-0 transition-colors duration-300">
      <path
        d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"
        fill={active ? 'var(--ink-2)' : 'var(--ink-3)'}
        style={active ? { transformOrigin: 'center', animation: 'pulse-dot 1.6s ease-in-out infinite' } : undefined}
      />
    </svg>
  )
}

/* Beautiful UI "Thinking" — auto-opens while the agent works,
 * settles into a one-line summary, stays expandable. */
export function ThinkingTrace({ segment }: { segment: Thinking }) {
  const working = segment.status === 'running'
  const [manual, setManual] = useState<boolean | null>(null)
  const open = manual ?? working

  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setManual(!open)}
        className="-mx-1.5 flex w-fit items-center gap-2 rounded-control px-1.5 py-1 transition-colors duration-100 hover:bg-hover-2"
      >
        <Sparkle active={working} />
        <span role="status" className="text-[13px] font-medium whitespace-nowrap">
          {working ? (
            <Shimmer>Thinking</Shimmer>
          ) : (
            <span className="text-ink-2" style={{ animation: 'fade-in 350ms ease-out both' }}>
              Thought for {formatDuration((segment.endedAt ?? segment.startedAt) - segment.startedAt)}
            </span>
          )}
        </span>
        {working && <Elapsed since={segment.startedAt} />}
        <ChevronDown
          className="size-3.5 text-ink-3 transition-transform duration-300"
          strokeWidth={2.2}
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transitionTimingFunction: EASE }}
        />
      </button>

      <Collapse open={open}>
        <div className="relative mt-0.5 ml-[6px] pl-4">
          <span aria-hidden className="absolute top-0 bottom-1 left-[1px] w-px bg-line-strong/70" />
          <div className="flex flex-col gap-0.5 py-1">
            {segment.steps.slice(0, working ? Math.min(segment.visible + 1, segment.steps.length) : segment.steps.length).map((step, i) => {
              const live = working && i === segment.visible
              return (
                <div
                  key={step.label}
                  className="flex min-h-7 items-center gap-2 px-1.5"
                  style={{ animation: `fade-up 320ms ${EASE} both` }}
                >
                  {live ? (
                    <span
                      className="size-3 shrink-0 rounded-full border-[1.5px] border-line-strong border-t-ink-2"
                      style={{ animation: 'spin 700ms linear infinite' }}
                    />
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                  <span className={live ? 'text-[12.5px] font-medium text-ink' : 'text-[12.5px] text-ink-2'}>
                    {step.label}
                  </span>
                  {step.detail && <span className="font-mono text-[11px] text-ink-3">{step.detail}</span>}
                </div>
              )
            })}
          </div>
        </div>
      </Collapse>
    </div>
  )
}
