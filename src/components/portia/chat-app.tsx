'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, Calculator, Ellipsis, List, PanelLeft, Scale, Ship, Share, SquarePen, Trash2 } from 'lucide-react'
import { useChat } from '@/lib/portia/use-chat'
import { cn } from '@/lib/portia/cn'
import { Button, Tooltip } from '@/components/ui/button'
import { GlideMenu, MenuItem, Popover, useDismiss } from '@/components/ui/popover'
import { TextSwap } from '@/components/ui/motion'
import { ToastProvider, useToast } from '@/components/ui/toast'
import { Sidebar, Logo } from './sidebar'
import { Composer, type ComposerHandle } from './composer'
import { AssistantTurn, UserTurn } from './messages'

const EASE = 'cubic-bezier(0.23,1,0.32,1)'

const SUGGESTIONS = [
  { icon: Calculator, title: 'Estimate a port call', body: 'Charges for IMO 9321483 at Mumbai', prompt: 'Charges for my vessel with IMO 9321483 at Mumbai' },
  { icon: Scale, title: 'Compare two ports', body: 'Mumbai vs Jaigarh pilotage', prompt: 'Compare Mumbai & Jaigarh pilotage' },
  { icon: List, title: 'Browse coverage', body: 'Which ports are supported?', prompt: 'Which ports are supported?' },
  { icon: Ship, title: 'See a failure state', body: 'Look up IMO 9876543', prompt: 'Look up vessel IMO 9876543' },
]

function useIsDesktop() {
  const [desktop, setDesktop] = useState(true)
  useEffect(() => {
    const mq = matchMedia('(min-width: 1024px)')
    const on = () => setDesktop(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return desktop
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function EmptyState({ onPick, children }: { onPick: (prompt: string) => void; children: React.ReactNode }) {
  const [hello] = useState(greeting)
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-5 pt-10 pb-16">
      <div className="w-full max-w-[680px]">
        <div className="mb-7 flex flex-col items-center text-center" style={{ animation: `fade-up 500ms ${EASE} both` }}>
          <div className="relative mb-5">
            <span aria-hidden className="absolute inset-0 -z-10 scale-[2.2] rounded-full bg-accent/12 blur-2xl" />
            <Logo className="size-11 rounded-[13px] [&_svg]:size-[22px]" />
          </div>
          <p className="text-[13px] text-ink-3" suppressHydrationWarning>{hello}, Acme</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.03em] text-ink">Where are we berthing today?</h1>
        </div>
        <div className="relative z-20" style={{ animation: `fade-up 500ms ${EASE} 80ms both` }}>
          {children}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={s.title}
              type="button"
              onClick={() => onPick(s.prompt)}
              className="group flex items-start gap-3 rounded-card bg-surface/60 p-3 text-left shadow-[inset_0_0_0_1px_var(--line)] transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:bg-surface hover:shadow-raised active:scale-[0.985]"
              style={{ animation: `fade-up 450ms ${EASE} ${160 + i * 60}ms both` }}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-hover-2 text-ink-2 transition-colors duration-200 group-hover:bg-accent-tint group-hover:text-accent-ink">
                <s.icon className="size-4" strokeWidth={1.9} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-ink">{s.title}</span>
                <span className="block truncate text-[12.5px] text-ink-3">{s.body}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-6 text-center text-[11.5px] text-ink-3" style={{ animation: `fade-in 600ms ease-out 500ms both` }}>
          Type <span className="font-mono text-ink-2">/</span> for commands · <span className="font-mono text-ink-2">@</span> to mention a port · estimates use bundled tariff schedules
        </p>
      </div>
    </div>
  )
}

function HeaderMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(open, () => setOpen(false), [ref])
  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" size="icon" aria-label="More" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Ellipsis strokeWidth={1.9} />
      </Button>
      <Popover open={open} origin="top-right" className="top-[calc(100%+6px)] right-0 w-48">
        <GlideMenu>
          <MenuItem
            danger
            icon={<Trash2 strokeWidth={1.9} />}
            onSelect={() => {
              setOpen(false)
              onDelete()
            }}
          >
            Delete chat
          </MenuItem>
        </GlideMenu>
      </Popover>
    </div>
  )
}

function App() {
  const chat = useChat()
  const toast = useToast()
  const desktop = useIsDesktop()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const composer = useRef<ComposerHandle>(null)
  const search = useRef<HTMLInputElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  const stick = useRef(true)

  const open = desktop ? sidebarOpen : mobileOpen
  const toggleSidebar = () => (desktop ? setSidebarOpen((v) => !v) : setMobileOpen((v) => !v))
  const messages = chat.active?.messages ?? []
  const empty = messages.length === 0

  const goNew = () => {
    chat.newChat()
    setMobileOpen(false)
    requestAnimationFrame(() => composer.current?.focus())
  }

  /* keyboard: ⌃K search · ⌃⇧O new chat · esc stop · / focus composer */
  const keys = useRef({ goNew, stop: chat.stop, busy: chat.busy })
  useEffect(() => {
    keys.current = { goNew, stop: chat.stop, busy: chat.busy }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSidebarOpen(true)
        setMobileOpen(true)
        requestAnimationFrame(() => search.current?.focus())
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        keys.current.goNew()
      } else if (e.key === 'Escape' && keys.current.busy && !document.querySelector('.t-dropdown.is-open')) {
        keys.current.stop()
      } else if (e.key === '/' && !typing) {
        e.preventDefault()
        composer.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* stick to bottom while content streams, unless the reader scrolled up */
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  })

  useEffect(() => {
    stick.current = true
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat.activeId])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    stick.current = bottom
    setAtBottom(bottom)
  }

  const scrollDown = () => {
    stick.current = true
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }

  const send = (text: string) => {
    stick.current = true
    chat.send(text)
  }

  const composerEl = (
    <Composer
      ref={composer}
      size={empty ? 'hero' : 'dock'}
      busy={chat.busy}
      model={chat.model}
      onModelChange={chat.setModel}
      onSend={send}
      onStop={chat.stop}
      placeholder={empty ? 'Ask about port charges, tariffs or a vessel…' : 'Reply to Plisto…'}
    />
  )

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')

  return (
    <div className="app-root flex h-dvh overflow-clip bg-sidebar">
      {/* desktop sidebar — width animates, contents stay laid out */}
      {desktop ? (
        <aside
          aria-label="Chats"
          className="relative shrink-0 overflow-clip"
          style={{ width: open ? 268 : 0, transition: `width 320ms ${EASE}` }}
        >
          <div
            className="h-full transition-[opacity,transform] duration-300"
            style={{ opacity: open ? 1 : 0, transform: open ? 'none' : 'translateX(-12px)', transitionTimingFunction: EASE }}
            inert={!open}
          >
            <Sidebar
              conversations={chat.conversations}
              activeId={chat.activeId}
              running={chat.running}
              onSelect={chat.select}
              onNew={goNew}
              onRename={chat.rename}
              onPin={chat.togglePin}
              onDelete={chat.remove}
              onCollapse={toggleSidebar}
              searchRef={search}
            />
          </div>
        </aside>
      ) : (
        <>
          <div
            aria-hidden
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] transition-opacity duration-300"
            style={{ opacity: mobileOpen ? 1 : 0, pointerEvents: mobileOpen ? 'auto' : 'none' }}
          />
          <aside
            aria-label="Chats"
            className="fixed inset-y-0 left-0 z-50 bg-sidebar shadow-overlay transition-transform duration-[380ms]"
            style={{ transform: mobileOpen ? 'none' : 'translateX(-105%)', transitionTimingFunction: EASE }}
            inert={!mobileOpen}
          >
            <Sidebar
              conversations={chat.conversations}
              activeId={chat.activeId}
              running={chat.running}
              onSelect={(id) => {
                chat.select(id)
                setMobileOpen(false)
              }}
              onNew={goNew}
              onRename={chat.rename}
              onPin={chat.togglePin}
              onDelete={chat.remove}
              onCollapse={() => setMobileOpen(false)}
              searchRef={search}
            />
          </aside>
        </>
      )}

      {/* main panel floats on the sidebar tone, like a sheet */}
      <main
        className={cn(
          'relative flex min-w-0 flex-1 flex-col overflow-clip bg-page transition-[margin] duration-300 lg:my-2 lg:mr-2 lg:rounded-[14px] lg:shadow-card',
          !(open && desktop) && 'lg:ml-2',
        )}
      >
        <header className="relative z-20 flex h-13 shrink-0 items-center gap-1 px-3">
          <div
            className="flex items-center gap-1 transition-[opacity,transform,width] duration-300"
            style={{
              opacity: open && desktop ? 0 : 1,
              transform: open && desktop ? 'translateX(-8px)' : 'none',
              width: open && desktop ? 0 : 72,
              transitionTimingFunction: EASE,
            }}
            inert={open && desktop}
          >
            <Tooltip label="Open sidebar" side="bottom" align="start">
              <Button variant="ghost" size="icon" aria-label="Open sidebar" onClick={toggleSidebar}>
                <PanelLeft strokeWidth={1.8} />
              </Button>
            </Tooltip>
            <Tooltip label="New chat" side="bottom" align="start" kbd={['Ctrl', '⇧', 'O']}>
              <Button variant="ghost" size="icon" aria-label="New chat" onClick={goNew}>
                <SquarePen strokeWidth={1.8} />
              </Button>
            </Tooltip>
          </div>
          <div className="min-w-0 flex-1 truncate px-1.5 text-[14px] font-medium text-ink">
            {chat.active ? <TextSwap text={chat.active.title} /> : <span className="text-ink-3">New chat</span>}
          </div>
          {chat.active && (
            <div className="flex items-center gap-1" style={{ animation: 'fade-in 250ms both' }}>
              <Button
                variant="secondary"
                size="sm"
                leading={<Share strokeWidth={1.9} />}
                onClick={() => toast('Share link copied', 'success')}
              >
                Share
              </Button>
              <HeaderMenu onDelete={() => chat.active && chat.remove(chat.active.id)} />
            </div>
          )}
        </header>

        <div ref={scroller} onScroll={onScroll} className="scroll-quiet relative min-h-0 flex-1 overflow-y-auto">
          {empty ? (
            <EmptyState onPick={send}>{composerEl}</EmptyState>
          ) : (
            <div key={chat.activeId} className="mx-auto flex w-full max-w-[740px] flex-col gap-7 px-5 pt-4 pb-10">
              {messages.map((m) =>
                m.role === 'user' ? (
                  <UserTurn key={m.id} content={m.content} onEdit={() => composer.current?.set(m.content)} />
                ) : (
                  <AssistantTurn
                    key={m.id}
                    message={m}
                    isLast={m.id === lastAssistant?.id}
                    onSubmitForm={chat.submitForm}
                    onRegenerate={() => chat.regenerate(m.id)}
                    onFeedback={(v) => chat.setFeedback(m.id, v)}
                    onFollowUp={send}
                  />
                ),
              )}
            </div>
          )}
        </div>

        {!empty && (
          <div className="relative shrink-0 px-5 pb-4">
            {/* fade the thread into the dock */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 h-10 bg-gradient-to-b from-transparent to-page" />
            <div className="relative mx-auto w-full max-w-[740px]">
              <button
                type="button"
                aria-label="Scroll to bottom"
                onClick={scrollDown}
                className="absolute -top-12 left-1/2 flex size-8 items-center justify-center rounded-full bg-surface text-ink-2 shadow-raised transition-[opacity,transform] duration-250 hover:text-ink"
                style={{
                  opacity: atBottom ? 0 : 1,
                  transform: `translateX(-50%) translateY(${atBottom ? 6 : 0}px) scale(${atBottom ? 0.9 : 1})`,
                  pointerEvents: atBottom ? 'none' : 'auto',
                  transitionTimingFunction: EASE,
                }}
              >
                <ArrowDown className="size-4" strokeWidth={2} />
              </button>
              {composerEl}
              <p className="mt-2 text-center text-[11px] text-ink-3">
                Estimates come from static tariff schedules — confirm with the port authority before invoicing.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default function ChatApp() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  )
}
