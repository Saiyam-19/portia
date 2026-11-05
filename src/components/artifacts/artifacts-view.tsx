'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, usePaginatedQuery } from 'convex/react'
import { Download, FileText, Loader2, Pencil, RefreshCw, Search, Trash2, Upload } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import WorkspaceHeader from '@/components/dashboard/workspace-header'
import { Button, Tooltip } from '@/components/berthwise/ui/button'
import { Markdown } from '@/components/berthwise/markdown'
import { responseError } from '@/lib/chat/stream-client'
import { ARTIFACT_ACCEPT, fileSize, type ArtifactRef } from '@/lib/artifacts/shared'
import { FileDialog } from './file-dialog'
import { useArtifactUpload } from './use-artifact-upload'

export type ArtifactItem = ArtifactRef & { status: 'uploading' | 'processing' | 'ready' | 'error' | 'deleting'; hasOriginal: boolean; error: string | null; createdAt: number; updatedAt: number }

export default function ArtifactsView() {
  const [search, setSearch] = useState('')
  const files = usePaginatedQuery(api.artifacts.list, { search }, { initialNumItems: 30 })
  const rename = useMutation(api.artifacts.rename)
  const upload = useArtifactUpload()
  const input = useRef<HTMLInputElement>(null)
  const replaceId = useRef<string | undefined>(undefined)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [preview, setPreview] = useState<ArtifactItem | null>(null)
  const [markdown, setMarkdown] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const previewRequest = useRef<AbortController | null>(null)
  useEffect(() => () => previewRequest.current?.abort(), [])
  const [editing, setEditing] = useState<ArtifactItem | null>(null)
  const [name, setName] = useState('')
  const [deleting, setDeleting] = useState<ArtifactItem | null>(null)
  const [dragging, setDragging] = useState(false)

  const chooseUpload = (id?: string) => {
    replaceId.current = id
    if (input.current) { input.current.multiple = !id; input.current.click() }
  }
  const showPreview = async (file: ArtifactItem) => {
    previewRequest.current?.abort()
    const controller = new AbortController()
    previewRequest.current = controller
    setPreview(file); setMarkdown(''); setPreviewError(''); setPreviewLoading(true)
    try {
      const response = await fetch(`/api/artifacts/${file.id}?view=markdown`, { cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error(await responseError(response, 'Could not load the text view. Try again.'))
      const text = await response.text()
      if (!controller.signal.aborted) setMarkdown(text)
    } catch (cause) { if (!controller.signal.aborted) setPreviewError(cause instanceof Error ? cause.message : 'Could not load this file.') }
    finally { if (!controller.signal.aborted) setPreviewLoading(false) }
  }
  const requestAction = async (file: ArtifactItem, method: 'DELETE' | 'POST') => {
    setBusyId(file.id); setError('')
    try {
      const response = await fetch(`/api/artifacts/${file.id}`, { method })
      if (!response.ok) throw new Error(await responseError(response, 'Could not update the file. Try again.'))
      setDeleting(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update the file.') }
    finally { setBusyId(null) }
  }
  const saveName = async () => {
    if (!editing || !name.trim()) return
    setBusyId(editing.id); setError('')
    try { await rename({ artifactId: editing.id as Id<'artifacts'>, name: name.trim() }); setEditing(null) }
    catch { setError('Could not rename this file. Please try again.') }
    finally { setBusyId(null) }
  }
  const canUpload = !upload.busy

  return <div className="flex h-full flex-col">
    <WorkspaceHeader title="Artifacts" />
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8"
      onDragOver={event => { if (event.dataTransfer.types.includes('Files') && canUpload) { event.preventDefault(); setDragging(true) } }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
      onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); setDragging(false); if (canUpload) void upload.upload(Array.from(event.dataTransfer.files)) } }}>
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-2xl font-semibold tracking-tight text-ink">Your files</h2><p className="mt-2 max-w-xl text-sm leading-6 text-ink-3">Upload documents once, then attach them to a chat whenever you need them.</p></div>
          <Button variant="primary" disabled={!canUpload} onClick={() => chooseUpload()} leading={<Upload className="size-4" />}>{upload.busy ? 'Uploading…' : 'Upload files'}</Button>
        </div>
        <input ref={input} className="hidden" type="file" multiple accept={ARTIFACT_ACCEPT} aria-label="Upload artifact files" onChange={event => { const chosen = Array.from(event.target.files ?? []); const id = replaceId.current; replaceId.current = undefined; void upload.upload(chosen, id); event.target.value = '' }} />
        <div className={`mt-6 rounded-card border border-dashed px-5 py-4 text-sm ${dragging ? 'border-accent bg-accent-tint text-accent-ink' : 'border-line-strong text-ink-3'}`}>
          {upload.busy ? <p role="status" className="flex items-center gap-2"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" />{upload.progress >= 100 ? 'Upload complete. Preparing text view…' : `Uploading… ${upload.progress}%`}</p> : <p>Drop files here, or use Upload files. PDF, Word, Excel, text, images and audio · up to 16 MB each.</p>}
        </div>
        <p className="mt-2 text-xs text-ink-3">Uploaded files and their text views can be opened by anyone with their file link.</p>
        {(error || upload.error) && <p role="alert" className="mt-3 text-sm artifact-error">{error || upload.error}</p>}
        <label className="mt-7 flex w-full max-w-sm items-center gap-2 rounded-control bg-field px-3 py-2.5 text-ink-3 shadow-hairline"><Search className="size-4" aria-hidden="true" /><input aria-label="Search artifacts" placeholder="Search files" value={search} onChange={event => setSearch(event.target.value)} maxLength={180} className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-2" /></label>
        <div className="mt-4 divide-y divide-line border-y border-line">
          {files.status === 'LoadingFirstPage' ? <p role="status" className="py-16 text-center text-sm text-ink-3">Loading files…</p> : files.results.length === 0 ? <div className="py-16 text-center"><FileText className="mx-auto mb-4 size-8 text-ink-3" strokeWidth={1.4} aria-hidden="true" /><h3 className="text-sm font-medium text-ink">{search ? 'No matching files' : 'Keep your documents close'}</h3><p className="mt-2 text-sm text-ink-3">{search ? 'Try a different filename.' : 'Uploaded files appear here and are available to attach in chat.'}</p></div> : files.results.map(file => <ArtifactRow key={file.id} file={file} busy={busyId === file.id || upload.busy} onPreview={() => void showPreview(file)} onRename={() => { setError(''); setEditing(file); setName(file.name) }} onReplace={() => chooseUpload(file.id)} onDelete={() => { setError(''); setDeleting(file) }} onRetry={() => void requestAction(file, 'POST')} />)}
        </div>
        {files.status === 'CanLoadMore' && <Button variant="ghost" className="mt-4" onClick={() => files.loadMore(30)}>Load more files</Button>}
        {files.status === 'LoadingMore' && <p role="status" className="mt-4 text-sm text-ink-3">Loading more files…</p>}
      </div>
    </div>
    <FileDialog open={!!preview} onOpenChange={open => { if (!open) { previewRequest.current?.abort(); setPreview(null) } }} title={preview?.name ?? 'File preview'} description="Text view used by Berthwise. Download the original to check its layout and figures.">
      {previewLoading ? <p role="status" className="py-10 text-center text-sm text-ink-3">Loading text view…</p> : previewError ? <p role="alert" className="text-sm artifact-error">{previewError}</p> : <Markdown content={markdown} />}
      {preview && <a className="mt-5 inline-flex items-center gap-2 text-sm text-accent-ink underline underline-offset-4" href={`/api/artifacts/${preview.id}`} target="_blank" rel="noreferrer"><Download className="size-4" />Open original</a>}
    </FileDialog>
    <FileDialog open={!!editing} onOpenChange={open => { if (!open && !busyId) setEditing(null) }} title="Rename file" description="Change the display name. The original contents stay the same.">
      <form onSubmit={event => { event.preventDefault(); void saveName() }}><label className="block text-xs font-medium text-ink-2" htmlFor="artifact-name">Filename</label><input id="artifact-name" autoFocus required maxLength={180} value={name} onChange={event => setName(event.target.value)} className="mt-2 w-full rounded-control bg-field px-3 py-2.5 text-sm text-ink shadow-hairline outline-none focus:ring-2 focus:ring-accent" />{error && <p role="alert" className="mt-3 text-sm artifact-error">{error}</p>}<div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" disabled={!!busyId} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" variant="primary" disabled={!!busyId || !name.trim()}>{busyId ? 'Saving…' : 'Save name'}</Button></div></form>
    </FileDialog>
    <FileDialog open={!!deleting} onOpenChange={open => { if (!open && !busyId) setDeleting(null) }} title="Delete file?" description={`Remove ${deleting?.name ?? 'this file'} and its text view. Existing chat messages remain; future file access ends.`}>
      {error && <p role="alert" className="mb-4 text-sm artifact-error">{error}</p>}<div className="flex justify-end gap-2"><Button variant="ghost" disabled={!!busyId} onClick={() => setDeleting(null)}>Keep file</Button><Button variant="destructive" disabled={!!busyId} onClick={() => deleting && void requestAction(deleting, 'DELETE')}>{busyId ? 'Deleting…' : 'Delete file'}</Button></div>
    </FileDialog>
  </div>
}

export function ArtifactRow({ file, busy, onPreview, onRename, onReplace, onDelete, onRetry }: { file: ArtifactItem; busy: boolean; onPreview: () => void; onRename: () => void; onReplace: () => void; onDelete: () => void; onRetry: () => void }) {
  const [openedAt] = useState(() => Date.now())
  const [retryRevision, setRetryRevision] = useState(0)
  const processing = file.status === 'processing'
  const deleting = file.status === 'deleting'
  useEffect(() => {
    if (!processing) return
    const timer = setTimeout(() => setRetryRevision(file.updatedAt), Math.max(0, file.updatedAt + 300_000 - Date.now()))
    return () => clearTimeout(timer)
  }, [processing, file.updatedAt])
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4 sm:flex-nowrap">
    <FileText className="hidden size-6 shrink-0 text-ink-3 sm:block" strokeWidth={1.5} aria-hidden="true" />
    <div className="min-w-0 flex-1 basis-[65%] sm:basis-auto"><button type="button" onClick={onPreview} disabled={file.status !== 'ready'} className="block max-w-full truncate text-left text-sm font-medium text-ink hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default" title={file.name}>{file.name}</button><p className="mt-1 text-xs text-ink-3">{fileSize(file.size)} · {new Date(file.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</p>{file.error && <p className="mt-2 text-xs artifact-error">{file.error}</p>}</div>
    <span role={processing ? 'status' : undefined} className={`flex shrink-0 items-center gap-1.5 text-xs ${file.status === 'error' ? 'artifact-error' : 'text-ink-3'}`}>{processing && <Loader2 className="size-3 animate-spin motion-reduce:animate-none" />}{file.status === 'ready' ? 'Ready' : processing ? 'Preparing text view' : deleting ? 'Deletion pending' : file.status === 'uploading' ? 'Upload pending' : 'Needs retry'}</span>
    <div className="ml-auto flex shrink-0 items-center gap-1">
      {file.hasOriginal && (file.status === 'error' || (processing && (file.updatedAt < openedAt - 300_000 || retryRevision === file.updatedAt))) && <Button variant="ghost" size="sm" disabled={busy} onClick={onRetry}>Retry</Button>}
      {!deleting && file.hasOriginal && <Tooltip label="Open original"><a aria-label={`Open ${file.name}`} href={`/api/artifacts/${file.id}`} target="_blank" rel="noreferrer" className="flex size-8 items-center justify-center rounded-control text-ink-3 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"><Download className="size-4" /></a></Tooltip>}
      <Tooltip label="Rename"><Button variant="ghost" size="icon-sm" aria-label={`Rename ${file.name}`} disabled={busy || deleting} onClick={onRename}><Pencil className="size-4" /></Button></Tooltip>
      <Tooltip label="Replace file"><Button variant="ghost" size="icon-sm" aria-label={`Replace ${file.name}`} disabled={busy || processing || deleting} onClick={onReplace}><RefreshCw className="size-4" /></Button></Tooltip>
      <Tooltip label={deleting ? 'Retry deletion' : 'Delete'}><Button variant="ghost" size="icon-sm" aria-label={`Delete ${file.name}`} disabled={busy} onClick={onDelete}><Trash2 className="size-4" /></Button></Tooltip>
    </div>
  </div>
}
