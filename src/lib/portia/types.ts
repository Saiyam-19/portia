import type { ChatModel } from '@/lib/chat-model'

export type RunStatus = 'running' | 'done' | 'error'

export type ThinkingStep = { label: string; detail?: string }

export type FormField = {
  name: string
  label: string
  type: 'text' | 'number' | 'radio' | 'textarea'
  placeholder?: string
  options?: string[]
  unit?: string
  required?: boolean
  hint?: string
}

export type FormResponse = {
  values: Record<string, string>
  cancelled: boolean
}

export type EstimateLine = {
  label: string
  basis: string
  amount: number
}

export type Estimate = {
  port: string
  terminal: string
  vessel: { name: string; imo: string; type: string; grt: number; loa: number }
  currency: 'INR'
  lines: EstimateLine[]
  assumptions: string[]
  sources: { title: string; ref: string }[]
}

export type Source = { title: string; domain: string; tone: 'blue' | 'green' | 'orange' }

export type Segment =
  | {
      kind: 'thinking'
      id: string
      steps: ThinkingStep[]
      visible: number
      status: RunStatus
      startedAt: number
      endedAt?: number
    }
  | {
      kind: 'tool'
      id: string
      tool: 'consult_port_agent' | 'search_vessels' | 'get_vessel' | 'calculate_charges'
      label: string
      chip: string
      detail: string[]
      status: RunStatus
      startedAt: number
      endedAt?: number
    }
  | { kind: 'text'; id: string; content: string }
  | { kind: 'form'; id: string; title: string; description?: string; fields: FormField[]; response: FormResponse | null }
  | { kind: 'estimate'; id: string; estimate: Estimate }
  | { kind: 'error'; id: string; message: string }

export type MessageStatus = 'streaming' | 'waiting' | 'done' | 'stopped' | 'error'

export type Message =
  | { id: string; role: 'user'; content: string; createdAt: number }
  | {
      id: string
      role: 'assistant'
      segments: Segment[]
      status: MessageStatus
      model: ChatModel
      createdAt: number
      finishedAt?: number
      sources?: Source[]
      followUps?: string[]
      feedback?: 'up' | 'down' | null
    }

export type AssistantMessage = Extract<Message, { role: 'assistant' }>

export type Conversation = {
  id: string
  title: string
  messages: Message[]
  updatedAt: number
  pinned?: boolean
}
