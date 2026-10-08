import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ChatView from '@/components/chat/chat-view'
import { isChatModel } from '@/lib/chat-model'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ q?: string; model?: string }>
}

export default async function ChatPage({ params, searchParams }: Props) {
  const { id } = await params
  const { q, model } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <ChatView key={id} conversationId={id} initialMessage={q} initialModel={isChatModel(model) ? model : 'model-1'} />
}
