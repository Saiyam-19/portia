'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { Composer as VisualComposer } from '@/components/berthwise/composer'
import type { ChatModel } from '@/lib/chat-model'
import { Paperclip } from 'lucide-react'
import { Button, Tooltip } from '@/components/berthwise/ui/button'
import { AttachmentChips, AttachmentPicker } from '@/components/artifacts/attachments'
import { useArtifactUpload } from '@/components/artifacts/use-artifact-upload'
import { ARTIFACT_ACCEPT, MAX_TURN_ATTACHMENTS, type ArtifactRef } from '@/lib/artifacts/shared'

interface Props {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  model: ChatModel
  onModelChange: (model: ChatModel) => void
  loading?: boolean
  onStop?: () => void
  placeholder?: string
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  size?: 'hero' | 'dock'
  attachments?: ArtifactRef[]
  onAttachmentsChange?: (files: ArtifactRef[]) => void
}

export default function Composer({ loading = false, onStop, onSend, attachments = [], onAttachmentsChange, ...props }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [picker, setPicker] = useState(false)
  const [dragging, setDragging] = useState(false)
  const uploader = useArtifactUpload()
  const disabled = loading || uploader.busy
  const append = (files: ArtifactRef[]) => onAttachmentsChange?.([...new Map([...attachments, ...files].map(file => [file.id, file])).values()].slice(0, MAX_TURN_ATTACHMENTS))
  const upload = async (files: File[]) => {
    if (disabled) return
    if (files.length + attachments.length > MAX_TURN_ATTACHMENTS) { uploader.setError(`Attach at most ${MAX_TURN_ATTACHMENTS} files per message.`); return }
    append(await uploader.upload(files))
  }
  useEffect(() => {
    if (!loading || !onStop) return
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('.t-dropdown.is-open')) onStop()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [loading, onStop])
  return <div aria-label="Message composer" className={dragging ? 'rounded-[20px] outline-2 outline-offset-4 outline-accent' : ''}
    onDragOver={event => { if (event.dataTransfer.types.includes('Files') && !disabled) { event.preventDefault(); setDragging(true) } }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
    onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); setDragging(false); void upload(Array.from(event.dataTransfer.files)) } }}
    onPasteCapture={event => { if (event.clipboardData.files.length) { event.preventDefault(); void upload(Array.from(event.clipboardData.files)) } }}>
    <input ref={input} type="file" multiple accept={ARTIFACT_ACCEPT} className="hidden" aria-label="Upload attachments" onChange={event => { void upload(Array.from(event.target.files ?? [])); event.target.value = '' }} />
    <VisualComposer {...props} busy={loading && !!onStop} disabled={uploader.busy || (loading && !onStop)} onSend={onSend} onStop={onStop ?? (() => {})} hasAttachments={attachments.length > 0}
      attachmentPreview={<AttachmentChips files={attachments} onRemove={disabled ? undefined : id => onAttachmentsChange?.(attachments.filter(file => file.id !== id))} />}
      attachmentControl={<Tooltip label="Attach files"><Button variant="ghost" size="icon-sm" aria-label="Attach files" disabled={disabled || attachments.length >= MAX_TURN_ATTACHMENTS} onClick={() => setPicker(true)}><Paperclip strokeWidth={1.9} /></Button></Tooltip>} />
    <p className="mt-2 px-2 text-xs text-ink-3">Uploaded files can be opened by anyone with their file link.</p>
    {uploader.busy && <p role="status" className="mt-2 px-2 text-xs text-ink-3">{uploader.progress >= 100 ? 'Upload complete. Preparing text view…' : `Uploading… ${uploader.progress}%`}</p>}
    {uploader.error && <p role="alert" className="mt-2 px-2 text-xs artifact-error">{uploader.error}</p>}
    <AttachmentPicker open={picker} onOpenChange={setPicker} selected={attachments} onSelect={file => append([file])} onUpload={() => input.current?.click()} />
  </div>
}
