import ChatView from '@/components/chat/chat-view'
import { isChatModel } from '@/lib/chat-model'
export default async function ChatPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; model?: string; request?: string }> }) {
  const { id } = await params;
  const { q, model, request } = await searchParams;
  return <ChatView key={id} conversationId={id} initialMessage={typeof q === 'string' ? q : undefined} initialRequestId={typeof request === 'string' ? request : undefined} initialModel={isChatModel(model) ? model : 'model-1'} />;
}
