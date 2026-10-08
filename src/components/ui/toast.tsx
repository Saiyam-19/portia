'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/portia/cn'

/* Toast stack — transitions.dev "toast open/close": rises with a
 * cross-blur, opens on the slower clock and closes on the faster. */

type Tone = 'neutral' | 'success' | 'error'
type ToastItem = { id: number; title: string; tone: Tone; open: boolean }

const ToastContext = createContext<(title: string, tone?: Tone) => void>(() => {})

export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const next = useRef(0)
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  useEffect(() => {
    const all = timers.current
    return () => all.forEach(clearTimeout)
  }, [])

  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t)
      fn()
    }, ms)
    timers.current.add(t)
  }

  const push = useCallback((title: string, tone: Tone = 'neutral') => {
    const id = ++next.current
    setItems((list) => [...list.slice(-2), { id, title, tone, open: false }])
    later(() => setItems((list) => list.map((t) => (t.id === id ? { ...t, open: true } : t))), 20)
    later(() => setItems((list) => list.map((t) => (t.id === id ? { ...t, open: false } : t))), 2600)
    later(() => setItems((list) => list.filter((t) => t.id !== id)), 2900)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              't-toast flex items-center gap-2 rounded-full py-1.5 pr-3.5 pl-2 text-[12.5px] font-medium shadow-overlay',
              t.open && 'is-open',
            )}
            style={{ background: 'var(--tooltip-bg)', color: 'var(--tooltip-fg)' }}
          >
            <span
              className={cn(
                'flex size-4.5 items-center justify-center rounded-full',
                t.tone === 'success' ? 'bg-green' : t.tone === 'error' ? 'bg-red' : 'bg-white/15',
              )}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                {t.tone === 'error' ? <path d="M12 7v6M12 17h.01" /> : <path d="M20 6L9 17l-5-5" />}
              </svg>
            </span>
            {t.title}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
