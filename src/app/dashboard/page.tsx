'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Anchor, ArrowLeftRight, MapPin, Ship } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import Composer from '@/components/chat/composer'
import WorkspaceHeader from '@/components/dashboard/workspace-header'
import type { ChatModel } from '@/lib/chat-model'

const PROMPTS = [
  { label: 'Estimate port charges', text: 'Help me estimate port charges for my vessel at Mumbai.', icon: Ship },
  { label: 'Compare two ports', text: 'Compare Mumbai & Jaigarh pilotage', icon: ArrowLeftRight },
  { label: 'Explore supported ports', text: 'Which ports are supported?', icon: MapPin },
]

export default function DashboardPage() {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [model, setModel] = useState<ChatModel>('model-1')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sendingRef = useRef(false)
  const creationRef = useRef<{requestId:string;question:string;modelAlias:ChatModel}|null>(null)
  const [savedId,setSavedId]=useState<string|null>(null)
  const router = useRouter()
  const createConversation = useMutation(api.migration.createConversation)

  const handleSubmit = async () => {
    const text = message.trim()
    if (!text || sendingRef.current) return
    sendingRef.current = true
    setLoading(true)
    setError('')
    try {
      const prior=creationRef.current
      const initialIntent=prior?.question===text&&prior.modelAlias===model?prior:{requestId:crypto.randomUUID(),question:text,modelAlias:model}
      creationRef.current=initialIntent
      const id = await createConversation({initialIntent})
      setSavedId(id)
      router.push(`/dashboard/chat/${id}`)
    } catch {
      setError('Couldn’t start the conversation. Your message is saved here — please try again.')
      setLoading(false)
      sendingRef.current = false
    }
  }

  return (
    <div className="flex h-full flex-col">
      <WorkspaceHeader title="New conversation" />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 pt-10 pb-16 sm:px-8 sm:pb-24">
          <div className="mb-9 text-center">
            <Anchor className="mx-auto mb-5 size-9 text-brand" strokeWidth={1.5} aria-hidden="true" />
            <h2 className="text-3xl leading-tight font-medium tracking-tight text-balance sm:text-4xl">Your next port call,<br className="sm:hidden" /> simplified.</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">Explore tariffs, compare ports, and work through the details.</p>
          </div>
          <Composer value={message} onChange={setMessage} onSend={() => void handleSubmit()} model={model} onModelChange={setModel} loading={loading} textareaRef={textareaRef} />
          {error && <Alert variant="destructive" className="mt-3"><AlertDescription>{error}</AlertDescription></Alert>}
          {savedId&&<p role="status" className="mt-3 text-center text-sm text-muted-foreground">Question saved. <a className="underline" href={`/dashboard/chat/${savedId}`}>Open conversation</a></p>}
          <div className="mt-5 flex flex-wrap justify-center gap-x-2 gap-y-1">
            {PROMPTS.map(prompt => (
              <Button key={prompt.label} type="button" variant="ghost" className="min-h-10 gap-2 rounded-full px-3 text-xs font-normal text-muted-foreground" disabled={loading}
                onClick={() => { setMessage(prompt.text); textareaRef.current?.focus() }}>
                <prompt.icon className="size-3.5" aria-hidden="true" />{prompt.label}
              </Button>
            ))}
          </div>
        </div>
        <p className="px-6 pt-3 pb-5 text-center text-xs leading-relaxed text-muted-foreground">Estimates should be checked against current port tariffs.</p>
      </div>
    </div>
  )
}
