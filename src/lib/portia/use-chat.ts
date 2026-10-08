'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatModel } from '@/lib/chat-model'
import { resolveForm, runAgent, uid } from './engine'
import { seedConversations } from './seed'
import type { AssistantMessage, Conversation, FormResponse, Message } from './types'

function titleFrom(text: string) {
  const clean = text.replace(/^\/\w+\s*/, '').replace(/\s+/g, ' ').trim()
  /* cut on a word boundary so titles read like titles, not truncations */
  let t = clean
  if (clean.length > 38) {
    const cut = clean.slice(0, 38)
    t = cut.slice(0, cut.lastIndexOf(' ') > 20 ? cut.lastIndexOf(' ') : 38).replace(/[\s,.;:–—-]+$/, '')
  }
  return t.charAt(0).toUpperCase() + t.slice(1) || 'New chat'
}

export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>(() => seedConversations(Date.now()))
  const [activeId, setActiveId] = useState<string | null>('c_konkan')
  const [model, setModel] = useState<ChatModel>('model-1')
  const controllers = useRef(new Map<string, { convId: string; controller: AbortController }>())

  useEffect(() => {
    const all = controllers.current
    return () => all.forEach((c) => c.controller.abort())
  }, [])

  const active = conversations.find((c) => c.id === activeId) ?? null

  const patchConversation = useCallback((id: string, fn: (c: Conversation) => Conversation) => {
    setConversations((list) => list.map((c) => (c.id === id ? fn(c) : c)))
  }, [])

  const start = useCallback(
    (convId: string, prompt: string, chosen: ChatModel) => {
      const msgId = uid('msg')
      const assistant: AssistantMessage = {
        id: msgId,
        role: 'assistant',
        segments: [],
        status: 'streaming',
        model: chosen,
        createdAt: Date.now(),
      }
      patchConversation(convId, (c) => ({ ...c, messages: [...c.messages, assistant], updatedAt: Date.now() }))

      const controller = new AbortController()
      controllers.current.set(msgId, { convId, controller })
      const patch = (fn: (m: AssistantMessage) => AssistantMessage) =>
        patchConversation(convId, (c) => ({
          ...c,
          messages: c.messages.map((m) => (m.id === msgId && m.role === 'assistant' ? fn(m) : m)),
        }))
      runAgent(prompt, patch, controller.signal).finally(() => controllers.current.delete(msgId))
    },
    [patchConversation],
  )

  const send = useCallback(
    (text: string) => {
      const prompt = text.trim()
      if (!prompt) return
      const user: Message = { id: uid('msg'), role: 'user', content: prompt, createdAt: Date.now() }
      let convId = activeId
      if (!convId) {
        convId = uid('conv')
        const fresh: Conversation = { id: convId, title: 'New chat', messages: [user], updatedAt: Date.now() }
        setConversations((list) => [fresh, ...list])
        setActiveId(convId)
        /* mimic async title generation so the header can swap it in */
        const id = convId
        setTimeout(() => patchConversation(id, (c) => ({ ...c, title: titleFrom(prompt) })), 1400)
      } else {
        patchConversation(convId, (c) => ({ ...c, messages: [...c.messages, user], updatedAt: Date.now() }))
      }
      start(convId, prompt, model)
    },
    [activeId, model, patchConversation, start],
  )

  const stop = useCallback(() => {
    controllers.current.forEach((c) => {
      if (c.convId === activeId) c.controller.abort()
    })
  }, [activeId])

  const regenerate = useCallback(
    (messageId: string) => {
      if (!active) return
      const index = active.messages.findIndex((m) => m.id === messageId)
      const prompt = [...active.messages.slice(0, index)].reverse().find((m) => m.role === 'user')
      if (!prompt || prompt.role !== 'user') return
      const target = active.messages[index]
      const chosen = target?.role === 'assistant' ? target.model : model
      patchConversation(active.id, (c) => ({ ...c, messages: c.messages.filter((m) => m.id !== messageId) }))
      start(active.id, prompt.content, chosen)
    },
    [active, model, patchConversation, start],
  )

  const submitForm = useCallback((segmentId: string, response: FormResponse) => {
    resolveForm(segmentId, response)
  }, [])

  const setFeedback = useCallback(
    (messageId: string, feedback: 'up' | 'down' | null) => {
      if (!activeId) return
      patchConversation(activeId, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === messageId && m.role === 'assistant' ? { ...m, feedback } : m)),
      }))
    },
    [activeId, patchConversation],
  )

  const rename = useCallback(
    (id: string, title: string) => patchConversation(id, (c) => ({ ...c, title: title.trim() || c.title })),
    [patchConversation],
  )

  const togglePin = useCallback(
    (id: string) => patchConversation(id, (c) => ({ ...c, pinned: !c.pinned })),
    [patchConversation],
  )

  const remove = useCallback(
    (id: string) => {
      setConversations((list) => list.filter((c) => c.id !== id))
      setActiveId((current) => (current === id ? null : current))
    },
    [],
  )

  const busy = !!active?.messages.some((m) => m.role === 'assistant' && (m.status === 'streaming' || m.status === 'waiting'))
  const running = new Set(
    conversations
      .filter((c) => c.messages.some((m) => m.role === 'assistant' && (m.status === 'streaming' || m.status === 'waiting')))
      .map((c) => c.id),
  )

  return {
    conversations,
    active,
    activeId,
    select: setActiveId,
    newChat: () => setActiveId(null),
    model,
    setModel,
    send,
    stop,
    regenerate,
    submitForm,
    setFeedback,
    rename,
    togglePin,
    remove,
    busy,
    running,
  }
}

export type ChatStore = ReturnType<typeof useChat>
