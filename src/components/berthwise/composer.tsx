'use client'

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { Anchor, ArrowUp, AtSign, Calculator, ChevronDown, List, Scale, Ship, Sparkles, Square, Zap } from 'lucide-react'
import type { ChatModel } from '@/lib/chat-model'
import { PORTS } from '@/lib/berthwise/ports'
import { cn } from '@/lib/utils'
import { tokenize } from '@/lib/berthwise/mentions'
import { Button, IconSwap, Kbd, Tooltip } from '@/components/berthwise/ui/button'
import { GlideMenu, MenuItem, Popover, useDismiss } from '@/components/berthwise/ui/popover'

const COMMANDS = [
  { cmd: '/estimate', desc: 'Estimate charges for a vessel call', icon: Calculator, fill: 'Charges for IMO 9321483 at Mumbai' },
  { cmd: '/compare', desc: 'Compare two ports line by line', icon: Scale, fill: 'Compare Mumbai vs Jaigarh pilotage' },
  { cmd: '/ports', desc: 'List supported ports & terminals', icon: List, fill: 'Which ports are supported?' },
  { cmd: '/vessel', desc: 'Look up a vessel by IMO or name', icon: Ship, fill: 'Look up vessel IMO ' },
]

export const MODELS: { id: ChatModel; name: string; icon: typeof Zap }[] = [
  { id: 'model-1', name: 'Model 1', icon: Zap },
  { id: 'model-2', name: 'Model 2', icon: Sparkles },
]

type Menu =
  | { kind: 'command'; items: typeof COMMANDS }
  | { kind: 'mention'; items: typeof PORTS; query: string }
  | null

function detectMenu(value: string, caret: number): Menu {
  const before = value.slice(0, caret)
  if (/^\/\w*$/.test(before)) {
    const q = before.slice(1).toLowerCase()
    const items = COMMANDS.filter((c) => c.cmd.slice(1).startsWith(q))
    return items.length ? { kind: 'command', items } : null
  }
  const m = before.match(/(?:^|\s)@([\w-]*)$/)
  if (m) {
    const q = m[1].toLowerCase()
    const items = PORTS.filter((p) => p.name.toLowerCase().includes(q) || p.slug.includes(q)).slice(0, 7)
    return items.length ? { kind: 'mention', items, query: m[1] } : null
  }
  return null
}

function ModelPicker({ model, onChange, disabled }: { model: ChatModel; onChange: (m: ChatModel) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)
  useDismiss(open, () => setOpen(false), [anchor])
  const current = MODELS.find((m) => m.id === model)!
  return (
    <div ref={anchor} className="relative">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="gap-1 px-2 text-ink-2"
        trailing={
          <ChevronDown
            className="size-3! text-ink-3 transition-transform duration-200"
            strokeWidth={2.4}
            style={{ transform: open ? 'rotate(180deg)' : undefined }}
          />
        }
      >
        <current.icon className="size-3.5! text-ink-3" strokeWidth={2} />
        {current.name}
      </Button>
      <Popover open={open} origin="bottom-left" className="bottom-[calc(100%+8px)] left-0 w-44">
        <div className="px-2 pt-1.5 pb-1 text-[11.5px] font-medium text-ink-3">Model</div>
        <GlideMenu>
          {MODELS.map((m) => (
            <MenuItem
              key={m.id}
              icon={<m.icon strokeWidth={1.9} />}
              selected={m.id === model}
              onSelect={() => {
                onChange(m.id)
                setOpen(false)
              }}
            >
              <span className="block text-[13px] text-ink">{m.name}</span>
            </MenuItem>
          ))}
        </GlideMenu>
      </Popover>
    </div>
  )
}

export type ComposerHandle = { focus: () => void; set: (text: string) => void }

export const Composer = forwardRef<
  ComposerHandle,
  {
    value: string
    onChange: (value: string) => void
    textareaRef?: React.RefObject<HTMLTextAreaElement | null>
    disabled?: boolean
    busy: boolean
    model: ChatModel
    onModelChange: (m: ChatModel) => void
    onSend: (text: string) => void
    onStop: () => void
    placeholder?: string
    size?: 'hero' | 'dock'
  }
>(function Composer({ value, onChange: setValue, textareaRef, disabled, busy, model, onModelChange, onSend, onStop, placeholder, size = 'dock' }, ref) {
  const [caret, setCaret] = useState(0)
  const [active, setActive] = useState(0)
  const [menuClosed, setMenuClosed] = useState(false)
  const [sentPulse, setSentPulse] = useState(0)
  const ta = useRef<HTMLTextAreaElement>(null)
  const shell = useRef<HTMLDivElement>(null)
  const mirror = useRef<HTMLDivElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => ta.current?.focus(),
    set: (text: string) => {
      setValue(text)
      requestAnimationFrame(() => {
        const el = ta.current
        if (!el) return
        el.focus()
        el.setSelectionRange(text.length, text.length)
        setCaret(text.length)
      })
    },
  }))

  /* autosize */
  useLayoutEffect(() => {
    const el = ta.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [value])

  const menu = menuClosed ? null : detectMenu(value, caret)
  const count = menu?.items.length ?? 0
  const activeIndex = count ? Math.min(active, count - 1) : -1

  useDismiss(!!menu, () => setMenuClosed(true), [shell])

  const update = (next: string, pos: number) => {
    setValue(next)
    setCaret(pos)
    setActive(0)
    setMenuClosed(false)
  }

  const choose = (i: number) => {
    if (!menu) return
    if (menu.kind === 'command') {
      const c = menu.items[i]
      update(c.fill, c.fill.length)
      requestAnimationFrame(() => ta.current?.setSelectionRange(c.fill.length, c.fill.length))
    } else {
      const port = menu.items[i]
      const before = value.slice(0, caret).replace(/@[\w-]*$/, `@${port.name} `)
      const next = before + value.slice(caret)
      update(next, before.length)
      requestAnimationFrame(() => ta.current?.setSelectionRange(before.length, before.length))
    }
    setMenuClosed(true)
  }

  const canSend = value.trim().length > 0 && !busy && !disabled

  const submit = () => {
    if (!canSend) return
    onSend(value)
    setCaret(0)
    setSentPulse((n) => n + 1)
  }

  useEffect(() => {
    if (!sentPulse) return
    const t = setTimeout(() => setSentPulse(0), 400)
    return () => clearTimeout(t)
  }, [sentPulse])

  const hero = size === 'hero'
  const typeClass = hero ? 'min-h-12 text-[15px] leading-[1.6]' : 'min-h-6 text-[14.5px] leading-[1.6]'

  return (
    <div ref={shell} className="relative">
      {/* slash commands / @ports */}
      <Popover
        open={!!menu}
        origin={hero ? 'top-left' : 'bottom-left'}
        className={cn('left-0 w-full max-w-[380px]', hero ? 'top-[calc(100%+8px)]' : 'bottom-[calc(100%+8px)]')}
      >
        {menu && (
          <>
            <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-1 text-[11.5px] font-medium text-ink-3">
              {menu.kind === 'command' ? 'Commands' : (<><AtSign className="size-3" /> Ports & terminals</>)}
            </div>
            <GlideMenu activeIndex={activeIndex} className="scroll-quiet max-h-64 overflow-y-auto">
              {menu.kind === 'command'
                ? menu.items.map((c, i) => (
                    <button
                      key={c.cmd}
                      type="button"
                      data-menu-row
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(i)}
                      className="relative z-10 flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left"
                    >
                      <c.icon className="size-4 text-ink-2" strokeWidth={1.9} />
                      <span className="font-mono text-[12.5px] font-medium text-ink">{c.cmd}</span>
                      <span className="truncate text-[12.5px] text-ink-3">{c.desc}</span>
                    </button>
                  ))
                : menu.items.map((p, i) => (
                    <button
                      key={p.slug}
                      type="button"
                      data-menu-row
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(i)}
                      className="relative z-10 flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left"
                    >
                      <span className="flex size-5 items-center justify-center rounded-[6px] bg-accent-tint text-accent-ink">
                        <Anchor className="size-3" strokeWidth={2.2} />
                      </span>
                      <span className="truncate text-[13px] text-ink">{p.name}</span>
                      <span className="ml-auto truncate font-mono text-[10.5px] text-ink-3">{p.slug}</span>
                    </button>
                  ))}
            </GlideMenu>
            <div className="mt-1 flex items-center gap-3 border-t border-line px-2 pt-1.5 pb-1 text-[11px] text-ink-3">
              <span className="flex items-center gap-1"><Kbd keys={['↑', '↓']} className="ml-0" /> navigate</span>
              <span className="flex items-center gap-1"><Kbd keys={['↵']} className="ml-0" /> select</span>
              <span className="flex items-center gap-1"><Kbd keys={['esc']} className="ml-0" /> close</span>
            </div>
          </>
        )}
      </Popover>

      <div
        onClick={() => ta.current?.focus()}
        className={cn(
          'flex cursor-text flex-col rounded-[20px] bg-surface shadow-composer transition-shadow duration-200 focus-within:shadow-composer-focus',
          hero ? 'gap-3 p-3 pt-3.5' : 'gap-2 p-2.5 pt-3',
        )}
      >
        {/* textarea + mirrored highlight layer: identical metrics, so mentions
            get a pill without moving a single glyph or the caret */}
        <div className="relative">
          <div
            ref={mirror}
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-0 overflow-hidden px-1.5 break-words whitespace-pre-wrap text-ink',
              typeClass,
            )}
          >
            {tokenize(value).map((t, i) =>
              t.kind === 'mention' ? (
                <span
                  key={i}
                  className="rounded-[5px] bg-accent-tint text-accent-ink shadow-[0_0_0_2px_var(--accent-tint)]"
                >
                  {t.text}
                </span>
              ) : t.kind === 'command' ? (
                <span key={i} className="rounded-[5px] bg-hover-2 text-ink shadow-[0_0_0_2px_var(--hover-2)]">
                  {t.text}
                </span>
              ) : (
                <span key={i}>{t.text}</span>
              ),
            )}
            {/* keeps a trailing newline's height in the mirror */}
            {'​'}
          </div>
          <textarea
            ref={(node) => { ta.current = node; if (textareaRef) textareaRef.current = node }}
            disabled={disabled}
            rows={1}
            maxLength={4000}
            value={value}
            aria-label="Message"
            placeholder={placeholder ?? 'Ask about port charges, tariffs or vessels…'}
            onChange={(e) => update(e.target.value, e.target.selectionStart)}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
            onKeyDown={(e) => {
              if (menu) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setActive((activeIndex + 1) % count)
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActive((activeIndex - 1 + count) % count)
                  return
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault()
                  choose(activeIndex)
                  return
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setMenuClosed(true)
                  return
                }
              }
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              }
            }}
            onScroll={(e) => {
              if (mirror.current) mirror.current.scrollTop = e.currentTarget.scrollTop
            }}
            className={cn(
              'scroll-quiet relative block w-full resize-none bg-transparent px-1.5 text-transparent caret-ink outline-none placeholder:text-ink-3',
              typeClass,
            )}
          />
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Tooltip label="Mention a port" kbd={['@']}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Mention a port"
              onClick={() => {
                const next = value + (value && !value.endsWith(' ') ? ' @' : '@')
                update(next, next.length)
                requestAnimationFrame(() => {
                  ta.current?.focus()
                  ta.current?.setSelectionRange(next.length, next.length)
                })
              }}
            >
              <AtSign strokeWidth={1.9} />
            </Button>
          </Tooltip>
          <span className="mx-1 h-4 w-px bg-line-strong" />
          <ModelPicker model={model} onChange={onModelChange} disabled={busy || disabled} />

          <div className="ml-auto flex items-center gap-1.5">
            <Tooltip label={busy ? 'Stop generating' : 'Send'} kbd={busy ? ['esc'] : ['↵']}>
              <button
                type="button"
                aria-label={busy ? 'Stop generating' : 'Send message'}
                disabled={!busy && !canSend}
                onClick={busy ? onStop : submit}
                className={cn(
                  'flex size-8 items-center justify-center rounded-[10px] transition-[background-color,color,transform,box-shadow] duration-200 enabled:active:scale-[0.96]',
                  busy || canSend
                    ? 'bg-ink text-canvas shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(0_0_0/0.15)]'
                    : 'bg-hover-2 text-ink-3',
                )}
                style={sentPulse ? { animation: 'like-pop 360ms cubic-bezier(0.34,1.56,0.64,1)' } : undefined}
              >
                <IconSwap
                  on={busy}
                  a={<ArrowUp className="size-4" strokeWidth={2.4} />}
                  b={<Square className="size-3" fill="currentColor" strokeWidth={0} />}
                />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  )
})
