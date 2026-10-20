'use client'

import { useId, useState } from 'react'
import { ArrowUp, CheckCircle2, XCircle, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { FormCard as FormCardType, FormField } from './chat-view'
import { FORM_VALUE_MAX_CHARS } from '@/lib/migration/contracts'

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
        <Textarea id={id} required={required} maxLength={FORM_VALUE_MAX_CHARS} value={value} onChange={event => onChange(event.target.value)} placeholder={field.placeholder ?? ''} rows={3} aria-describedby={`${id}-limit`} />
      ) : (
        <div className="flex items-center gap-2">
          <Input id={id} required={required} maxLength={FORM_VALUE_MAX_CHARS} type={field.type === 'number' ? 'number' : 'text'} step={field.type === 'number' ? 'any' : undefined} value={value} onChange={event => onChange(event.target.value)} placeholder={field.placeholder ?? ''} aria-describedby={[field.unit ? `${id}-unit` : '',`${id}-limit`].filter(Boolean).join(' ')} className="h-10" />
          {field.unit && <span id={`${id}-unit`} className="shrink-0 text-xs text-muted-foreground">{field.unit}</span>}
        </div>
      )}
      {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
      {field.type!=='radio'&&<p id={`${id}-limit`} className="text-xs text-muted-foreground">Up to {FORM_VALUE_MAX_CHARS.toLocaleString('en-US')} characters.</p>}
    </div>
  )
}

export default function FormCard({ formCard, disabled = false, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [validationError,setValidationError]=useState('')
  const id = useId()
  if (formCard.response !== null) {
    const { cancelled, content, reason } = formCard.response
    const status = reason ? reason[0].toUpperCase() + reason.slice(1) : cancelled ? 'Cancelled' : 'Submitted'
    return (
      <div className="flex items-start gap-3 rounded-xl bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
        {cancelled ? <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />}
        <div className="min-w-0"><p className="mb-1 font-medium text-foreground">{formCard.title} · {status}</p><p className="leading-relaxed break-words whitespace-pre-wrap">{content}</p></div>
      </div>
    )
  }
  const lengthError=formCard.fields.find(field=>(Object.hasOwn(values,field.name)?values[field.name]:'').length>FORM_VALUE_MAX_CHARS)
  const noteTooLong=note.length>FORM_VALUE_MAX_CHARS
  const canSubmit = !lengthError&&!noteTooLong&&formCard.fields.filter(field => field.required !== false).every(field => (Object.hasOwn(values, field.name) ? values[field.name] : '').trim())
  return (
    <form aria-labelledby={`${id}-title`} onSubmit={event => { event.preventDefault(); if (canSubmit && !disabled) {setValidationError('');onSubmit(values, note)} }} className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2.5 px-5 pt-5"><ClipboardList className="size-4 text-brand" aria-hidden="true" /><h3 id={`${id}-title`} className="text-sm font-medium">{formCard.title}</h3></div>
      <fieldset disabled={disabled} className="space-y-5 p-5">
        {formCard.description && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{formCard.description}</p>}
        {formCard.fields.map(field => <Field key={field.name} field={field} value={Object.hasOwn(values, field.name) ? values[field.name] : ''} onChange={value => setValues(previous => ({ ...previous, [field.name]: value }))} />)}
        <div className="space-y-2"><Label htmlFor={`${id}-note`} className="text-xs font-medium">Additional context <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id={`${id}-note`} value={note} onChange={event => {setNote(event.target.value);setValidationError('')}} placeholder="Add context or ask a question…" rows={2} maxLength={FORM_VALUE_MAX_CHARS} /></div>
        {(lengthError||noteTooLong||validationError)&&<p role="alert" className="text-sm text-destructive">{validationError||`${lengthError?.label??'Additional context'} must be ${FORM_VALUE_MAX_CHARS.toLocaleString('en-US')} characters or fewer.`}</p>}
      </fieldset>
      <div className="flex items-center justify-between border-t border-border/70 px-4 py-3">
        <Button type="button" variant="ghost" disabled={disabled} onClick={() => {if(noteTooLong){setValidationError('Shorten additional context to 2,000 characters before cancelling.');return}onCancel(note)}} className="h-9 text-muted-foreground">Cancel</Button>
        <Button type="submit" disabled={!canSubmit || disabled} className="h-9 gap-2">Continue<ArrowUp className="size-3.5" aria-hidden="true" /></Button>
      </div>
    </form>
  )
}
