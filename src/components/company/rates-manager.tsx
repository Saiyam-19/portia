'use client'

import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { AGREED_CHARGES, PORT_IDS, PORT_NAMES, type AgreedRate } from '@/lib/berthwise/agreed-rates'

type Draft = { portId: string; chargeType: string; kind: 'discount' | 'fixed'; percent: string; amount: string; currency: string; note: string }
const EMPTY: Draft = { portId: '', chargeType: '', kind: 'discount', percent: '', amount: '', currency: 'USD', note: '' }
const errorText = (error: unknown) => error instanceof ConvexError ? String((error.data as { message?: string })?.message ?? 'The rate could not be saved.') : 'The rate could not be saved. Check your connection and try again.'
const chargeLabel = (value: string) => AGREED_CHARGES.find(charge => charge.value === value)?.label ?? value
const describe = (rate: AgreedRate) => rate.kind === 'discount' ? `${rate.percent}% off the published rate` : `${rate.currency} ${Number(rate.amount).toLocaleString(rate.currency === 'INR' ? 'en-IN' : 'en-US')} per call`

/** Rates the company has agreed with ports, shown beside the published rates in estimates. */
export default function RatesManager() {
  const rates = useQuery(api.agreedRates.listAgreedRates) as AgreedRate[] | undefined
  const saveRate = useMutation(api.agreedRates.saveAgreedRate)
  const deleteRate = useMutation(api.agreedRates.deleteAgreedRate)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) => setDraft(current => current && { ...current, [key]: value })

  const edit = (rate?: AgreedRate) => {
    setError(''); setNotice(''); setConfirming(null)
    setDraft(rate ? { portId: rate.portId, chargeType: rate.chargeType, kind: rate.kind === 'fixed' ? 'fixed' : 'discount', percent: rate.percent ?? '', amount: rate.amount ?? '', currency: rate.currency ?? 'USD', note: rate.note ?? '' } : EMPTY)
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft || saving) return
    setSaving(true); setError('')
    const rate = draft.kind === 'discount'
      ? { kind: 'discount', portId: draft.portId, chargeType: draft.chargeType, percent: draft.percent, ...(draft.note.trim() ? { note: draft.note } : {}) }
      : { kind: 'fixed', portId: draft.portId, chargeType: draft.chargeType, amount: draft.amount, currency: draft.currency, ...(draft.note.trim() ? { note: draft.note } : {}) }
    try { await saveRate({ rate }); setNotice('Agreed rate saved.'); setDraft(null) }
    catch (caught) { setError(errorText(caught)) }
    finally { setSaving(false) }
  }
  const remove = async (rate: AgreedRate) => {
    try { await deleteRate({ id: rate.id as Id<'agreedRates'> }); setNotice('Agreed rate removed.') }
    catch (caught) { setNotice(errorText(caught)) }
    finally { setConfirming(null) }
  }
  const ready = draft && draft.portId && draft.chargeType && (draft.kind === 'discount' ? draft.percent.trim() : draft.amount.trim())

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-muted-foreground">Enter the rates your company has agreed with a port. Estimates show them beside the published rates, with both totals.</p>
        {!draft && <Button onClick={() => edit()}><Plus aria-hidden="true" />Add an agreed rate</Button>}
      </div>
      {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}

      {draft && (
        <form onSubmit={event => void submit(event)} className="space-y-5 rounded-2xl border border-border bg-card p-5" aria-label="Agreed rate">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rate-port">Port</Label>
              <Select value={draft.portId} onValueChange={set('portId')}>
                <SelectTrigger id="rate-port" className="w-full"><SelectValue placeholder="Choose a port" /></SelectTrigger>
                <SelectContent>{PORT_IDS.map(id => <SelectItem key={id} value={id}>{PORT_NAMES[id]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rate-charge">Charge</Label>
              <Select value={draft.chargeType} onValueChange={set('chargeType')}>
                <SelectTrigger id="rate-charge" className="w-full"><SelectValue placeholder="Choose a charge" /></SelectTrigger>
                <SelectContent>{AGREED_CHARGES.map(charge => <SelectItem key={charge.value} value={charge.value}>{charge.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">What you agreed</legend>
            <RadioGroup value={draft.kind} onValueChange={value => set('kind')(value as Draft['kind'])} className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="discount" id="rate-kind-discount" />A discount</label>
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="fixed" id="rate-kind-fixed" />A fixed amount per call</label>
            </RadioGroup>
          </fieldset>
          {draft.kind === 'discount'
            ? (
              <div className="max-w-48 space-y-1.5">
                <Label htmlFor="rate-percent">Discount (%)</Label>
                <Input id="rate-percent" inputMode="decimal" value={draft.percent} onChange={event => set('percent')(event.target.value)} placeholder="10" />
              </div>
            ) : (
              <div className="flex flex-wrap gap-4">
                <div className="w-48 space-y-1.5">
                  <Label htmlFor="rate-amount">Amount per call</Label>
                  <Input id="rate-amount" inputMode="decimal" value={draft.amount} onChange={event => set('amount')(event.target.value)} placeholder="5000" />
                </div>
                <div className="w-32 space-y-1.5">
                  <Label htmlFor="rate-currency">Currency</Label>
                  <Select value={draft.currency} onValueChange={set('currency')}>
                    <SelectTrigger id="rate-currency" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="INR">INR</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
            )}
          <div className="space-y-1.5">
            <Label htmlFor="rate-note">Note (optional)</Label>
            <Input id="rate-note" value={draft.note} onChange={event => set('note')(event.target.value)} placeholder="e.g. contract 2026-14, valid to March 2027" maxLength={200} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving || !ready}>{saving ? 'Saving…' : 'Save agreed rate'}</Button>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => { setDraft(null); setError('') }}>Cancel</Button>
          </div>
        </form>
      )}

      {rates === undefined
        ? <div role="status" aria-label="Loading your agreed rates" className="space-y-3"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-full" /></div>
        : rates.length === 0
          ? !draft && <p className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-muted-foreground">No agreed rates yet. Estimates use the ports&apos; published rates.</p>
          : (
            <div className="space-y-4">
              {PORT_IDS.filter(id => rates.some(rate => rate.portId === id)).map(id => (
                <section key={id} aria-label={PORT_NAMES[id]}>
                  <h2 className="mb-1.5 text-sm font-medium">{PORT_NAMES[id]}</h2>
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {rates.filter(rate => rate.portId === id).map(rate => (
                      <li key={rate.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p>{chargeLabel(rate.chargeType)}: <span className="font-medium tabular-nums">{describe(rate)}</span></p>
                          {rate.note && <p className="text-xs text-muted-foreground">{rate.note}</p>}
                        </div>
                        {confirming === rate.id
                          ? <span className="inline-flex items-center gap-1"><Button size="sm" variant="destructive" onClick={() => void remove(rate)}>Remove</Button><Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>Keep</Button></span>
                          : <span className="inline-flex gap-1">
                            <Button size="icon-sm" variant="ghost" aria-label={`Edit ${chargeLabel(rate.chargeType)} at ${PORT_NAMES[id]}`} onClick={() => edit(rate)}><Pencil aria-hidden="true" /></Button>
                            <Button size="icon-sm" variant="ghost" aria-label={`Remove ${chargeLabel(rate.chargeType)} at ${PORT_NAMES[id]}`} onClick={() => { setNotice(''); setConfirming(rate.id) }}><Trash2 aria-hidden="true" /></Button>
                          </span>}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
    </div>
  )
}
