'use client'

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { cn } from '@/lib/portia/cn'

/* ─────────────────────────────────────────────────────────
 * POPOVER — transitions.dev "menu dropdown" recipe.
 * Opens on a 250ms ease from 0.97 at its anchor origin,
 * closes faster (150ms) and stays mounted until the close
 * finishes so the exit is actually seen.
 * ───────────────────────────────────────────────────────── */

type Origin = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center'

export function usePresence(open: boolean, exitMs = 150) {
  const [mounted, setMounted] = useState(open)
  const [phase, setPhase] = useState<'open' | 'closing' | 'idle'>(open ? 'open' : 'idle')

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    let raf = 0
    if (open) {
      t = setTimeout(() => {
        setMounted(true)
        setPhase('idle')
        /* two frames: mount at the pre-state, then transition in */
        raf = requestAnimationFrame(() => {
          raf = requestAnimationFrame(() => setPhase('open'))
        })
      }, 0)
    } else {
      t = setTimeout(() => setPhase((p) => (p === 'idle' ? p : 'closing')), 0)
      const done = setTimeout(() => {
        setMounted(false)
        setPhase('idle')
      }, exitMs)
      return () => {
        clearTimeout(t)
        clearTimeout(done)
      }
    }
    return () => {
      clearTimeout(t)
      cancelAnimationFrame(raf)
    }
  }, [open, exitMs])

  return { mounted, className: phase === 'open' ? 'is-open' : phase === 'closing' ? 'is-closing' : '' }
}

export function useDismiss(open: boolean, onClose: () => void, refs: RefObject<HTMLElement | null>[]) {
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (refs.some((r) => r.current?.contains(e.target as Node))) return
      close.current()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}

const ORIGIN: Record<Origin, string> = {
  'top-left': 'origin-top-left',
  'top-right': 'origin-top-right',
  'top-center': 'origin-top',
  'bottom-left': 'origin-bottom-left',
  'bottom-right': 'origin-bottom-right',
  'bottom-center': 'origin-bottom',
}

export function Popover({
  open,
  origin = 'top-left',
  className,
  children,
  panelRef,
}: {
  open: boolean
  origin?: Origin
  className?: string
  children: ReactNode
  panelRef?: RefObject<HTMLDivElement | null>
}) {
  const { mounted, className: state } = usePresence(open)
  if (!mounted) return null
  return (
    <div
      ref={panelRef}
      className={cn(
        't-dropdown absolute z-40 rounded-[12px] bg-surface p-1 shadow-overlay',
        ORIGIN[origin],
        state,
        className,
      )}
    >
      {children}
    </div>
  )
}

/* ── Glide menu (Beautiful UI) ──────────────────────────
 * One highlight layer that glides between rows on hover or
 * keyboard focus, instead of every row painting its own.  */

export function GlideMenu({
  children,
  className,
  activeIndex,
  highlightClassName = 'inset-x-0 rounded-[8px] bg-hover-2',
}: {
  children: ReactNode
  className?: string
  /** drive the highlight from keyboard state instead of the pointer */
  activeIndex?: number
  highlightClassName?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ top: number; height: number } | null>(null)
  const [visible, setVisible] = useState(false)

  const moveToRow = (row: Element | null | undefined) => {
    const container = ref.current
    if (!(row instanceof HTMLElement) || !container) return
    const c = container.getBoundingClientRect()
    const r = row.getBoundingClientRect()
    setBox({ top: r.top - c.top + container.scrollTop, height: r.height })
    setVisible(true)
  }

  useEffect(() => {
    if (activeIndex === undefined || activeIndex < 0) return
    const rows = ref.current?.querySelectorAll('[data-menu-row]')
    const row = rows?.[activeIndex]
    const raf = requestAnimationFrame(() => {
      moveToRow(row)
      if (row instanceof HTMLElement) row.scrollIntoView({ block: 'nearest' })
    })
    return () => cancelAnimationFrame(raf)
  }, [activeIndex])

  return (
    <div
      ref={ref}
      onMouseOver={(e) => moveToRow((e.target as Element).closest('[data-menu-row]'))}
      onMouseLeave={() => activeIndex === undefined && setVisible(false)}
      onFocusCapture={(e) => moveToRow((e.target as Element).closest('[data-menu-row]'))}
      className={cn('relative', className)}
    >
      <span
        aria-hidden
        className={cn('pointer-events-none absolute', highlightClassName)}
        style={{
          top: box?.top ?? 0,
          height: box?.height ?? 0,
          opacity: box && visible ? 1 : 0,
          transition:
            'top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease',
        }}
      />
      {children}
    </div>
  )
}

export function MenuItem({
  icon,
  children,
  hint,
  danger,
  selected,
  onSelect,
}: {
  icon?: ReactNode
  children: ReactNode
  hint?: ReactNode
  danger?: boolean
  selected?: boolean
  onSelect?: () => void
}) {
  return (
    <button
      type="button"
      data-menu-row
      onClick={onSelect}
      className={cn(
        'relative z-10 flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left text-[13px]',
        'transition-colors duration-100 [&_svg]:size-4 [&_svg]:shrink-0',
        danger ? 'text-red' : 'text-ink',
      )}
    >
      {icon && <span className={cn('flex', danger ? 'text-red' : 'text-ink-2')}>{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="text-[11.5px] text-ink-3">{hint}</span>}
      {selected !== undefined && (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-ink transition-[opacity,transform] duration-200"
          style={{ opacity: selected ? 1 : 0, transform: selected ? 'scale(1)' : 'scale(0.5)' }}
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </button>
  )
}
