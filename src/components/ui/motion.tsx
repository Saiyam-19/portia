'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/portia/cn'

/* Shimmering label — the agent is working. */
export function Shimmer({ children, className, speed = 1.4 }: { children: ReactNode; className?: string; speed?: number }) {
  return (
    <span
      className={cn('inline-block bg-clip-text text-transparent', className)}
      style={{
        backgroundImage: 'linear-gradient(90deg, var(--ink-3) 35%, var(--ink) 50%, var(--ink-3) 65%)',
        backgroundSize: '200% 100%',
        animation: `shimmer-text ${speed}s linear infinite`,
      }}
    >
      {children}
    </span>
  )
}

/* Pixel-grid loader (Beautiful UI "Drive") — a chevron wavefront. */
const CHEVRON = Array.from({ length: 9 }, (_, i) => {
  const r = Math.floor(i / 3)
  const c = i % 3
  return (c + Math.abs(r - 1)) * 90
})

export function PixelLoader({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('grid shrink-0 grid-cols-[repeat(3,4px)] gap-[1.5px]', className)}>
      {CHEVRON.map((delay, i) => (
        <span
          key={i}
          className="size-[4px] rounded-[1px] bg-ink"
          style={{ opacity: 0.15, animation: `pixel-on 650ms ease-in-out ${delay}ms infinite` }}
        />
      ))}
    </span>
  )
}

/* Live elapsed counter in mono tabular figures. */
export function Elapsed({ since, until, className }: { since: number; until?: number; className?: string }) {
  const [now, setNow] = useState(since)
  useEffect(() => {
    if (until) return
    const t = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(t)
  }, [until])
  const s = Math.max(0, ((until ?? now) - since) / 1000)
  return (
    <span className={cn('font-mono text-[11.5px] tabular-nums text-ink-3', className)}>
      {s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`}
    </span>
  )
}

export function formatDuration(ms: number) {
  const s = ms / 1000
  if (s < 1) return 'under a second'
  if (s < 60) return `${Math.round(s)} second${Math.round(s) === 1 ? '' : 's'}`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

/* Text states swap (transitions.dev): exit up with blur, enter from below. */
export function TextSwap({ text, className }: { text: string; className?: string }) {
  const [shown, setShown] = useState(text)
  const [target, setTarget] = useState(text)
  const [phase, setPhase] = useState<'idle' | 'exit' | 'enter'>('idle')

  if (target !== text) {
    setTarget(text)
    setPhase('exit')
  }

  useEffect(() => {
    if (phase !== 'exit') return
    const t = setTimeout(() => {
      setShown(target)
      setPhase('enter')
    }, 160)
    return () => clearTimeout(t)
  }, [phase, target])

  useLayoutEffect(() => {
    if (phase !== 'enter') return
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setPhase('idle')))
    return () => cancelAnimationFrame(raf)
  }, [phase])

  return (
    <span
      className={cn(
        't-text-swap',
        phase === 'exit' && 'is-exit',
        phase === 'enter' && 'is-enter-start',
        className,
      )}
    >
      {shown}
    </span>
  )
}

/* Count-up for totals — eases toward the target once visible. */
export function CountUp({ value, format, duration = 900 }: { value: number; format: (n: number) => string; duration?: number }) {
  const [n, setN] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 4)
      setN(a + (value - a) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <span className="tabular-nums">{format(n)}</span>
}

/* Success check (transitions.dev) — rotate + blur + bob, then draw. */
export function SuccessCheck({ className }: { className?: string }) {
  return (
    <span className={cn('t-success-check', className)}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </span>
  )
}

/* Grid-rows collapse — animates height to/from auto. */
export function Collapse({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <div
      className="grid transition-[grid-template-rows,opacity] duration-300"
      style={{
        gridTemplateRows: open ? '1fr' : '0fr',
        opacity: open ? 1 : 0,
        transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
      }}
      aria-hidden={!open}
      inert={!open}
    >
      <div className={cn('min-h-0 overflow-hidden', className)}>{children}</div>
    </div>
  )
}
