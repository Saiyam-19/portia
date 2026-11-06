'use client'

import { useState } from 'react'
import { usePaginatedQuery } from 'convex/react'
import { FileText, Paperclip, Search, X } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { Button } from '@/components/berthwise/ui/button'
import { FileDialog } from './file-dialog'
import { fileSize, MAX_TURN_ATTACHMENTS, type ArtifactRef } from '@/lib/artifacts/shared'

export function AttachmentChips({ files, onRemove }: { files: ArtifactRef[]; onRemove?: (id: string) => void }) {
  if (!files.length) return null
  return <ul aria-label="Attached files" className="flex flex-wrap gap-2">
    {files.map(file => <li key={file.id} className="flex max-w-full items-center gap-2 rounded-control bg-field px-2.5 py-2 text-xs text-ink-2 shadow-hairline">
      <FileText className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
      <a className="min-w-0 truncate hover:text-accent-ink" href={`/api/artifacts/${encodeURIComponent(file.id)}`} target="_blank" rel="noreferrer" title={file.name}>{file.name}</a>
      {onRemove && <button type="button" className="shrink-0 rounded p-1 text-ink-3 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent" aria-label={`Remove ${file.name}`} onClick={() => onRemove(file.id)}><X className="size-3" /></button>}
    </li>)}
  </ul>
}

export function AttachmentPicker({ open, onOpenChange, selected, onSelect, onUpload }: { open: boolean; onOpenChange: (open: boolean) => void; selected: ArtifactRef[]; onSelect: (file: ArtifactRef) => void; onUpload: () => void }) {
  return <FileDialog open={open} onOpenChange={onOpenChange} title="Attach files" description={`Choose a file or upload one. Uploaded files are accessible to anyone with their link. Up to ${MAX_TURN_ATTACHMENTS} per message.`}>
    <Button variant="secondary" className="mb-5 w-full justify-center" onClick={() => { onOpenChange(false); onUpload() }} leading={<Paperclip className="size-4" />}>Upload from device</Button>
    {open && <SavedFiles selected={selected} onSelect={file => { onSelect(file); onOpenChange(false) }} />}
  </FileDialog>
}

function SavedFiles({ selected, onSelect }: { selected: ArtifactRef[]; onSelect: (file: ArtifactRef) => void }) {
  const [search, setSearch] = useState('')
  const files = usePaginatedQuery(api.artifacts.list, { search }, { initialNumItems: 20 })
  return <>
    <label className="mb-3 flex items-center gap-2 rounded-control bg-field px-3 py-2 text-ink-3 shadow-hairline"><Search className="size-4" aria-hidden="true" /><input autoFocus aria-label="Search uploaded files" placeholder="Search your files" value={search} onChange={event => setSearch(event.target.value)} maxLength={180} className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-2" /></label>
    <div className="space-y-1">
      {files.status === 'LoadingFirstPage' ? <p role="status" className="py-8 text-center text-sm text-ink-3">Loading files…</p> : files.results.length === 0 ? <p className="py-8 text-center text-sm text-ink-3">{search ? 'No matching files.' : 'Your uploaded files will appear here.'}</p> : files.results.map(file => <button type="button" key={file.id} disabled={file.status !== 'ready' || selected.some(item => item.id === file.id) || selected.length >= MAX_TURN_ATTACHMENTS} onClick={() => onSelect(file)} className="flex w-full items-center gap-3 rounded-control px-2 py-3 text-left hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-50">
        <FileText className="size-5 shrink-0 text-ink-3" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block truncate text-sm text-ink">{file.name}</span><span className="mt-0.5 block text-xs text-ink-3">{fileSize(file.size)} · {file.status === 'ready' ? 'Ready' : file.status === 'processing' ? 'Preparing text view' : file.status === 'deleting' ? 'Deletion pending' : file.status === 'uploading' ? 'Upload pending' : 'Needs retry'}</span></span>
      </button>)}
    </div>
    {files.status === 'CanLoadMore' && <Button variant="ghost" className="mt-3 w-full" onClick={() => files.loadMore(20)}>Load more files</Button>}
  </>
}
