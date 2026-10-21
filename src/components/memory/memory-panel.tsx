'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw, X } from 'lucide-react'
import type { MemoryFact } from '@/lib/memory/contracts'
type View = {epoch:number;revision:number;facts:MemoryFact[];scratchpad:string;scratchpadRevision:number}
export default function MemoryPanel({conversationId,onClose}:{conversationId?:string;onClose:()=>void}) {
  const [view,setView]=useState<View|null>(null)
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(true)
  const latest=useRef(0)
  const mounted=useRef(true)
  const endpoint='/api/memory'+(conversationId?'?conversationId='+encodeURIComponent(conversationId):'')
  const refresh=useCallback(async()=>{
    const id=++latest.current
    setBusy(true);setError('');setView(null)
    try {
      const response=await fetch(endpoint,{cache:'no-store'})
      const body=await response.json()
      if(!response.ok)throw new Error(body.error??'Could not load memory.')
      if(mounted.current&&id===latest.current)setView(body)
    }catch(err){if(mounted.current&&id===latest.current)setError(err instanceof Error?err.message:'Could not load memory.')}
    finally{if(mounted.current&&id===latest.current)setBusy(false)}
  },[endpoint])
  useEffect(()=>{
    mounted.current=true
    const id=++latest.current
    const controller=new AbortController()
    fetch(endpoint,{cache:'no-store',signal:controller.signal}).then(async response=>{
      const body=await response.json()
      if(!response.ok)throw new Error(body.error??'Could not load memory.')
      if(mounted.current&&id===latest.current)setView(body)
    }).catch(err=>{
      if(mounted.current&&id===latest.current&&!controller.signal.aborted)setError(err instanceof Error?err.message:'Could not load memory.')
    }).finally(()=>{if(mounted.current&&id===latest.current)setBusy(false)})
    return()=>{mounted.current=false;controller.abort()}
  },[endpoint])
  async function forget(key?:string) {
    if(!view||busy)return
    if(!key&&!window.confirm('Clear all saved memories and working notes? Your chat history will remain.'))return
    const id=++latest.current
    setBusy(true);setError('')
    try {
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({kind:key?'forget':'clear',...(key?{key}:{}),epoch:view.epoch,requestId:crypto.randomUUID()})})
      const body=await response.json()
      if(!response.ok)throw new Error(body.error??'Could not update memory.')
      if(mounted.current&&id===latest.current)setView(body)
    }catch(err){if(mounted.current&&id===latest.current){setView(null);setError(err instanceof Error?err.message:'Could not update memory.')}}
    finally{if(mounted.current&&id===latest.current)setBusy(false)}
  }
  return (
    <section id="memory-panel" aria-label="Saved memory" aria-busy={busy} className="max-h-[45dvh] shrink-0 overflow-y-auto border-y border-border bg-muted/30 px-5 py-5 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div><h2 className="text-sm font-medium">Saved memory</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Facts you ask Berthwise to remember across conversations. Forgetting also clears working notes; chat history stays.</p></div>
          <div className="flex shrink-0 gap-1"><Button variant="ghost" size="icon-lg" disabled={busy} onClick={()=>void refresh()} aria-label="Refresh memory"><RefreshCw className="size-4" /></Button><Button variant="ghost" size="icon-lg" onClick={onClose} aria-label="Close memory"><X className="size-4" /></Button></div>
        </div>
        {error&&<div role="alert" className="mb-3 text-sm text-destructive">{error} <Button variant="link" disabled={busy} onClick={()=>void refresh()}>Try again</Button></div>}
        {busy&&!view&&<p role="status" className="text-sm text-muted-foreground">Loading memory…</p>}
        {view&&<>
          {view.facts.length===0?<p className="text-sm text-muted-foreground">No saved memories yet. Ask Berthwise to remember something for future chats.</p>:
          <ul className="divide-y divide-border">{view.facts.map(fact=><li key={fact.key} data-memory-key={fact.key} className="flex items-start justify-between gap-4 py-3"><div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">{fact.key.replaceAll('_',' ')}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{fact.value}</p></div><Button variant="ghost" size="sm" disabled={busy} onClick={()=>void forget(fact.key)} aria-label={'Forget '+fact.key.replaceAll('_',' ')}>Forget</Button></li>)}</ul>}
          {conversationId&&<div className="mt-5 border-t border-border pt-4"><h3 className="text-sm font-medium">This chat’s working notes</h3><p className="mt-1 text-xs text-muted-foreground">Private to this conversation.</p><div data-testid="working-notes" className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{view.scratchpad||'No working notes saved for this chat.'}</div></div>}
          {(view.facts.length>0||view.scratchpad)&&<Button variant="outline" className="mt-5" disabled={busy} onClick={()=>void forget()}>Clear all memory</Button>}
        </>}
      </div>
    </section>
  )
}
