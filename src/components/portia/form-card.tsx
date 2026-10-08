'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, CornerDownLeft, X } from 'lucide-react'
import type { FormResponse, Segment } from '@/lib/portia/types'
import { cn } from '@/lib/portia/cn'
import { Button } from '@/components/ui/button'
import { GlideMenu } from '@/components/ui/popover'
import { SuccessCheck } from '@/components/ui/motion'

type Form = Extract<Segment, { kind: 'form' }>

const SLIDE = '360ms cubic-bezier(0.22, 1, 0.36, 1)'

/* Odometer digits — each changed character rolls up or down. */
function RollingDigits({ value }: { value: string }) {
  const [state, setState] = useState({ from: value, to: value, dir: 'up' as 'up' | 'down', shifted: true })

  /* derive the roll during render, then release it on the next frames */
  if (state.to !== value) {
    const dir = parseInt(value, 10) < parseInt(state.to, 10) ? 'down' : 'up'
    setState({ from: state.to, to: value, dir, shifted: false })
  }

  useEffect(() => {
    if (state.shifted) return
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setState((s) => ({ ...s, shifted: true })))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [state.shifted, state.to])

  const { from, to, dir, shifted } = state
  return (
    <>
      {Array.from(to).map((n, i) => {
        const o = from[i] ?? ''
        if (o === n) return <span key={`${i}-${n}`}>{n}</span>
        const [top, bottom] = dir === 'down' ? [n, o] : [o, n]
        const y = dir === 'down' ? (shifted ? '0' : '-1em') : shifted ? '-1em' : '0'
        return (
          <span key={`${i}-${o}-${n}`} className="relative inline-block h-[1em] overflow-hidden leading-[1em]" style={{ verticalAlign: '-0.05em' }}>
            <span
              className="flex flex-col"
              style={{ transform: `translateY(${y})`, transition: shifted ? 'transform 350ms cubic-bezier(0.4,0,0.2,1)' : 'none' }}
            >
              <span className="h-[1em]">{top}</span>
              <span className="h-[1em]">{bottom}</span>
            </span>
          </span>
        )
      })}
    </>
  )
}

function Summary({ form, response }: { form: Form; response: FormResponse }) {
  const answers = form.fields
    .map((f) => {
      const v = response.values[f.name]
      return v ? `${v}${f.unit ? ` ${f.unit}` : ''}` : null
    })
    .filter(Boolean) as string[]
  return (
    <div className="flex flex-wrap items-center gap-1.5" style={{ animation: 'pop-in 260ms cubic-bezier(0.23,1,0.32,1) both' }}>
      {response.cancelled ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-hover-2 py-1 pr-2.5 pl-1.5 text-[12px] font-medium text-ink-2">
          <X className="size-3.5" strokeWidth={2.4} />
          Skipped {form.title.toLowerCase()}
        </span>
      ) : (
        <>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-tint py-1 pr-2.5 pl-1 text-[12px] font-medium text-green">
            <span className="flex size-4.5 items-center justify-center rounded-full bg-green text-white">
              <SuccessCheck />
            </span>
            Shared {form.title.toLowerCase()}
          </span>
          {answers.map((a, i) => (
            <span
              key={a}
              className="inline-flex h-6 items-center rounded-full bg-surface px-2.5 text-[12px] text-ink-2 shadow-btn"
              style={{ animation: `pop-in 240ms cubic-bezier(0.23,1,0.32,1) ${80 + i * 60}ms both` }}
            >
              {a}
            </span>
          ))}
        </>
      )}
    </div>
  )
}

export function FormCard({
  form,
  live,
  onSubmit,
}: {
  form: Form
  /** the turn is still waiting on this card */
  live: boolean
  onSubmit: (response: FormResponse) => void
}) {
  const fields = form.fields
  const [qi, setQi] = useState(0)
  const [values, setValues] = useState<Record<string, string>>({})
  const [shake, setShake] = useState(0)
  const refs = useRef<(HTMLDivElement | null)[]>([])
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [box, setBox] = useState<{ h?: number; y: number; animate: boolean }>({ y: 0, animate: false })
  const measured = useRef(false)

  const field = fields[qi]
  const last = qi === fields.length - 1
  const value = values[field?.name] ?? ''
  const hasAnswer = value.trim().length > 0

  useLayoutEffect(() => {
    const el = refs.current[qi]
    if (!el) return
    setBox({ h: el.offsetHeight, y: el.offsetTop, animate: measured.current })
    measured.current = true
  }, [qi, values])

  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current) }, [])

  useEffect(() => {
    if (!live) return
    const input = inputRefs.current[qi]
    if (!input) return
    const t = setTimeout(() => input.focus({ preventScroll: true }), 380)
    return () => clearTimeout(t)
  }, [qi, live])

  /* number keys pick radio options, like the approval card's ⏎ affordance */
  const cardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!live || form.response || field?.type !== 'radio') return
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      const n = Number(e.key)
      if (!n) return
      const rows = cardRef.current?.querySelectorAll<HTMLButtonElement>('[data-active-field] [data-menu-row]')
      rows?.[n - 1]?.click()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [live, form.response, field])

  if (form.response) return <Summary form={form} response={form.response} />

  if (!live) {
    return (
      <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-hover-2 px-2.5 py-1 text-[12px] text-ink-3">
        Input request expired when the response was stopped
      </div>
    )
  }

  const submit = (cancelled = false) => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    onSubmit({ values, cancelled })
  }

  const go = (next: number) => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    setQi(Math.max(0, Math.min(fields.length - 1, next)))
  }

  const advance = () => {
    if (field.required && !hasAnswer) {
      setShake((n) => n + 1)
      return
    }
    if (last) submit()
    else go(qi + 1)
  }

  const pick = (option: string) => {
    setValues((v) => ({ ...v, [field.name]: option }))
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    advanceTimer.current = setTimeout(() => {
      if (last) onSubmit({ values: { ...values, [field.name]: option }, cancelled: false })
      else setQi((q) => Math.min(fields.length - 1, q + 1))
    }, 420)
  }

  return (
    <div
      ref={cardRef}
      className="w-full max-w-[420px] overflow-hidden rounded-card bg-surface shadow-card"
      style={{ animation: 'fade-up 380ms cubic-bezier(0.23,1,0.32,1) both' }}
    >
      <div className="flex items-start gap-3 border-b border-line px-3.5 pt-3 pb-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-orange">
            <span className="size-1.5 rounded-full bg-orange" style={{ animation: 'pulse-dot 1.4s ease-in-out infinite' }} />
            Needs your input
          </div>
          <div className="mt-0.5 truncate text-[12px] text-ink-3">{form.description ?? form.title}</div>
        </div>
        <Button variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={() => submit(true)} className="-mt-0.5 -mr-1.5">
          <X strokeWidth={2.2} />
        </Button>
      </div>

      <div className="px-3.5 pt-3 pb-1">
        <div
          /* clip, not hidden: focus must never scroll this box — the track owns position */
          className="-mx-1 overflow-clip px-1"
          style={{ height: box.h, transition: box.animate ? `height ${SLIDE}` : undefined }}
          aria-live="polite"
        >
          <div
            className="relative flex flex-col gap-7"
            style={{
              transform: `translate3d(0, ${-box.y}px, 0)`,
              transition: box.animate ? `transform ${SLIDE}` : undefined,
            }}
          >
            {fields.map((f, idx) => {
              const active = idx === qi
              const v = values[f.name] ?? ''
              return (
                <div
                  key={f.name}
                  ref={(el) => {
                    refs.current[idx] = el
                  }}
                  aria-hidden={!active}
                  inert={!active}
                  data-active-field={active || undefined}
                  style={{ opacity: active ? 1 : 0, transition: `opacity ${SLIDE}` }}
                >
                  <div key={active ? shake : 0} className={cn('text-[14px] font-medium text-ink', active && shake > 0 && 't-shake')}>
                    {f.label}
                  </div>
                  {f.type === 'radio' ? (
                    <GlideMenu className="mt-2 flex flex-col gap-0.5" highlightClassName="inset-x-0 rounded-control bg-hover">
                      {f.options?.map((option, i) => {
                        const on = v === option
                        return (
                          <button
                            key={option}
                            type="button"
                            data-menu-row
                            aria-pressed={on}
                            onClick={() => pick(option)}
                            className="relative z-10 flex items-center gap-2 rounded-control py-1.5 pr-2 pl-1.5 text-left"
                          >
                            <span
                              className={cn(
                                'flex size-4 shrink-0 items-center justify-center rounded-full transition-colors duration-200',
                                on ? 'bg-ink' : 'shadow-[inset_0_0_0_1.5px_var(--line-strong)]',
                              )}
                            >
                              <span
                                className="size-1.5 rounded-full bg-canvas transition-transform duration-200"
                                style={{ transform: on ? 'scale(1)' : 'scale(0)' }}
                              />
                            </span>
                            <span className={cn('flex-1 text-[13px] transition-colors duration-200', on ? 'text-ink' : 'text-ink-2')}>
                              {option}
                            </span>
                            <span className="font-mono text-[10.5px] text-ink-3">{i + 1}</span>
                          </button>
                        )
                      })}
                    </GlideMenu>
                  ) : (
                    <div className="mt-2.5">
                      <label
                        className={cn(
                          'flex h-10 items-center gap-2 rounded-[10px] bg-field px-3 shadow-[inset_0_0_0_1px_var(--line)]',
                          'transition-shadow duration-150 focus-within:shadow-[inset_0_0_0_1px_var(--line-strong),0_0_0_3px_color-mix(in_oklch,var(--accent)_12%,transparent)]',
                        )}
                      >
                        <input
                          ref={(el) => {
                            inputRefs.current[idx] = el
                          }}
                          inputMode={f.type === 'number' ? 'decimal' : undefined}
                          value={v}
                          placeholder={f.placeholder}
                          onChange={(e) => {
                            const next = f.type === 'number' ? e.target.value.replace(/[^\d.]/g, '') : e.target.value
                            setValues((vals) => ({ ...vals, [f.name]: next }))
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              advance()
                            }
                          }}
                          className="min-w-0 flex-1 bg-transparent text-[14px] tabular-nums text-ink outline-none placeholder:text-ink-3"
                        />
                        {f.unit && <span className="text-[12.5px] text-ink-3">{f.unit}</span>}
                      </label>
                      {f.hint && <p className="mt-1.5 text-[11.5px] text-ink-3">{f.hint}</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 p-2.5 pl-3">
        <div className="flex items-center gap-0.5 text-ink-3">
          <button
            type="button"
            aria-label="Previous question"
            disabled={qi === 0}
            onClick={() => go(qi - 1)}
            className="flex size-5 items-center justify-center rounded-[5px] transition-colors enabled:hover:text-ink disabled:opacity-30"
          >
            <ChevronUp className="size-3.5" strokeWidth={2.2} />
          </button>
          <span className="inline-flex items-center text-[12px] font-medium tabular-nums leading-none">
            <RollingDigits value={`${qi + 1} / ${fields.length}`} />
          </span>
          <button
            type="button"
            aria-label="Next question"
            disabled={last}
            onClick={() => go(qi + 1)}
            className="flex size-5 items-center justify-center rounded-[5px] transition-colors enabled:hover:text-ink disabled:opacity-30"
          >
            <ChevronDown className="size-3.5" strokeWidth={2.2} />
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="soft" size="sm" className="rounded-full" onClick={() => (last ? submit() : go(qi + 1))}>
            Skip
          </Button>
          <Button
            variant="accent"
            size="sm"
            className="rounded-full pr-2"
            disabled={!hasAnswer}
            onClick={advance}
            trailing={<CornerDownLeft className="opacity-70" strokeWidth={2.2} />}
          >
            {last ? 'Send' : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  )
}
