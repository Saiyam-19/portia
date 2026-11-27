'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { ArrowDown, Loader2, Trash2 } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import type { ChatRequest, PublicEvent } from '@/lib/chat/contracts'
import { readEvents, responseError } from '@/lib/chat/stream-client'
import type { ChatModel } from '@/lib/chat-model'
import Message from './message'
import Composer from './composer'
import ModelSelector from './model-selector'
import WorkspaceHeader from '@/components/dashboard/workspace-header'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { ArtifactRef } from '@/lib/artifacts/shared'
import { AttachmentChips } from '@/components/artifacts/attachments'

export type FormField = { name: string; label: string; type: 'text' | 'number' | 'radio' | 'textarea'; placeholder?: string; options?: string[]; unit?: string; hint?: string; required?: boolean }
export type FormCard = { toolCallId: string; title: string; description?: string; fields: FormField[]; response: { content: string; cancelled: boolean } | null }
export type Segment = { kind: 'text'; content: string } | { kind: 'tool'; id: string; tool: string; label: string; status: 'running' | 'done' | 'error' } | { kind: 'card'; formCard: FormCard }
type ChatItem = { id: string; role: 'user' | 'assistant'; segments: Segment[]; streaming?: boolean; interrupted?: boolean; attachments?: ArtifactRef[] }
type StoredSegment = { type: 'text'; text: string } | { type: 'tool'; id: string; name: string; status: 'running' | 'done' | 'error' } | { type: 'form'; form: Omit<FormCard, 'response'> }
type FormResponse = { toolCallId: string; title: string; values: Record<string, string>; note?: string; cancelled: boolean }
type EndStatus = Extract<PublicEvent, { type: 'end' }>['status']
/** The turn this tab is streaming. It stands in for the stored turn until the stored copy has caught up. */
type Live = { requestId: string; prompt: string; showPrompt: boolean; segments: Segment[]; ended: boolean; status?: EndStatus; error?: string; attachments?: ArtifactRef[] }

const FORM_TOOL = 'ask_user_input'
const TOOL_LABELS: Record<string, string> = { bash: 'Working in the workspace', calculate_charge_batch: 'Calculating charges', search_vessels: 'Searching vessels', get_vessel: 'Checking vessel details' }
const toolSegment = (id: string, name: string, status: 'running' | 'done' | 'error'): Segment => ({ kind: 'tool', id, tool: name, label: TOOL_LABELS[name] ?? 'Working', status })

function fromStored(segment: StoredSegment): Segment | null {
  if (segment.type === 'text') return { kind: 'text', content: segment.text }
  if (segment.type === 'tool') return segment.name === FORM_TOOL ? null : toolSegment(segment.id, segment.name, segment.status)
  return { kind: 'card', formCard: { ...segment.form, response: null } }
}

function applyEvent(live: Live, event: PublicEvent): Live {
  const segments = [...live.segments]
  switch (event.type) {
    case 'text': {
      const last = segments.at(-1)
      if (last?.kind === 'text') segments[segments.length - 1] = { kind: 'text', content: last.content + event.delta }
      else segments.push({ kind: 'text', content: event.delta })
      return { ...live, segments }
    }
    case 'tool': {
      if (event.name === FORM_TOOL) return live
      const index = segments.findIndex(segment => segment.kind === 'tool' && segment.id === event.id)
      if (index >= 0) segments[index] = toolSegment(event.id, event.name, event.status)
      else segments.push(toolSegment(event.id, event.name, event.status))
      return { ...live, segments }
    }
    case 'form':
      return { ...live, segments: [...segments, { kind: 'card', formCard: { ...event.form, response: null } }] }
    case 'end':
      return { ...live, ended: true, status: event.status, error: event.error }
    default:
      return live
  }
}

function responseText(form: Omit<FormCard, 'response'>, response: FormResponse) {
  const lines = form.fields.filter(field => response.values[field.name]).map(field => `${field.label}: ${response.values[field.name]}${field.unit ? ` ${field.unit}` : ''}`)
  if (response.note) lines.push(`Note: ${response.note}`)
  return lines.join('\n') || (response.cancelled ? 'Closed without answers.' : '')
}

export default function ChatView({ conversationId, initialMessage, initialRequestId, initialAttachmentIds = [], initialModel = 'model-1' }: { conversationId: string; initialMessage?: string; initialRequestId?: string; initialAttachmentIds?: string[]; initialModel?: ChatModel }) {
  const router = useRouter()
  const conversation = useQuery(api.conversations.get, { conversationId })
  const history = usePaginatedQuery(api.conversations.turns, conversation ? { conversationId: conversation.id } : 'skip', { initialNumItems: 20 })
  const removeConversation = useMutation(api.conversations.remove)
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<ArtifactRef[]>([])
  const [selectedModel, selectModel] = useState<ChatModel>()
  const model = selectedModel ?? (initialMessage && conversation?.state === 'idle' && !history.results.length ? initialModel : conversation?.modelAlias ?? initialModel)
  const [streamed, setLive] = useState<Live | null>(null)
  const [localError, setLocalError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showScrollDown, setShowScrollDown] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const followRef = useRef(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const initialSent = useRef(false)
  const sending = useRef(false)
  const reconnects = useRef(0)
  const streamAbort = useRef<AbortController | null>(null)
  useEffect(() => () => streamAbort.current?.abort(), [])

  const turns = [...history.results].reverse()
  const ready = conversation !== undefined && history.status !== 'LoadingFirstPage'
  const streamedTurn = streamed ? turns.find(turn => turn.requestId === streamed.requestId) : undefined
  // A finished stream hands its turn back to the stored projection once that has caught up.
  const live = streamed?.ended && streamedTurn && streamedTurn.status !== 'running' ? null : streamed
  const stored = live ? streamedTurn : undefined
  const running = conversation?.state === 'running' || Boolean(live && !live.ended)

  /** Streams a turn's events into `live` until the server closes the stream. */
  const follow = useCallback(async (response: Response, base: Omit<Live, 'requestId' | 'segments' | 'ended'>) => {
    const controller = new AbortController()
    streamAbort.current?.abort()
    streamAbort.current = controller
    let current: Live | null = null
    await readEvents(response, event => {
      if (event.type === 'start') current = { ...base, requestId: event.requestId, segments: [], ended: false }
      else if (current) current = applyEvent(current, event)
      if (current) setLive(current)
    }, controller.signal)
    if (controller.signal.aborted || !current) return
    // A stream that closed without an end event dropped: clearing it lets the reconnect effect rejoin the turn.
    const last: Live = current
    setLive(last.status ? { ...last, ended: true } : null)
  }, [])

  // Rejoin a turn that is running without a stream in this tab: after a reload, or from another device.
  useEffect(() => {
    if (conversation && conversation.state !== 'running') reconnects.current = 0
    if (!conversation || conversation.state !== 'running' || live || sending.current) return
    const attempt = ++reconnects.current
    if (attempt > 5) return
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/chat/stream?conversationId=${encodeURIComponent(conversation.id)}`, { credentials: 'include', cache: 'no-store' })
        if (response.status === 200) await follow(response, { prompt: '', showPrompt: false })
      } catch { /* the stored projection still shows progress */ }
    }, attempt === 1 ? 0 : 1000 * attempt)
    return () => clearTimeout(timer)
  }, [conversation, live, follow])

  const submit = useCallback(async (request: Omit<ChatRequest, 'conversationId' | 'requestId' | 'modelAlias'>, prompt: string, options: { showPrompt: boolean; requestId?: string; restore?: string; attachments?: ArtifactRef[] }) => {
    if (!conversation || sending.current) return
    sending.current = true
    reconnects.current = 0
    setLocalError(''); followRef.current = true
    const requestId = options.requestId ?? crypto.randomUUID()
    setLive({ requestId, prompt, showPrompt: options.showPrompt, segments: [], ended: false, attachments: options.attachments })
    try {
      const response = await fetch('/api/chat', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, conversationId: conversation.id, requestId, modelAlias: model } satisfies ChatRequest),
      })
      if (!response.ok) {
        setLocalError(await responseError(response, 'Couldn’t send. Please try again.'))
        setLive(null)
        if (options.restore) setInput(options.restore)
        if (options.attachments) setAttachments(options.attachments)
        return
      }
      sending.current = false
      await follow(response, { prompt, showPrompt: options.showPrompt, attachments: options.attachments })
    } catch {
      setLocalError('Connection lost. The response continues in the background and appears here when saved.')
      setLive(null)
    } finally {
      sending.current = false
    }
  }, [conversation, model, follow])

  const send = useCallback(async (text: string, requestId?: string) => {
    const message = text.trim()
    const selected = attachments
    if ((!message && !selected.length) || running) return
    setInput('')
    setAttachments([])
    await submit({ ...(message ? { message } : {}), ...(selected.length ? { attachmentIds: selected.map(file => file.id) } : {}) }, message || 'Please review the attached files.', { showPrompt: true, requestId, restore: text, attachments: selected })
  }, [running, submit, attachments])

  useEffect(() => {
    if (!ready || !conversation || !initialMessage || initialSent.current) return
    initialSent.current = true
    const requestId = initialRequestId && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(initialRequestId) ? initialRequestId : undefined
    // A conversation with turns has already consumed this navigation intent.
    if (!history.results.length) queueMicrotask(() => void submit({ message: initialMessage, ...(initialAttachmentIds.length ? { attachmentIds: initialAttachmentIds } : {}) }, initialMessage, { showPrompt: true, requestId, restore: initialMessage }))
    window.history.replaceState(null, '', `/dashboard/chat/${conversationId}`)
  }, [ready, conversation, history.results.length, initialMessage, initialRequestId, initialAttachmentIds, conversationId, submit])

  const answerForm = (toolCallId: string, values: Record<string, string>, note: string, cancelled: boolean) => {
    const form = conversation?.pendingForm
    if (!form || form.toolCallId !== toolCallId || running) return
    void submit({ formResponse: { toolCallId, values, cancelled, ...(note.trim() ? { note: note.trim() } : {}) } }, `${cancelled ? 'Dismissed' : 'Submitted'}: ${form.title}`, { showPrompt: false })
  }

  const stopRun = async () => {
    if (!conversation) return
    try {
      const response = await fetch('/api/chat/cancel', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: conversation.id }) })
      if (!response.ok) throw new Error('Stop failed')
      streamAbort.current?.abort()
      setLive(current => current && { ...current, ended: true, status: 'cancelled' })
    } catch { setLocalError('Couldn’t stop the response. Please try again.') }
  }

  const remove = async () => {
    if (!conversation || deleting) return
    setDeleting(true)
    try {
      if (running) await stopRun()
      await removeConversation({ conversationId: conversation.id as Id<'conversations'> })
      router.replace('/dashboard')
    } catch { setLocalError('Couldn’t delete this conversation. Please try again.'); setDeleting(false) }
  }

  // Assemble the transcript: stored turns, with the streaming turn's live copy standing in for its stored one.
  const responses = new Map(turns.flatMap(turn => turn.formResponse ? [[turn.formResponse.toolCallId, turn.formResponse] as const] : []))
  const withResponses = (segments: Segment[]) => segments.map(segment => {
    if (segment.kind !== 'card') return segment
    const response = responses.get(segment.formCard.toolCallId)
    return response ? { kind: 'card' as const, formCard: { ...segment.formCard, response: { cancelled: response.cancelled, content: responseText(segment.formCard, response) } } } : segment
  })
  const items: ChatItem[] = []
  for (const turn of turns) {
    const isLive = live?.requestId === turn.requestId
    const formOnly = turn.formResponse && turn.prompt === `${turn.formResponse.cancelled ? 'Dismissed' : 'Submitted'}: ${turn.formResponse.title}`
    if (!formOnly) items.push({ id: `prompt:${turn.id}`, role: 'user', segments: [{ kind: 'text', content: turn.prompt }], attachments: turn.attachments })
    const segments = isLive && live ? live.segments : turn.segments.map(segment => fromStored(segment as StoredSegment)).filter((segment): segment is Segment => segment !== null)
    const status = isLive && live?.status ? live.status : turn.status
    items.push({ id: `turn:${turn.id}`, role: 'assistant', segments: withResponses(segments), streaming: isLive ? !live?.ended : turn.status === 'running', interrupted: status === 'cancelled' || status === 'error' })
  }
  if (live && !stored) {
    if (live.showPrompt && live.prompt) items.push({ id: `prompt:${live.requestId}`, role: 'user', segments: [{ kind: 'text', content: live.prompt }], attachments: live.attachments })
    items.push({ id: `turn:${live.requestId}`, role: 'assistant', segments: withResponses(live.segments), streaming: !live.ended, interrupted: live.status === 'cancelled' || live.status === 'error' })
  }

  const itemSignature = JSON.stringify(items)
  useEffect(() => { if (followRef.current) bottomRef.current?.scrollIntoView({ block: 'end' }) }, [itemSignature])
  const scrollToBottom = () => { followRef.current = true; bottomRef.current?.scrollIntoView({ block: 'end' }); setShowScrollDown(false) }
  const lastTurn = turns.at(-1)
  const turnError = live?.ended && live.status === 'error' ? live.error : !running && lastTurn?.status === 'error' ? lastTurn.error : null
  const error = localError || turnError || (!running && lastTurn?.status === 'cancelled' ? 'Response stopped. Partial work is not a completed estimate.' : '')
  const awaitingForm = Boolean(conversation?.pendingForm) && !running
  return (
    <div className="relative flex h-full flex-col">
      <WorkspaceHeader title={conversation?.title ?? 'Conversation'} conversation actions={<Button variant="ghost" size="icon-sm" aria-label="Delete conversation" onClick={() => setConfirmDelete(true)}><Trash2 className="size-4" /></Button>} />
      {conversation === null ? <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-sm text-muted-foreground"><p>Conversation not found or unavailable to this account.</p><Button onClick={() => router.replace('/dashboard')}>New conversation</Button></div> : !ready ? <div role="status" className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Loading conversation…</div> : <>
        <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto overscroll-contain" onScroll={event => { const e = event.currentTarget; followRef.current = e.scrollHeight - e.scrollTop - e.clientHeight < 100; setShowScrollDown(!followRef.current) }}>
          <div className="mx-auto w-full max-w-[740px] space-y-7 px-5 pt-4 pb-10">
            {history.status === 'CanLoadMore' && <Button variant="ghost" onClick={() => { followRef.current = false; history.loadMore(20) }}>Load earlier messages</Button>}
            {history.status === 'LoadingMore' && <p role="status" className="text-xs text-muted-foreground">Loading earlier messages…</p>}
            {items.length === 0 && <p className="py-20 text-center text-sm text-muted-foreground">Start with a port, a vessel, or a question.</p>}
            {items.map(item => <div key={item.id}>{!!item.attachments?.length && <div className="mb-2 flex justify-end"><AttachmentChips files={item.attachments} /></div>}<Message role={item.role} segments={item.segments} streaming={item.streaming} interrupted={item.interrupted} formDisabled={running} onFormSubmit={(id, values, note) => answerForm(id, values, note, false)} onFormCancel={(id, note) => answerForm(id, {}, note, true)} /></div>)}
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <div ref={bottomRef} />
          </div>
        </div>
        <div className="relative shrink-0 px-5 pb-4">
          {showScrollDown && <Button variant="outline" size="icon-lg" className="absolute -top-12 left-1/2 -translate-x-1/2 rounded-full bg-background" aria-label="Scroll to latest message" onClick={scrollToBottom}><ArrowDown aria-hidden="true" /></Button>}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 h-10 bg-gradient-to-b from-transparent to-page" /><div className="relative mx-auto w-full max-w-[700px]">
            {awaitingForm && <div role="status" className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">Complete the details above, or type a reply to skip the form.<ModelSelector value={model} onChange={selectModel} disabled={running} /></div>}
            <Composer value={input} onChange={setInput} onSend={() => void send(input)} model={model} onModelChange={selectModel} loading={running} onStop={() => void stopRun()} textareaRef={textareaRef} attachments={attachments} onAttachmentsChange={setAttachments} placeholder={awaitingForm ? 'Or reply in your own words…' : 'Ask a follow-up question…'} />
            <p className="mt-2 text-center text-[11px] leading-relaxed text-ink-3">Estimates come from bundled tariff schedules — confirm with the port authority before invoicing.</p>
            {confirmDelete && <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span>Delete this conversation and its messages?</span><Button variant="destructive" size="sm" disabled={deleting} onClick={() => void remove()}>{deleting ? 'Deleting…' : 'Delete'}</Button><Button variant="ghost" size="sm" disabled={deleting} onClick={() => setConfirmDelete(false)}>Keep conversation</Button></div>}
          </div>
        </div>
      </>}
    </div>
  )
}
