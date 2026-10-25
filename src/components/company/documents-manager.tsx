'use client'

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { FileText, RefreshCw, Trash2, Upload } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ACCEPT, DOCUMENT_TYPES, documentFormat, uploadProblem } from '@/lib/berthwise/company-doc-rules'

type Upload = { key: string; name: string; progress: number; error?: string }
type Doc = { id: string; title: string; fileName: string; format: string; size: number; status: string; error?: string; note?: string; pages?: number; updatedAt: number }

const size = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
const errorText = (error: unknown) => error instanceof ConvexError ? String((error.data as { message?: string })?.message ?? 'The upload failed.') : error instanceof Error ? error.message : 'The upload failed.'

/** Sends a file straight to storage, reporting progress; resolves with its storage id. */
function send(url: string, file: File, onProgress: (percent: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', url)
    request.setRequestHeader('Content-Type', file.type || DOCUMENT_TYPES[documentFormat(file.name) ?? 'txt'].mime)
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)) }
    request.onload = () => {
      try { if (request.status >= 200 && request.status < 300) resolve(JSON.parse(request.responseText).storageId); else reject(new Error('The upload failed. Try again.')) }
      catch { reject(new Error('The upload failed. Try again.')) }
    }
    request.onerror = () => reject(new Error('The upload failed. Check your connection and try again.'))
    request.send(file)
  })
}

/** A company's own documents: uploaded once, read by Berthwise, searchable in chat. */
export default function DocumentsManager() {
  const documents = useQuery(api.companyDocs.listDocuments) as Doc[] | undefined
  const generateUploadUrl = useMutation(api.companyDocs.generateUploadUrl)
  const addDocument = useMutation(api.companyDocs.addDocument)
  const deleteDocument = useMutation(api.companyDocs.deleteDocument)
  const [uploads, setUploads] = useState<Upload[]>([])
  const [confirming, setConfirming] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const replacer = useRef<HTMLInputElement>(null)
  const replacing = useRef<string | null>(null)

  const update = (key: string, change: Partial<Upload>) => setUploads(list => list.map(item => item.key === key ? { ...item, ...change } : item))
  const upload = async (files: File[], replaceId?: string) => {
    setNotice('')
    for (const file of files) {
      const key = `${file.name}-${Date.now()}-${Math.random()}`
      const problem = uploadProblem(file)
      setUploads(list => [...list, { key, name: file.name, progress: 0, ...(problem ? { error: problem } : {}) }])
      if (problem) continue
      try {
        const storageId = await send(await generateUploadUrl(), file, progress => update(key, { progress }))
        await addDocument({ storageId: storageId as Id<'_storage'>, fileName: file.name, ...(replaceId ? { replaceId: replaceId as Id<'companyDocuments'> } : {}) })
        setUploads(list => list.filter(item => item.key !== key))
      } catch (error) { update(key, { error: errorText(error) }) }
    }
  }
  const choose = (event: ChangeEvent<HTMLInputElement>, replaceId?: string) => {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    void upload(replaceId ? files.slice(0, 1) : files, replaceId)
  }
  const drop = (event: DragEvent) => { event.preventDefault(); setDragging(false); void upload([...event.dataTransfer.files]) }
  const remove = async (doc: Doc) => {
    try { await deleteDocument({ id: doc.id as Id<'companyDocuments'> }); setNotice(`${doc.title} deleted.`) }
    catch (error) { setNotice(errorText(error)) }
    finally { setConfirming(null) }
  }

  return (
    <div className="space-y-6">
      <p className="max-w-prose text-muted-foreground">Upload your contracts, procedures and agreements. Berthwise reads them so you can ask about them in chat, with the page each answer comes from. Only your account can see them.</p>

      <div
        onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={drop}
        className={`flex flex-col items-center gap-3 rounded-2xl border border-dashed px-5 py-8 text-center transition-colors ${dragging ? 'border-brand bg-muted' : 'border-border'}`}
      >
        <Upload className="size-5 text-brand" aria-hidden="true" />
        <p>Drop files here, or</p>
        <Button onClick={() => picker.current?.click()}>Choose files</Button>
        <p className="text-xs text-muted-foreground">PDF, Word (.docx), Excel (.xlsx), CSV or text, up to 20 MB each. Scanned PDFs without a text layer can&apos;t be read.</p>
        <input ref={picker} type="file" multiple accept={ACCEPT} className="sr-only" aria-label="Choose files to upload" onChange={event => choose(event)} />
        <input ref={replacer} type="file" accept={ACCEPT} className="sr-only" aria-label="Choose a replacement file" onChange={event => choose(event, replacing.current ?? undefined)} />
      </div>

      {uploads.length > 0 && (
        <ul className="space-y-2" aria-label="Uploads in progress">
          {uploads.map(item => (
            <li key={item.key} className="rounded-xl border border-border px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3"><span className="truncate font-medium">{item.name}</span>{!item.error && <span className="text-xs tabular-nums text-muted-foreground">{item.progress}%</span>}</div>
              {item.error
                ? <p role="alert" className="mt-1 text-xs text-destructive">{item.error} <button className="underline" onClick={() => setUploads(list => list.filter(other => other.key !== item.key))}>Dismiss</button></p>
                : <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`Uploading ${item.name}`} aria-valuenow={item.progress} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-brand transition-[width] duration-150" style={{ width: `${item.progress}%` }} /></div>}
            </li>
          ))}
        </ul>
      )}

      {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}

      {documents === undefined
        ? <div role="status" aria-label="Loading your documents" className="space-y-3"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-full" /></div>
        : documents.length === 0
          ? <p className="text-center text-muted-foreground">No documents yet.</p>
          : (
            <ul className="divide-y divide-border rounded-xl border border-border" aria-label="Your documents">
              {documents.map(doc => (
                <li key={doc.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" title={doc.fileName}>{doc.title}</p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {DOCUMENT_TYPES[doc.format as keyof typeof DOCUMENT_TYPES]?.label ?? doc.format} · {size(doc.size)} · {' '}
                      {doc.status === 'processing' ? <span role="status">Reading…</span>
                        : doc.status === 'ready' ? `Ready${doc.pages ? ` · ${doc.pages} ${doc.format === 'xlsx' ? (doc.pages === 1 ? 'sheet' : 'sheets') : doc.format === 'pdf' ? (doc.pages === 1 ? 'page' : 'pages') : (doc.pages === 1 ? 'section' : 'sections')}` : ''}`
                          : <span className="text-destructive">{doc.error ?? 'Couldn’t be read.'}</span>}
                    </p>
                    {doc.note && <p className="text-xs leading-5 text-destructive">{doc.note}</p>}
                  </div>
                  {confirming === doc.id
                    ? <span className="inline-flex items-center gap-1"><Button size="sm" variant="destructive" onClick={() => void remove(doc)}>Delete</Button><Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>Keep</Button></span>
                    : <span className="inline-flex gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label={`Replace ${doc.title} with a new file`} onClick={() => { replacing.current = doc.id; replacer.current?.click() }}><RefreshCw aria-hidden="true" /></Button>
                      <Button size="icon-sm" variant="ghost" aria-label={`Delete ${doc.title}`} onClick={() => { setNotice(''); setConfirming(doc.id) }}><Trash2 aria-hidden="true" /></Button>
                    </span>}
                </li>
              ))}
            </ul>
          )}
    </div>
  )
}
