'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { ChevronsUpDown, LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { migrationAuthClient } from '@/lib/migration/auth-client'
import { GlideMenu, MenuItem, Popover, useDismiss } from './ui/popover'

export function AccountMenu({ name, email }: { name: string; email: string }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const anchor = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  useDismiss(open, () => setOpen(false), [anchor])
  const display = name || email.split('@')[0] || 'Your account'
  const initials = display.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase()
  const signOut = async () => {
    if (busy) return
    setBusy(true); setError('')
    try {
      const result = await migrationAuthClient.signOut()
      if (result.error) throw result.error
      router.replace('/login'); router.refresh()
    } catch { setError('Sign out failed. Please try again.'); setBusy(false) }
  }
  return <div ref={anchor} className="relative">
    <Popover open={open} origin="bottom-left" className="right-0 bottom-[calc(100%+6px)] left-0">
      <div className="px-3 pt-2 pb-3"><p className="truncate text-[13px] font-semibold text-ink">{display}</p><p className="truncate text-xs text-ink-3">{email}</p></div>
      <div className="mb-1 h-px bg-line" />
      <p className="px-3 py-1 text-[11px] font-medium text-ink-3">Appearance</p>
      <GlideMenu>{([{ value: 'system', label: 'System', icon: Monitor }, { value: 'light', label: 'Light', icon: Sun }, { value: 'dark', label: 'Dark', icon: Moon }] as const).map(option => <MenuItem key={option.value} icon={<option.icon />} onSelect={() => setTheme(option.value)} selected={theme === option.value}>{option.label}</MenuItem>)}
        <div className="mx-2 my-1 h-px bg-line" />
        <MenuItem icon={<LogOut />} onSelect={() => void signOut()}>{busy ? 'Signing out…' : 'Sign out'}</MenuItem>
      </GlideMenu>
      {error && <p role="alert" className="px-3 py-2 text-xs text-red">{error}</p>}
    </Popover>
    <button type="button" aria-label="Account and appearance" aria-expanded={open} onClick={() => setOpen(!open)} className="group flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left transition-colors hover:bg-hover-2/70 aria-expanded:bg-hover-2/70">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-[oklch(0.62_0.17_200)] text-xs font-semibold text-white">{initials}</span>
      <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-ink">{display}</span><span className="mt-0.5 block text-[11.5px] text-ink-3">Personal workspace</span></span>
      <ChevronsUpDown className="size-3.5 text-ink-3" />
    </button>
  </div>
}
