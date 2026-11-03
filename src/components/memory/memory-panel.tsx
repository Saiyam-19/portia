'use client'
import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { X } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/berthwise/markdown'

/** Saved memory files and this chat's working notes, live from Convex. Only removal happens here; Berthwise writes on request. */
export default function MemoryPanel({ conversationId, onClose }: { conversationId?: string; onClose: () => void }) {
  const memory = useQuery(api.memory.view, {})
  const notes = useQuery(api.memory.notes, conversationId ? { conversationId: conversationId as Id<'conversations'> } : 'skip')
  const forget = useMutation(api.memory.forget)
  const clear = useMutation(api.memory.clear)
  const clearNotes = useMutation(api.memory.clearNotes)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('')
    try { await action() } catch { setError('Couldn’t update memory. Please try again.') } finally { setBusy(false) }
  }
  const used = memory?.files.reduce((total, file) => total + new TextEncoder().encode(file.content).byteLength, 0) ?? 0
  return (
    <section id="memory-panel" aria-label="Saved memory" aria-busy={busy || memory === undefined} className="max-h-[45dvh] shrink-0 overflow-y-auto border-y border-border bg-muted/30 px-5 py-5 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div><h2 className="text-sm font-medium">Saved memory</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Notes Berthwise keeps across conversations when you ask it to remember something. Chat history is not affected.</p></div>
          <Button variant="ghost" size="icon-lg" onClick={onClose} aria-label="Close memory"><X className="size-4" /></Button>
        </div>
        {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
        {memory === undefined ? <p role="status" className="text-sm text-muted-foreground">Loading memory…</p> : <>
          {memory.files.length === 0 ? <p className="text-sm text-muted-foreground">No saved memory yet. Ask Berthwise to remember something for future chats.</p> :
            <ul className="divide-y divide-border">{memory.files.map(file => (
              <li key={file.path} data-memory-path={file.path} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0 flex-1"><p className="font-mono text-xs text-muted-foreground">{file.path}</p><div className="mt-1 text-sm break-words"><Markdown content={file.content} /></div></div>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(() => forget({ path: file.path }))} aria-label={`Forget ${file.path}`}>Forget</Button>
              </li>
            ))}</ul>}
          {memory.files.length > 0 && <div className="mt-4 flex items-center justify-between gap-4 text-xs text-muted-foreground">
            <span>{memory.files.length}/{memory.limits.files} files · {Math.ceil(used / 1024)}/{memory.limits.totalBytes / 1024} KiB</span>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => { if (window.confirm('Clear all saved memory? Your chat history will remain.')) void run(() => clear({})) }}>Clear all memory</Button>
          </div>}
          {conversationId && <div className="mt-5 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-4"><div><h3 className="text-sm font-medium">This chat’s working notes</h3><p className="mt-1 text-xs text-muted-foreground">Kept for this conversation only.</p></div>
              {notes && <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(() => clearNotes({ conversationId: conversationId as Id<'conversations'> }))}>Clear notes</Button>}</div>
            <div data-testid="working-notes" className="mt-3 text-sm leading-relaxed break-words">{notes ? <Markdown content={notes.content} /> : <span className="text-muted-foreground">No working notes for this chat.</span>}</div>
          </div>}
        </>}
      </div>
    </section>
  )
}
