'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { Calculator, List, Scale, Ship } from 'lucide-react'
import { Logo } from '@/components/berthwise/sidebar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import Composer from '@/components/chat/composer'
import WorkspaceHeader from '@/components/dashboard/workspace-header'
import type { ChatModel } from '@/lib/chat-model'

const PROMPTS = [
  { label: 'Estimate a port call', detail: 'Charges for a vessel at Mumbai', text: 'Help me estimate port charges for my vessel at Mumbai.', icon: Calculator },
  { label: 'Compare two ports', detail: 'Mumbai vs Jaigarh pilotage', text: 'Compare Mumbai & Jaigarh pilotage', icon: Scale },
  { label: 'Browse coverage', detail: 'Which ports are supported?', text: 'Which ports are supported?', icon: List },
  { label: 'Look up a vessel', detail: 'Find vessel details by IMO', text: 'Look up vessel IMO ', icon: Ship },
]

export default function DashboardPage() {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [model, setModel] = useState<ChatModel>('model-1')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sendingRef = useRef(false)
  const router = useRouter()
  const createConversation = useMutation(api.conversations.create)

  const handleSubmit = async () => {
    const text = message.trim()
    if (!text || sendingRef.current) return
    sendingRef.current = true
    setLoading(true)
    setError('')
    try {
      const id = await createConversation({ modelAlias: model })
      const requestId = crypto.randomUUID()
      router.push(`/dashboard/chat/${id}?q=${encodeURIComponent(text)}&model=${model}&request=${requestId}`)
    } catch {
      setError('Couldn’t start the conversation. Your message is saved here — please try again.')
      setLoading(false)
      sendingRef.current = false
    }
  }

  return (
    <div className="flex h-full flex-col">
      <WorkspaceHeader title="New chat" />
      <div className="scroll-quiet relative min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col items-center justify-center px-5 pt-10 pb-16">
          <div className="w-full max-w-[680px]">
          <div className="mb-7 flex flex-col items-center text-center">
            <Logo className="mb-5 size-11 rounded-[13px] [&_svg]:size-[22px]" />
            <p className="text-[13px] text-ink-3">Your port intelligence workspace</p>
            <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.03em] text-ink">Where are we berthing today?</h1>
          </div>
          <Composer size="hero" value={message} onChange={setMessage} onSend={() => void handleSubmit()} model={model} onModelChange={setModel} loading={loading} textareaRef={textareaRef} />
          {error && <Alert variant="destructive" className="mt-3"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PROMPTS.map(prompt => (
              <button key={prompt.label} type="button" className="group flex items-start gap-3 rounded-card bg-surface/60 p-3 text-left shadow-hairline transition-[background-color,box-shadow] hover:bg-surface hover:shadow-raised disabled:opacity-50" disabled={loading}
                onClick={() => { setMessage(prompt.text); textareaRef.current?.focus() }}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-hover-2 text-ink-2 group-hover:bg-accent-tint group-hover:text-accent-ink"><prompt.icon className="size-4" strokeWidth={1.9} aria-hidden="true" /></span><span><span className="block text-[13px] font-medium text-ink">{prompt.label}</span><span className="block text-[12.5px] text-ink-3">{prompt.detail}</span></span>
              </button>
            ))}
          </div>
          <p className="mt-6 text-center text-[11.5px] text-ink-3">Type <span className="font-mono text-ink-2">/</span> for commands · <span className="font-mono text-ink-2">@</span> to mention a port · estimates use bundled tariff schedules</p>
          </div>
        </div>
      </div>
    </div>
  )
}
