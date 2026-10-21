'use client'

import { useId, useState } from 'react'
import { ArrowUp, CheckCircle2, XCircle, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { FormCard as FormCardType, FormField } from './chat-view'

interface Props {
  formCard: FormCardType
  disabled?: boolean
  onSubmit: (data: Record<string, string>, note: string) => void
  onCancel: (note: string) => void
}

function Field({ field, value, onChange }: { field: FormField; value: string; onChange: (value: string) => void }) {
  const id = useId()
  const required = field.required !== false
  return (
    <div className="space-y-2">
      <Label id={`${id}-label`} htmlFor={id} className="text-xs font-medium">{field.label}{required && <span className="text-muted-foreground" aria-hidden="true"> *</span>}</Label>
      {field.type === 'radio' && field.options ? (
        <RadioGroup aria-labelledby={`${id}-label`} value={value} onValueChange={onChange} required={required} className="flex flex-wrap gap-x-5 gap-y-3 pt-1">
          {field.options.map((option, index) => <div key={option} className="flex items-center gap-2"><RadioGroupItem value={option} id={`${id}-${index}`} /><Label htmlFor={`${id}-${index}`} className="text-sm font-normal">{option}</Label></div>)}
        </RadioGroup>
      ) : field.type === 'textarea' ? (
        <Textarea id={id} required={required} value={value} onChange={event => onChange(event.target.value)} placeholder={field.placeholder ?? ''} rows={3} />
      ) : (
        <div className="flex items-center gap-2">
          <Input id={id} required={required} type={field.type === 'number' ? 'number' : 'text'} step={field.type === 'number' ? 'any' : undefined} value={value} onChange={event => onChange(event.target.value)} placeholder={field.placeholder ?? ''} aria-describedby={field.unit ? `${id}-unit` : undefined} className="h-10" />
          {field.unit && <span id={`${id}-unit`} className="shrink-0 text-xs text-muted-foreground">{field.unit}</span>}
        </div>
      )}
      {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
    </div>
  )
}

export default function FormCard({ formCard, disabled = false, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const id = useId()
  if (formCard.response !== null) {
    const { cancelled, content } = formCard.response
    return (
      <div className="flex items-start gap-3 rounded-xl bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
        {cancelled ? <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />}
        <div className="min-w-0"><p className="mb-1 font-medium text-foreground">{formCard.title} · {cancelled ? 'Cancelled' : 'Submitted'}</p><p className="leading-relaxed break-words whitespace-pre-wrap">{content}</p></div>
      </div>
    )
  }
  const canSubmit = formCard.fields.filter(field => field.required !== false).every(field => (Object.hasOwn(values, field.name) ? values[field.name] : '').trim())
  return (
    <form aria-labelledby={`${id}-title`} onSubmit={event => { event.preventDefault(); if (canSubmit && !disabled) onSubmit(values, note) }} className="overflow-hidden rounded-card bg-surface shadow-card">
      <div className="flex items-center gap-2.5 border-b border-line bg-inset/50 px-5 py-4"><ClipboardList className="size-4 text-brand" aria-hidden="true" /><h3 id={`${id}-title`} className="text-sm font-medium">{formCard.title}</h3></div>
      <fieldset disabled={disabled} className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2 [&>p]:col-span-full [&>div:last-child]:col-span-full">
        {formCard.description && <p className="text-sm text-muted-foreground">{formCard.description}</p>}
        {formCard.fields.map(field => <Field key={field.name} field={field} value={Object.hasOwn(values, field.name) ? values[field.name] : ''} onChange={value => setValues(previous => ({ ...previous, [field.name]: value }))} />)}
        <div className="space-y-2"><Label htmlFor={`${id}-note`} className="text-xs font-medium">Additional context <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id={`${id}-note`} value={note} onChange={event => setNote(event.target.value)} placeholder="Add context or ask a question…" rows={2} maxLength={2000} /></div>
      </fieldset>
      <div className="flex items-center justify-between border-t border-line bg-inset/40 px-4 py-3">
        <Button type="button" variant="ghost" disabled={disabled} onClick={() => onCancel(note)} className="h-9 text-muted-foreground">Cancel</Button>
        <Button type="submit" disabled={!canSubmit || disabled} className="h-9 gap-2">Continue<ArrowUp className="size-3.5" aria-hidden="true" /></Button>
      </div>
    </form>
  )
}
