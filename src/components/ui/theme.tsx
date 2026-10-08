'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/portia/cn'

export type ThemePref = 'light' | 'dark' | 'system'

const KEY = 'plisto-theme'
const listeners = new Set<() => void>()

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

function apply(pref: ThemePref) {
  const root = document.documentElement
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  /* freeze transitions for one paint so the flip is a single clean repaint */
  root.classList.add('theme-switching')
  root.classList.toggle('dark', dark)
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')))
}

export function useTheme() {
  const pref = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    read,
    () => 'system' as ThemePref,
  )

  useEffect(() => {
    if (pref !== 'system') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => apply('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [pref])

  const setPref = useCallback((next: ThemePref) => {
    try {
      localStorage.setItem(KEY, next)
    } catch {}
    apply(next)
    listeners.forEach((l) => l())
  }, [])

  return { pref, setPref }
}

const OPTIONS: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

/* Segmented theme switch with a sliding pill (transitions.dev "tabs sliding"). */
export function ThemeSwitch({ className }: { className?: string }) {
  const { pref, setPref } = useTheme()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null)
  const [animate, setAnimate] = useState(false)

  useLayoutEffect(() => {
    const i = OPTIONS.findIndex((o) => o.value === pref)
    const el = refs.current[i]
    if (!el) return
    setPill({ x: el.offsetLeft, w: el.offsetWidth })
  }, [pref])

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn('relative inline-flex items-center gap-0.5 rounded-full bg-hover-2/70 p-0.5', className)}
    >
      <span
        aria-hidden
        className="absolute top-0.5 left-0 h-6 rounded-full bg-surface shadow-btn"
        style={{
          width: pill?.w ?? 0,
          transform: `translateX(${pill?.x ?? 0}px)`,
          opacity: pill ? 1 : 0,
          transition: animate
            ? 'transform 250ms cubic-bezier(0.22,1,0.36,1), width 250ms cubic-bezier(0.22,1,0.36,1)'
            : 'none',
        }}
      />
      {OPTIONS.map((o, i) => {
        const Icon = o.icon
        const on = pref === o.value
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.label}
            title={o.label}
            onClick={() => {
              setAnimate(true)
              setPref(o.value)
            }}
            className={cn(
              'relative z-10 flex h-6 w-7 items-center justify-center rounded-full transition-colors duration-200',
              on ? 'text-ink' : 'text-ink-3 hover:text-ink-2',
            )}
          >
            <Icon className="size-3.5" strokeWidth={2} />
          </button>
        )
      })}
    </div>
  )
}
