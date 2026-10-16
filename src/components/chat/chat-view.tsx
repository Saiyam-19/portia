'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useChat } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { migrationTransport } from '@/lib/migration/transport'
import { clientResponseError } from '@/lib/migration/response-errors'
import { initialQuestionDraft, makeQuestionRequest, migrationRunState, questionDraftReducer } from '@/lib/migration/client-state'
import { formDefinitionSchema, chatRequestByteLength, MAX_CHAT_REQUEST_BYTES, INTERNAL_CONVERSATION_TOOLS, type MigrationChatRequest } from '@/lib/migration/contracts'
import Message from './message'
import Composer from './composer'
import ModelSelector from './model-selector'
import WorkspaceHeader from '@/components/dashboard/workspace-header'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { ChatModel } from '@/lib/chat-model'
import { ArrowDown, Loader2, Trash2 } from 'lucide-react'

export type FormField = { name: string; label: string; type: 'text' | 'number' | 'radio' | 'textarea'; placeholder?: string; options?: string[]; unit?: string; hint?: string; required?: boolean }
export type FormCard = { toolCallId: string; title: string; description?: string; fields: FormField[]; response: { content: string; cancelled: boolean } | null }
export type Segment = { kind: 'text'; content: string } | { kind: 'tool'; id: string; tool: string; label: string; status: 'running' | 'done' | 'error' } | { kind: 'card'; formCard: FormCard }
type ChatMessage = { id: string; role: 'user' | 'assistant'; segments: Segment[]; streaming?: boolean; interrupted?: boolean }
type LiveMessage = UIMessage<{ conversationId?: string; runId?: string; revision?: number }>
const TOOL_LABELS: Record<string, string> = { consult_port_agent: 'Consulting port tariff', calculate_charges: 'Calculating charges', calculate_charge_batch: 'Calculating charges', calculate_supplied_quote: 'Checking supplied quotation', calculate_elapsed_time: 'Checking dates and elapsed time', search_vessels: 'Searching vessels', get_vessel: 'Checking vessel details', ask_user_input: 'Preparing details', remember_memory: 'Saving memory', recall_memory: 'Recalling saved memory', forget_memory: 'Forgetting memory', write_scratchpad: 'Saving working notes', read_scratchpad: 'Reading working notes' }

export default function ChatView({ conversationId, initialMessage, initialRequestId, initialModel = 'model-1' }: { conversationId: string; initialMessage?: string; initialRequestId?: string; initialModel?: ChatModel }) {
  const router = useRouter()
  const conversation = useQuery(api.migration.getConversation, { conversationId })
  const history = usePaginatedQuery(api.migration.listConversationMessages, conversation ? { conversationId: conversation.conversation.id } : 'skip', { initialNumItems: 40 })
  const deleteConversation = useMutation(api.migration.deleteConversation)
  const [draftState, dispatchDraft] = useReducer(questionDraftReducer, initialQuestionDraft)
  const input = draftState.input
  const setInput = (value: string) => dispatchDraft({ type: 'edit', value })
  const [selectedModel, selectModel] = useState<ChatModel>()
  const initialIntent=conversation?.conversation.initialIntent
  // Restore the last actual run across reloads/devices, including pending forms.
  // An explicit selection wins; the navigation intent applies only to a new chat.
  const model = initialIntent?.modelAlias ?? selectedModel ?? (initialMessage && conversation?.conversation.revision === 0
    ? initialModel : conversation?.conversation.modelAlias ?? initialModel)
  const [localError, setLocalError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showScrollDown, setShowScrollDown] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const followRef = useRef(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const initialSent = useRef(false)
  const sending = useRef(false)
  const [requestKind, setRequestKind] = useState<'question' | 'form'>('question')
  const { messages, sendMessage, status, stop, setMessages, clearError } = useChat<LiveMessage>({
    id: conversationId,
    transport: migrationTransport,
    onError: (error) => {
      setLocalError(clientResponseError(error))
      dispatchDraft({ type: 'transport-failed' })
      setMessages([])
      sending.current = false
    },
    onFinish: ({ message, isAbort, isError }) => {
      dispatchDraft({ type: 'observe', metadata: message.metadata })
      sending.current = false
      if (isAbort || isError) {
        setLocalError(current => current || 'Response interrupted. Partial work is not a completed estimate.')
        dispatchDraft({ type: 'transport-failed' })
      }
    },
  })
  const transportBusy = status === 'submitted' || status === 'streaming'
  const streamedRunId = [...messages].reverse().find(message => message.metadata?.runId)?.metadata?.runId
  const { running, activeRunId } = migrationRunState(status, streamedRunId, conversation?.conversation)
  const forms = conversation?.forms ?? []
  const pendingForm = forms.find(form => form.status === 'pending')
  const ready = conversation !== undefined && history.status !== 'LoadingFirstPage'
  const latestMetadata = [...messages].reverse().find(message => message.metadata?.runId)?.metadata
  useEffect(() => {
    dispatchDraft({ type: 'observe', metadata: latestMetadata })
  }, [latestMetadata])
  const pendingDraftRunId = draftState.pending?.runId
  const persistedDraftRunStatus = history.results.find(item => item.runId === pendingDraftRunId)?.runStatus
  useEffect(() => {
    if (pendingDraftRunId && persistedDraftRunStatus) dispatchDraft({ type: 'saved', runId: pendingDraftRunId, status: persistedDraftRunStatus, transportBusy })
  }, [pendingDraftRunId, persistedDraftRunStatus, transportBusy])
  useEffect(() => {
    if (!transportBusy && messages.length && conversation && conversation.conversation.state !== 'running' && history.results.some(item => item.runId === streamedRunId)) setMessages([])
  }, [transportBusy, messages.length, conversation, history.results, streamedRunId, setMessages])
  const submit = useCallback(async (request: MigrationChatRequest | (() => MigrationChatRequest), text: string) => {
    if (sending.current) return
    sending.current = true
    setLocalError(''); clearError(); followRef.current = true
    try {
      const body = typeof request === 'function' ? request() : request
      setRequestKind(body.kind)
      await sendMessage({ text }, { body })
    }
    catch (error) {
      dispatchDraft({ type: 'transport-failed' })
      setLocalError(error instanceof Error && error.name === 'ZodError'
        ? 'Use up to 4,000 characters per message, or 2,000 for corrections to an open form. Your draft is preserved.'
        : 'Couldn’t send. Your draft is still available.')
    }
    finally { sending.current = false }
  }, [sendMessage, clearError])
  const question = useCallback(async (text: string, requestId = crypto.randomUUID()) => {
    const normalized = text.trim()
    if (!normalized || !conversation || running || sending.current) return
    dispatchDraft({ type: 'question', text: normalized, revision: conversation.conversation.revision + 1 })
    await submit(() => makeQuestionRequest({ requestId, conversationId, expectedRevision: conversation.conversation.revision, text: normalized, modelAlias: model, pendingToolCallId: pendingForm?.toolCallId }), normalized)
  }, [conversation, conversationId, running, pendingForm, model, submit])
  useEffect(() => {
    const firstQuestion=initialIntent?.question??initialMessage
    if (!ready || !conversation || !firstQuestion || initialSent.current) return
    initialSent.current = true
    const requestId = initialIntent?.requestId ?? (initialRequestId && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(initialRequestId) ? initialRequestId : crypto.randomUUID())
    // A non-empty saved conversation has already consumed this navigation intent.
    if (conversation.conversation.revision === 0) void question(firstQuestion, requestId)
    window.history.replaceState(null, '', `/dashboard/chat/${conversationId}`)
  }, [ready, conversation, initialIntent, initialMessage, initialRequestId, conversationId, question])
  const handleForm = async (toolCallId: string, values: Record<string, string>, note: string, cancelled: boolean) => {
    if (!conversation || running || sending.current || pendingForm?.toolCallId !== toolCallId) return
    const body:MigrationChatRequest={ kind: 'form', requestId: crypto.randomUUID(), conversationId, expectedRevision: conversation.conversation.revision, modelAlias: model, toolCallId, values, note, cancelled }
    if(chatRequestByteLength(body)>MAX_CHAT_REQUEST_BYTES){
      setLocalError('These details are too long to send together. Shorten the text fields or additional context and try again. Your entries are still here.')
      return
    }
    dispatchDraft({ type: 'form' })
    await submit(body, cancelled ? 'Cancelled form' : 'Submitted details')
  }
  const stopRun = async () => {
    if (!activeRunId) { stop(); return }
    try {
      const response = await fetch('/api/chat/cancel', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: activeRunId }) })
      if (!response.ok) throw new Error('Stop failed')
      stop(); setLocalError('Response stopped. Partial work is not a completed estimate.')
    } catch { setLocalError('Couldn’t stop the response. Please try again.') }
  }
  const remove = async () => {
    if (!conversation || deleting) return
    setDeleting(true)
    try { await deleteConversation({ conversationId: conversation.conversation.id }); stop(); router.replace('/dashboard') }
    catch { setLocalError('Couldn’t delete this conversation. Please try again.'); setDeleting(false) }
  }
  const formCard = (toolCallId: string): FormCard | null => {
    const form = forms.find(value => value.toolCallId === toolCallId)
    if (!form) return null
    return { toolCallId, title: form.title, description: form.description ?? undefined, fields: form.fields, response: form.status === 'pending' ? null : { cancelled: form.status === 'cancelled', content: [...Object.entries(form.values ?? {}).filter(([,value]) => value.trim()).map(([key,value]) => `${key}: ${value}`), form.note ? `Note: ${form.note}` : ''].filter(Boolean).join('\n') } }
  }
  const items: ChatMessage[] = []
  const seenTools = new Map<string, Extract<Segment, {kind: 'tool'}>>()
  const seenForms = new Set<string>()
  const liveRun = streamedRunId ?? (transportBusy ? conversation?.conversation.activeRunId : undefined)
  for (const message of [...history.results].sort((a,b) => a.order - b.order || a.stepOrder - b.stepOrder)) {
    if (messages.length && liveRun && message.runId === liveRun) continue
    const segments: Segment[] = []
    for (const part of message.parts) {
      if (part.type !== 'text' && INTERNAL_CONVERSATION_TOOLS.has(part.toolName)) continue
      if (part.type === 'text') segments.push({ kind: 'text', content: part.text })
      else if (part.toolName === 'ask_user_input') {
        const card = formCard(part.toolCallId)
        if (card && !seenForms.has(part.toolCallId)) { segments.push({ kind: 'card', formCard: card }); seenForms.add(part.toolCallId) }
      } else {
        const prior = seenTools.get(part.toolCallId)
        const toolStatus = part.status === 'error' ? 'error' : part.status === 'completed' ? 'done' : message.runStatus === 'active' ? 'running' : 'error'
        if (prior) prior.status = toolStatus
        else { const tool: Extract<Segment, {kind:'tool'}> = { kind: 'tool', id: part.toolCallId, tool: part.toolName, label: TOOL_LABELS[part.toolName] ?? 'Working', status: toolStatus }; seenTools.set(part.toolCallId, tool); segments.push(tool) }
      }
    }
    if (segments.length) items.push({ id: message.id, role: message.role, segments, interrupted: ['cancelled','expired','error'].includes(message.runStatus ?? '') && message.role === 'assistant' })
  }
  for (const message of messages) {
    const segments: Segment[] = []
    // Form continuation is represented inline, not as a duplicate synthetic user bubble.
    if (message.role === 'user' && requestKind === 'form') continue
    for (const part of message.parts) {
      if (part.type === 'text') segments.push({ kind: 'text', content: part.text })
      else if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
        const tool = part as unknown as { toolCallId: string; toolName?: string; state: string; input?: unknown }
        const name = tool.toolName ?? part.type.slice(5)
        if (name === 'ask_user_input') {
          const existing = formCard(tool.toolCallId)
          const parsed = formDefinitionSchema.safeParse({ ...(tool.input && typeof tool.input === 'object' ? tool.input : {}), toolCallId: tool.toolCallId })
          const card = existing ?? (parsed.success ? { ...parsed.data, response: null } : null)
          if (card && !seenForms.has(tool.toolCallId)) { segments.push({ kind:'card', formCard: card }); seenForms.add(tool.toolCallId) }
        } else if (TOOL_LABELS[name]) segments.push({ kind:'tool', id: tool.toolCallId, tool:name, label:TOOL_LABELS[name], status: tool.state === 'output-error' ? 'error' : tool.state === 'output-available' ? 'done' : running ? 'running' : 'error' })
      }
    }
    if (message.role === 'user' || message.role === 'assistant') items.push({ id: message.id, role: message.role, segments, streaming: message.role === 'assistant' && transportBusy })
  }
  const itemSignature = JSON.stringify(items)
  useEffect(() => { if (followRef.current) bottomRef.current?.scrollIntoView({ block: 'end' }) }, [itemSignature])
  const scrollToBottom = () => { followRef.current = true; bottomRef.current?.scrollIntoView({ block: 'end' }); setShowScrollDown(false) }
  const error = localError || (!running && ['error','stopped'].includes(conversation?.conversation.state ?? '') ? 'This response was interrupted. Saved steps are partial work, not a completed estimate.' : '')
  const hasPendingCard = Boolean(pendingForm) || items.some(item => item.segments.some(segment => segment.kind === 'card' && segment.formCard.response === null))
  return (
    <div className="relative flex h-full flex-col">
      <WorkspaceHeader title={conversation?.conversation.title ?? 'Conversation'} conversation />
      {conversation === null ? <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-sm text-muted-foreground"><p>Conversation not found or unavailable to this account.</p><Button onClick={() => router.replace('/dashboard')}>New conversation</Button></div> : !ready ? <div role="status" className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Loading conversation…</div> : <>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" onScroll={event => { const e = event.currentTarget; followRef.current = e.scrollHeight - e.scrollTop - e.clientHeight < 100; setShowScrollDown(!followRef.current) }}>
          <div className="mx-auto w-full max-w-3xl space-y-8 px-5 pt-5 pb-8 sm:px-8">
            {history.status === 'CanLoadMore' && <Button variant="ghost" onClick={() => { followRef.current = false; history.loadMore(40) }}>Load earlier messages</Button>}
            {history.status === 'LoadingMore' && <p role="status" className="text-xs text-muted-foreground">Loading earlier messages…</p>}
            {items.length === 0 && <p className="py-20 text-center text-sm text-muted-foreground">Start with a port, a vessel, or a question.</p>}
            {items.map(message => <div key={message.id}><Message role={message.role} segments={message.segments} streaming={message.streaming} formDisabled={running} onFormSubmit={(id,values,note) => void handleForm(id,values,note,false)} onFormCancel={(id,note) => void handleForm(id,{},note,true)} />{message.interrupted && <p className="mt-2 text-xs text-destructive">Interrupted response · partial work</p>}</div>)}
            {running && !transportBusy && <div role="status" className="text-xs text-muted-foreground">A response is running. Completed steps appear here as they are saved.</div>}
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <div ref={bottomRef} />
          </div>
        </div>
        <div className="relative shrink-0 pb-4">
          {showScrollDown && <Button variant="outline" size="icon-lg" className="absolute -top-12 left-1/2 -translate-x-1/2 rounded-full bg-background" aria-label="Scroll to latest message" onClick={scrollToBottom}><ArrowDown aria-hidden="true" /></Button>}
          <div className="mx-auto w-full max-w-3xl px-5 sm:px-8">
            {hasPendingCard && <p role="status" className="mb-2 text-center text-xs text-muted-foreground">Complete the form above, or send a correction below to replace it.</p>}
            {initialIntent ? <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
              <p className="font-medium">Your first question is saved</p><p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-muted-foreground">{initialIntent.question}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3"><ModelSelector value={model} onChange={selectModel} disabled /><Button disabled={running} onClick={()=>void question(initialIntent.question,initialIntent.requestId)}>Retry saved question</Button>{running&&<Button variant="ghost" onClick={()=>void stopRun()}>Stop response</Button>}</div>
              <p className="mt-2 text-xs text-muted-foreground">To ask something different, start a new conversation or delete this one.</p>
            </div> : <Composer value={input} onChange={setInput} onSend={() => void question(input)} model={model} onModelChange={selectModel} loading={running} onStop={() => void stopRun()} textareaRef={textareaRef} placeholder={hasPendingCard ? 'Send a correction or change your request…' : 'Ask a follow-up question…'} />}
            <div className="mt-3 flex items-center justify-between gap-3"><p className="text-[11px] leading-relaxed text-muted-foreground">Estimates should be checked against current port tariffs.</p><Button variant="ghost" size="icon-sm" aria-label="Delete conversation" onClick={() => setConfirmDelete(true)}><Trash2 className="size-3.5" /></Button></div>
            {confirmDelete && <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span>Delete this conversation and its messages?</span><Button variant="destructive" size="sm" disabled={deleting} onClick={() => void remove()}>{deleting ? 'Deleting…' : 'Delete'}</Button><Button variant="ghost" size="sm" disabled={deleting} onClick={() => setConfirmDelete(false)}>Keep conversation</Button></div>}
          </div>
        </div>
      </>}
    </div>
  )
}
