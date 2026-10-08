'use client'

import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/portia/cn'

/* ─────────────────────────────────────────────────────────
 * BUTTON
 * ReUI's variant vocabulary (primary · secondary · outline ·
 * ghost · destructive · link) dressed in Beautiful UI's
 * tokens: pill-ish radii, solid hairlines, inset highlight
 * on filled variants and a 0.96 press. Leading / trailing
 * icons, a loading state that swaps the icon for a spinner
 * without changing width, and an optional shortcut hint.
 * ───────────────────────────────────────────────────────── */

const filled = 'shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(0_0_0/0.12)]'

const VARIANTS = {
  primary: `bg-ink text-canvas hover:bg-ink/88 ${filled}`,
  accent: `bg-accent text-white hover:bg-accent-ink dark:hover:bg-accent/85 ${filled}`,
  secondary: 'bg-surface text-ink shadow-btn hover:bg-inset aria-expanded:bg-hover',
  outline: 'bg-transparent text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-hover',
  ghost: 'bg-transparent text-ink-2 hover:bg-hover-2 hover:text-ink aria-expanded:bg-hover-2 aria-expanded:text-ink',
  soft: 'bg-hover-2 text-ink hover:bg-line-strong',
  destructive: `bg-red text-white hover:brightness-95 ${filled}`,
  link: 'h-auto! px-0! text-ink-2 underline-offset-4 decoration-line-strong hover:text-ink hover:underline',
} as const

const SIZES = {
  xs: 'h-6 rounded-[7px] px-2 text-[12px] gap-1 [&_svg]:size-3.5',
  sm: 'h-7 rounded-control px-2.5 text-[12.5px] gap-1.5 [&_svg]:size-3.5',
  md: 'h-8 rounded-[9px] px-3 text-[13px] gap-1.5 [&_svg]:size-4',
  lg: 'h-10 rounded-[11px] px-4 text-[14px] gap-2 [&_svg]:size-4',
  'icon-xs': 'size-6 rounded-[7px] [&_svg]:size-3.5',
  'icon-sm': 'size-7 rounded-control [&_svg]:size-4',
  icon: 'size-8 rounded-[9px] [&_svg]:size-4',
  'icon-lg': 'size-10 rounded-[11px] [&_svg]:size-[18px]',
} as const

export type ButtonVariant = keyof typeof VARIANTS
export type ButtonSize = keyof typeof SIZES

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  leading?: ReactNode
  trailing?: ReactNode
  loading?: boolean
  kbd?: string[]
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-3.5 shrink-0 rounded-full border-[1.5px] border-current/25 border-t-current', className)}
      style={{ animation: 'spin 650ms linear infinite' }}
    />
  )
}

export function Kbd({ keys, className }: { keys: string[]; className?: string }) {
  return (
    <span className={cn('ml-0.5 inline-flex items-center gap-0.5', className)}>
      {keys.map((k) => (
        <kbd
          key={k}
          className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] px-1 font-sans text-[10.5px]
            font-medium leading-none opacity-60"
          style={{ boxShadow: 'inset 0 0 0 1px color-mix(in oklch, currentColor 30%, transparent)' }}
        >
          {k}
        </kbd>
      ))}
    </span>
  )
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', leading, trailing, loading, kbd, className, children, disabled, ...props },
  ref,
) {
  const lead = loading ? <Spinner /> : leading
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium',
        'transition-[transform,background-color,color,box-shadow,opacity,filter] duration-150 ease-out',
        'active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {lead}
      {children}
      {trailing}
      {kbd && <Kbd keys={kbd} />}
    </button>
  )
})

/* ── Icon swap (transitions.dev) ─────────────────────── */

export function IconSwap({ on, a, b, className }: { on: boolean; a: ReactNode; b: ReactNode; className?: string }) {
  return (
    <span className={cn('t-icon-swap', className)}>
      <span className="t-icon" data-on={!on}>{a}</span>
      <span className="t-icon" data-on={on}>{b}</span>
    </span>
  )
}

/* ── Copy button with feedback (ReUI) ────────────────── */

export function useCopy(timeout = 1600) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {})
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), timeout)
  }
  return { copied, copy }
}

export function CopyButton({
  text,
  label,
  size = 'icon-sm',
  variant = 'ghost',
  className,
  onCopied,
}: {
  text: string | (() => string)
  label?: string
  size?: ButtonSize
  variant?: ButtonVariant
  className?: string
  onCopied?: () => void
}) {
  const { copied, copy } = useCopy()
  return (
    <Tooltip label={copied ? 'Copied' : label ?? 'Copy'}>
      <Button
        variant={variant}
        size={size}
        aria-label={label ?? 'Copy'}
        className={className}
        onClick={() => {
          copy(typeof text === 'function' ? text() : text)
          onCopied?.()
        }}
      >
        <IconSwap
          on={copied}
          a={<Copy strokeWidth={1.8} />}
          b={<Check strokeWidth={2.4} className="text-green" />}
        />
        {label && size !== 'icon-sm' && size !== 'icon' && size !== 'icon-xs' && (
          <span>{copied ? 'Copied' : label}</span>
        )}
      </Button>
    </Tooltip>
  )
}

/* ── Tooltip (transitions.dev timing: delayed in, instant out) ── */

export function Tooltip({
  label,
  children,
  side = 'top',
  align = 'center',
  kbd,
  className,
}: {
  label: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom' | 'right'
  align?: 'start' | 'center' | 'end'
  kbd?: string[]
  className?: string
}) {
  const x = align === 'end' ? 'right-0' : align === 'start' ? 'left-0' : 'left-1/2 -translate-x-1/2'
  const pos =
    side === 'top'
      ? `bottom-[calc(100%+6px)] origin-bottom ${x}`
      : side === 'bottom'
        ? `top-[calc(100%+6px)] origin-top ${x}`
        : 'left-[calc(100%+8px)] top-1/2 -translate-y-1/2 origin-left'
  return (
    <span className={cn('t-tt-host relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          't-tt absolute z-50 inline-flex items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2 py-1',
          'text-[11.5px] font-medium shadow-overlay',
          pos,
        )}
        style={{ background: 'var(--tooltip-bg)', color: 'var(--tooltip-fg)' }}
      >
        {label}
        {kbd && <Kbd keys={kbd} className="opacity-90" />}
      </span>
    </span>
  )
}
