'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { BookOpen, ChevronsUpDown, LifeBuoy, LogOut, Monitor, Moon, ScrollText, Settings, Sun } from 'lucide-react'
import { cn } from '@/lib/portia/cn'
import { Tooltip } from '@/components/ui/button'
import { GlideMenu, Popover, useDismiss } from '@/components/ui/popover'
import { useTheme, type ThemePref } from '@/components/ui/theme'
import { useToast } from '@/components/ui/toast'

const THEMES: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

/* Compact segmented theme switch — the pill slides between options
 * (transitions.dev "tabs sliding"). */
function ThemeToggle() {
  const { pref, setPref } = useTheme()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null)
  const [animate, setAnimate] = useState(false)

  useLayoutEffect(() => {
    const el = refs.current[THEMES.findIndex((t) => t.value === pref)]
    if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth })
  }, [pref])

  return (
    <div role="radiogroup" aria-label="Theme" className="relative flex items-center rounded-full p-0.5 shadow-[inset_0_0_0_1px_var(--line-strong)]">
      <span
        aria-hidden
        className="absolute top-0.5 left-0 h-6 rounded-full bg-hover-2 shadow-[inset_0_0_0_1px_var(--line-strong)]"
        style={{
          width: pill?.w ?? 0,
          transform: `translateX(${pill?.x ?? 0}px)`,
          opacity: pill ? 1 : 0,
          transition: animate ? 'transform 250ms cubic-bezier(0.22,1,0.36,1), width 250ms cubic-bezier(0.22,1,0.36,1)' : 'none',
        }}
      />
      {THEMES.map((t, i) => {
        const on = pref === t.value
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={t.label}
            title={t.label}
            onClick={(e) => {
              e.stopPropagation()
              setAnimate(true)
              setPref(t.value)
            }}
            className={cn(
              'relative z-10 flex size-6 items-center justify-center rounded-full transition-colors duration-200',
              on ? 'text-ink' : 'text-ink-3 hover:text-ink-2',
            )}
          >
            <t.icon className="size-3.5" strokeWidth={2} />
          </button>
        )
      })}
    </div>
  )
}

function Row({
  label,
  icon: Icon,
  onSelect,
  danger,
  children,
}: {
  label: string
  icon?: typeof Sun
  onSelect?: () => void
  danger?: boolean
  children?: React.ReactNode
}) {
  const content = (
    <>
      <span className="flex-1 truncate">{label}</span>
      {children ?? (Icon && <Icon className={cn('size-4 shrink-0', danger ? 'text-red' : 'text-ink-3')} strokeWidth={1.8} />)}
    </>
  )
  const cls = cn(
    'relative z-10 flex h-9 w-full items-center gap-3 rounded-[8px] px-2.5 text-left text-[13.5px] transition-colors duration-100',
    danger ? 'text-red' : 'text-ink',
  )
  /* the theme row hosts its own controls, so it isn't a button itself */
  return children ? (
    <div data-menu-row className={cls}>
      {content}
    </div>
  ) : (
    <button type="button" data-menu-row onClick={onSelect} className={cls}>
      {content}
    </button>
  )
}

export function AccountMenu() {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)
  const toast = useToast()
  useDismiss(open, () => setOpen(false), [anchor])

  const soon = (what: string) => () => {
    setOpen(false)
    toast(`${what} arrives with the backend`)
  }

  return (
    <div ref={anchor} className="relative">
      <Popover open={open} origin="bottom-left" className="right-0 bottom-[calc(100%+6px)] left-0 p-0">
        <div className="flex items-start gap-2 px-3.5 pt-3 pb-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold text-ink">Acme Ops</div>
            <div className="truncate text-[12px] text-ink-3">ops@acme.com</div>
          </div>
          <Tooltip label="Settings" align="end">
            <button
              type="button"
              aria-label="Settings"
              onClick={soon('Account settings')}
              className="-mt-0.5 -mr-1 flex size-7 items-center justify-center rounded-[7px] text-ink-3 transition-colors duration-150 hover:bg-hover-2 hover:text-ink"
            >
              <Settings className="size-4" strokeWidth={1.8} />
            </button>
          </Tooltip>
        </div>
        <div className="h-px bg-line" />
        <GlideMenu className="flex flex-col p-1.5">
          <Row label="Theme">
            <ThemeToggle />
          </Row>
          <Row label="Changelog" icon={ScrollText} onSelect={soon('Changelog')} />
          <Row label="Help" icon={LifeBuoy} onSelect={soon('Help')} />
          <Row label="Tariff docs" icon={BookOpen} onSelect={soon('Tariff docs')} />
          <Row label="Log out" icon={LogOut} onSelect={soon('Sign-out')} />
        </GlideMenu>
      </Popover>

      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen(!open)}
        className="group flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left transition-colors duration-150 hover:bg-hover-2/70 aria-expanded:bg-hover-2/70"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-[oklch(0.62_0.17_200)] text-[11.5px] font-semibold text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)]">
          AO
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink">Acme Ops</span>
          <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">Demo workspace</span>
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-ink-3 transition-colors duration-150 group-hover:text-ink-2" strokeWidth={2} />
      </button>
    </div>
  )
}
