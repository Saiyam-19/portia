'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Download, FileText, Ship } from 'lucide-react'
import type { Estimate } from '@/lib/portia/types'
import { Button, CopyButton, IconSwap } from '@/components/ui/button'
import { CountUp } from '@/components/ui/motion'
import { useToast } from '@/components/ui/toast'

const inr = (n: number, digits = 0) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n)

const EASE = 'cubic-bezier(0.23,1,0.32,1)'

function asText(e: Estimate, total: number) {
  return [
    `${e.port} — ${e.terminal}`,
    `${e.vessel.name} (IMO ${e.vessel.imo})`,
    '',
    ...e.lines.map((l) => `${l.label}\t${l.basis}\t${inr(l.amount, 2)}`),
    `Total (excl. GST)\t\t${inr(total, 2)}`,
  ].join('\n')
}

/* ReUI "async action button": idle → loading → success → idle. */
function ExportButton() {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const toast = useToast()
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={state === 'loading'}
      leading={
        <IconSwap on={state === 'done'} a={<Download strokeWidth={1.9} />} b={<Check strokeWidth={2.6} className="text-green" />} />
      }
      onClick={() => {
        setState('loading')
        timers.current.push(
          setTimeout(() => {
            setState('done')
            toast('Estimate exported as CSV', 'success')
          }, 1100),
          setTimeout(() => setState('idle'), 2800),
        )
      }}
    >
      {state === 'done' ? 'Exported' : 'Export CSV'}
    </Button>
  )
}

export function EstimateCard({ estimate }: { estimate: Estimate }) {
  const total = estimate.lines.reduce((s, l) => s + l.amount, 0)
  const max = Math.max(...estimate.lines.map((l) => l.amount))
  const toast = useToast()

  return (
    <div
      className="w-full overflow-hidden rounded-card bg-surface shadow-card"
      style={{ animation: `fade-up 420ms ${EASE} both` }}
    >
      {/* header */}
      <div className="flex items-start gap-3 px-4 pt-3.5 pb-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-accent-tint text-accent-ink">
          <Ship className="size-4" strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-ink">Estimated port charges</div>
          <div className="mt-0.5 truncate text-[12px] text-ink-3">
            {estimate.port} · {estimate.terminal}
          </div>
        </div>
        <CopyButton text={() => asText(estimate, total)} label="Copy as table" onCopied={() => toast('Estimate copied', 'success')} />
      </div>

      {/* vessel chips */}
      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        {[
          estimate.vessel.name,
          `IMO ${estimate.vessel.imo}`,
          `${estimate.vessel.grt.toLocaleString('en-IN')} GRT`,
          `LOA ${estimate.vessel.loa} m`,
        ].map((chip, i) => (
          <span
            key={chip}
            className="inline-flex h-6 items-center rounded-chip bg-field px-2 text-[11.5px] text-ink-2 shadow-hairline"
            style={{ animation: `pop-in 240ms ${EASE} ${120 + i * 50}ms both` }}
          >
            {i === 1 ? <span className="font-mono">{chip}</span> : chip}
          </span>
        ))}
      </div>

      {/* line items */}
      <div className="border-t border-line">
        {estimate.lines.map((line, i) => (
          <div
            key={line.label}
            className="group grid grid-cols-[1fr_auto] items-center gap-x-4 border-b border-line/70 px-4 py-2.5 transition-colors duration-100 last:border-b-0 hover:bg-inset"
            style={{ animation: `fade-up 340ms ${EASE} ${200 + i * 70}ms both` }}
          >
            <div className="min-w-0">
              <div className="text-[13px] text-ink">{line.label}</div>
              <div className="mt-0.5 truncate font-mono text-[11px] text-ink-3">{line.basis}</div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-[13px] font-medium tabular-nums text-ink">{inr(line.amount)}</span>
              <span className="h-[3px] w-16 overflow-hidden rounded-full bg-hover-2">
                <span
                  className="block h-full rounded-full bg-accent/70"
                  style={{
                    width: `${(line.amount / max) * 100}%`,
                    transformOrigin: 'left',
                    animation: `bar-grow 700ms ${EASE} ${320 + i * 70}ms both`,
                  }}
                />
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* total */}
      <div className="flex items-end justify-between gap-4 bg-inset px-4 py-3 shadow-[inset_0_1px_0_var(--line)]">
        <div>
          <div className="text-[12px] text-ink-3">Total, excluding GST</div>
          <div className="mt-0.5 text-[20px] font-semibold tracking-[-0.02em] text-ink">
            <CountUp value={total} format={(n) => inr(n)} duration={1100} />
          </div>
        </div>
        <ExportButton />
      </div>

      {/* sources */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-4 py-2.5">
        <FileText className="size-3.5 text-ink-3" strokeWidth={1.9} />
        {estimate.sources.map((s) => (
          <span key={s.ref} className="inline-flex h-5.5 items-center gap-1 rounded-[5px] bg-inset px-1.5 font-mono text-[10.5px] text-ink-2 shadow-hairline">
            {s.ref}
          </span>
        ))}
      </div>
    </div>
  )
}
