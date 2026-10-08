'use client'

import { useState, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Message from './message'
import ModelSelector from './model-selector'
import { type ChatModel, isChatModel } from '@/lib/chat-model'
import { ArrowUp, Square, Loader2 } from 'lucide-react'

export type FormField = {
  name: string
  label: string
  type: 'text' | 'number' | 'radio' | 'textarea'
  placeholder?: string
  options?: string[]
  unit?: string
  required?: boolean
}

export type FormCard = {
  toolCallId: string
  title: string
  fields: FormField[]
  response: { content: string; cancelled: boolean } | null
}

export type Segment =
  | { kind: 'text'; content: string }
  | { kind: 'tool'; id: string; tool: string; label: string; status: 'running' | 'done' }
  | { kind: 'card'; formCard: FormCard }

interface ChatMessage {
  id?: string
  role: 'user' | 'assistant'
  segments: Segment[]
  streaming?: boolean
}

interface ApiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  form_card?: {
    tool_call_id: string
    title: string
    fields: FormField[]
    response: { content: string; cancelled: boolean } | null
  }
}

interface Props {
  conversationId: string
  initialMessage?: string
  initialModel?: ChatModel
}

function toMessage(role: 'user' | 'assistant', content: string, streaming?: boolean): ChatMessage {
  return { role, segments: [{ kind: 'text', content }], streaming }
}

function messagesFromHistory(raw: ApiMessage[]): ChatMessage[] {
  return raw.map(m => {
    if (m.form_card) {
      const segs: Segment[] = []
      if (m.content) segs.push({ kind: 'text', content: m.content })
      segs.push({
        kind: 'card',
        formCard: {
          toolCallId: m.form_card.tool_call_id,
          title: m.form_card.title,
          fields: m.form_card.fields,
          response: m.form_card.response,
        },
      })
      return { role: 'assistant' as const, segments: segs }
    }
    return toMessage(m.role, m.content)
  })
}

export default function ChatView({ conversationId, initialMessage, initialModel = 'model-1' }: Props) {
  const [items, setItems] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [model, setModel] = useState<ChatModel>(initialModel)

  const selectModel = (value: ChatModel) => {
    setModel(value)
    try { localStorage.setItem(`portia:chat-model:${conversationId}`, value) } catch { /* Storage may be disabled. */ }
  }

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const getToken = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })

  // Detect a pending (unresolved) form card across all messages
  const pendingForm = (() => {
    for (const msg of items) {
      for (const seg of msg.segments) {
        if (seg.kind === 'card' && seg.formCard.response === null) return seg.formCard
      }
    }
    return null
  })()

  // ── Segment helpers ────────────────────────────────────────────────────────

  const appendChunk = (text: string) => {
    setItems(prev => {
      const updated = [...prev]
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].role === 'assistant') {
          const segs = [...updated[i].segments]
          const last = segs[segs.length - 1]
          if (last?.kind === 'text') {
            segs[segs.length - 1] = { kind: 'text', content: last.content + text }
          } else {
            segs.push({ kind: 'text', content: text })
          }
          updated[i] = { ...updated[i], segments: segs }
          break
        }
      }
      return updated
    })
    scrollToBottom()
  }

  const finaliseAssistant = (errorText?: string) => {
    setItems(prev => {
      const updated = [...prev]
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].role === 'assistant') {
          updated[i] = {
            ...updated[i],
            streaming: false,
            ...(errorText ? { segments: [{ kind: 'text', content: errorText }] } : {}),
          }
          break
        }
      }
      return updated
    })
  }

  const upsertTool = (tool: string, label: string, status: 'running' | 'done') => {
    setItems(prev => {
      const updated = [...prev]
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].role === 'assistant') {
          const segs = [...updated[i].segments]
          if (status === 'running') {
            segs.push({ kind: 'tool', id: `${tool}-${Date.now()}`, tool, label, status: 'running' })
          } else {
            const runningIdx = [...segs].reverse().findIndex(
              s => s.kind === 'tool' && (s as Extract<Segment, { kind: 'tool' }>).tool === tool && s.status === 'running'
            )
            if (runningIdx === -1) return prev
            const actualIdx = segs.length - 1 - runningIdx
            segs[actualIdx] = { ...(segs[actualIdx] as Extract<Segment, { kind: 'tool' }>), status: 'done' }
          }
          updated[i] = { ...updated[i], segments: segs }
          break
        }
      }
      return updated
    })
    scrollToBottom()
  }

  const addCard = (card: { tool_call_id: string; title: string; fields: FormField[] }) => {
    setItems(prev => {
      const updated = [...prev]
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].role === 'assistant') {
          const segs = [...updated[i].segments]
          segs.push({
            kind: 'card',
            formCard: { toolCallId: card.tool_call_id, title: card.title, fields: card.fields, response: null },
          })
          updated[i] = { ...updated[i], segments: segs }
          break
        }
      }
      return updated
    })
    scrollToBottom()
  }

  const resolveCard = (toolCallId: string, response: { content: string; cancelled: boolean }) => {
    setItems(prev =>
      prev.map(msg => ({
        ...msg,
        segments: msg.segments.map(seg =>
          seg.kind === 'card' && seg.formCard.toolCallId === toolCallId
            ? { ...seg, formCard: { ...seg.formCard, response } }
            : seg
        ),
      }))
    )
  }

  // ── SSE reader ─────────────────────────────────────────────────────────────

  const readStream = async (res: Response) => {
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.text)       appendChunk(data.text)
            if (data.error)      finaliseAssistant(`Error: ${data.error}`)
            if (data.done)       finaliseAssistant()
            if (data.card)       addCard(data.card)
            if (data.tool_start) flushSync(() => upsertTool(data.tool_start, data.label, 'running'))
            if (data.tool_end)   setTimeout(() => upsertTool(data.tool_end, data.label, 'done'), 0)
          } catch { /* ignore malformed lines */ }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') finaliseAssistant('Stream interrupted.')
      else finaliseAssistant()
    } finally {
      abortRef.current = null
    }
  }

  // ── Send user message ──────────────────────────────────────────────────────

  const streamRequest = async (text: string, token: string, selectedModel: ChatModel = model) => {
    const controller = new AbortController()
    abortRef.current = controller
    let res: Response
    try {
      res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/conversations/${conversationId}/stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ message: text, model: selectedModel }),
          signal: controller.signal,
        }
      )
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') { finaliseAssistant(); return }
      finaliseAssistant('Something went wrong. Please try again.')
      return
    }
    if (!res.ok || !res.body) { finaliseAssistant('Something went wrong. Please try again.'); return }
    await readStream(res)
  }

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return
    setLoading(true)
    let token: string | null
    try { token = await getToken() } catch { setLoading(false); return }
    if (!token) { setLoading(false); router.push('/login'); return }
    setInput('')
    setItems(prev => [...prev, toMessage('user', text), toMessage('assistant', '', true)])
    setTimeout(scrollToBottom, 50)
    await streamRequest(text, token)
    setLoading(false)
    textareaRef.current?.focus()
  }

  // ── Form response ──────────────────────────────────────────────────────────

  const handleFormResponse = async (
    toolCallId: string,
    data: Record<string, string>,
    note: string,
    cancelled: boolean,
  ) => {
    if (loading) return
    setLoading(true)
    const parts = cancelled
      ? ['Cancelled.', note.trim() ? `Note: ${note.trim()}` : ''].filter(Boolean)
      : [...Object.entries(data).filter(([, v]) => v.trim()).map(([k, v]) => `${k}: ${v}`),
         note.trim() ? `Note: ${note.trim()}` : ''].filter(Boolean)
    const content = parts.join('\n')

    let token: string | null
    try { token = await getToken() } catch { setLoading(false); return }
    if (!token) { setLoading(false); router.push('/login'); return }
    resolveCard(toolCallId, { content, cancelled })
    setItems(prev => [...prev, toMessage('assistant', '', true)])
    setTimeout(scrollToBottom, 50)

    const controller = new AbortController()
    abortRef.current = controller
    let res: Response
    try {
      res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/conversations/${conversationId}/form_response`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ tool_call_id: toolCallId, data, note, cancelled, model }),
          signal: controller.signal,
        }
      )
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') { finaliseAssistant(); setLoading(false); return }
      finaliseAssistant('Something went wrong. Please try again.')
      setLoading(false)
      return
    }
    if (!res.ok || !res.body) { finaliseAssistant('Something went wrong.'); setLoading(false); return }
    await readStream(res)
    setLoading(false)
    textareaRef.current?.focus()
  }

  const stopStreaming = () => abortRef.current?.abort()

  // ── Init ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    let active = true
    const init = async () => {
      let selectedModel = initialModel
      try {
        const saved = localStorage.getItem(`portia:chat-model:${conversationId}`)
        if (!initialMessage && isChatModel(saved)) selectedModel = saved
      } catch { /* Storage may be disabled. */ }
      selectModel(selectedModel)
      const token = await getToken()
      if (!active) return
      if (!token) { router.push('/login'); return }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/conversations/${conversationId}/messages`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!active) return

      let existing: ChatMessage[] = []
      if (res.ok) existing = messagesFromHistory(await res.json())

      if (initialMessage) {
        const text = initialMessage
        window.history.replaceState({}, '', `/dashboard/chat/${conversationId}`)
        setItems([...existing, toMessage('user', text), toMessage('assistant', '', true)])
        setLoading(true)
        setReady(true)
        setTimeout(scrollToBottom, 50)
        await streamRequest(text, token, selectedModel)
        if (active) { setLoading(false); textareaRef.current?.focus() }
      } else {
        setItems(existing)
        setReady(true)
      }
    }
    init()
    return () => { active = false; abortRef.current?.abort() }
  }, [conversationId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-1">
          {items.length === 0 && (
            <p className="text-center text-slate-400 text-sm pt-20">No messages yet.</p>
          )}
          {items.map((msg, i) => (
            <div key={i} className="py-2.5">
              <Message
                role={msg.role}
                segments={msg.segments}
                streaming={msg.streaming}
                onFormSubmit={(toolCallId, data, note) => handleFormResponse(toolCallId, data, note, false)}
                onFormCancel={(toolCallId, note) => handleFormResponse(toolCallId, {}, note, true)}
              />
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input bar — hidden while a form is pending */}
      <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-4">
        <div className="max-w-3xl mx-auto mb-3">
          <ModelSelector value={model} onChange={selectModel} disabled={loading} />
        </div>
        {pendingForm ? (
          <p className="text-center text-sm text-slate-400 max-w-3xl mx-auto py-1">
            Fill out the form above to continue.
          </p>
        ) : (
          <form
            onSubmit={e => { e.preventDefault(); sendMessage(input) }}
            className="relative max-w-3xl mx-auto"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage(input)
                }
              }}
              placeholder="Ask a follow-up question…"
              rows={1}
              disabled={loading}
              className="w-full resize-none border border-slate-200 rounded-2xl px-5 py-3.5 pr-14 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm disabled:opacity-60 leading-relaxed"
              style={{ maxHeight: '140px', overflowY: 'auto' }}
            />
            {loading ? (
              <button
                type="button"
                onClick={stopStreaming}
                className="absolute bottom-2.5 right-3 w-9 h-9 bg-slate-800 text-white rounded-xl flex items-center justify-center hover:bg-slate-700 transition-colors"
              >
                <Square className="w-3.5 h-3.5 fill-white" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="absolute bottom-2.5 right-3 w-9 h-9 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
