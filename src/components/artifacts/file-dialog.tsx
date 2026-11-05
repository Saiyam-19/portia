'use client'

import type { ReactNode } from 'react'
import { Dialog } from 'radix-ui'
import { X } from 'lucide-react'
import { Button } from '@/components/berthwise/ui/button'

export function FileDialog({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: ReactNode }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 data-[state=open]:animate-in data-[state=closed]:animate-out motion-reduce:animate-none" />
      <Dialog.Content className="app-root fixed top-1/2 left-1/2 z-50 flex max-h-[85dvh] w-[calc(100%-32px)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-surface p-5 text-ink shadow-raised focus:outline-none sm:p-6">
        <div className="mb-5 flex shrink-0 items-start gap-3">
          <div className="min-w-0 flex-1"><Dialog.Title className="text-base font-semibold break-words">{title}</Dialog.Title><Dialog.Description className="mt-1 text-[13px] text-ink-3">{description}</Dialog.Description></div>
          <Dialog.Close asChild><Button variant="ghost" size="icon-sm" aria-label="Close dialog"><X className="size-4" /></Button></Dialog.Close>
        </div>
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
