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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { FleetShip } from '@/lib/berthwise/fleet'
import { SHIP_TYPES, shipTypeLabel, tradeLabel } from '@/lib/berthwise/ship-labels'

type Draft = { id?: string; name: string; imo: string; grt: string; nrt: string; loa: string; type: string; status: string }
const EMPTY: Draft = { name: '', imo: '', grt: '', nrt: '', loa: '', type: '', status: '' }
const ANY = 'any'
const errorText = (error: unknown) => error instanceof ConvexError ? String((error.data as { message?: string })?.message ?? 'The ship could not be saved.') : 'The ship could not be saved. Check your connection and try again.'
const number = (value?: string) => value ? Number(value).toLocaleString('en-US') : ''

/** Ships a company saves once, from each ship's tonnage certificate. */
export default function FleetManager() {
  const ships = useQuery(api.fleet.listShips) as FleetShip[] | undefined
  const saveShip = useMutation(api.fleet.saveShip)
  const deleteShip = useMutation(api.fleet.deleteShip)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const edit = (ship?: FleetShip) => {
    setError(''); setNotice(''); setConfirming(null)
    setDraft(ship ? { id: ship.id, name: ship.name, imo: ship.imo ?? '', grt: ship.grt, nrt: ship.nrt ?? '', loa: ship.loa ?? '', type: ship.type ?? '', status: ship.status ?? '' } : EMPTY)
  }
  const set = (key: keyof Draft) => (value: string) => setDraft(current => current && { ...current, [key]: value })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft || saving) return
    setSaving(true); setError('')
    const ship = Object.fromEntries(Object.entries({ name: draft.name, imo: draft.imo, grt: draft.grt, nrt: draft.nrt, loa: draft.loa, type: draft.type, status: draft.status })
      .filter(([, value]) => value.trim() !== '' && value !== ANY))
    try {
      await saveShip({ ...(draft.id ? { id: draft.id as Id<'fleetShips'> } : {}), ship })
      setNotice(`${draft.name.trim()} saved.`); setDraft(null)
    } catch (caught) { setError(errorText(caught)) }
    finally { setSaving(false) }
  }
  const remove = async (ship: FleetShip) => {
    try { await deleteShip({ id: ship.id as Id<'fleetShips'> }); setNotice(`${ship.name} removed.`) }
    catch (caught) { setError(errorText(caught)) }
    finally { setConfirming(null) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-muted-foreground">Save each ship once, from its tonnage certificate. When you name the ship in a chat, its details are filled in for you.</p>
        {!draft && <Button onClick={() => edit()}><Plus aria-hidden="true" />Add a ship</Button>}
      </div>

      {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}

      {draft && (
        <form onSubmit={event => void submit(event)} className="space-y-5 rounded-2xl border border-border bg-card p-5" aria-label={draft.id ? `Edit ${draft.name}` : 'Add a ship'}>
          <h2 className="text-sm font-medium">{draft.id ? `Edit ${draft.name}` : 'Add a ship'}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="ship-name" label="Ship name" required value={draft.name} onChange={set('name')} placeholder="MV Ocean Star" />
            <Field id="ship-imo" label="IMO number" value={draft.imo} onChange={set('imo')} placeholder="7 digits" inputMode="numeric" />
            <Field id="ship-grt" label="Gross tonnage (GRT)" required value={draft.grt} onChange={set('grt')} placeholder="32450" inputMode="decimal" />
            <Field id="ship-nrt" label="Net tonnage (NRT)" value={draft.nrt} onChange={set('nrt')} placeholder="Optional" inputMode="decimal" />
            <Field id="ship-loa" label="Length overall (metres)" value={draft.loa} onChange={set('loa')} placeholder="Optional" inputMode="decimal" />
            <div className="space-y-1.5">
              <Label htmlFor="ship-type">Type</Label>
              <Select value={draft.type || ANY} onValueChange={set('type')}>
                <SelectTrigger id="ship-type" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Not set</SelectItem>
                  {SHIP_TYPES.map(type => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ship-trade">Trade</Label>
              <Select value={draft.status || ANY} onValueChange={set('status')}>
                <SelectTrigger id="ship-trade" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Varies by voyage</SelectItem>
                  <SelectItem value="foreign">Foreign-going</SelectItem>
                  <SelectItem value="coastal">Coastal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving || !draft.name.trim() || !draft.grt.trim()}>{saving ? 'Saving…' : 'Save ship'}</Button>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => { setDraft(null); setError('') }}>Cancel</Button>
          </div>
        </form>
      )}

      {ships === undefined
        ? <div role="status" aria-label="Loading your fleet" className="space-y-3"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div>
        : ships.length === 0
          ? !draft && <p className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-muted-foreground">No ships yet. Add your first ship to have its tonnage filled in automatically.</p>
          : (
            <div className="overflow-hidden rounded-xl border border-border">
              <Table aria-label="Your fleet">
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead className="px-4 text-xs">Ship</TableHead>
                    <TableHead className="px-4 text-right text-xs">GRT</TableHead>
                    <TableHead className="px-4 text-right text-xs">NRT</TableHead>
                    <TableHead className="px-4 text-right text-xs">LOA (m)</TableHead>
                    <TableHead className="px-4 text-xs"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ships.map(ship => (
                    <TableRow key={ship.id}>
                      <TableCell className="px-4 py-2.5 whitespace-normal">
                        <p className="font-medium">{ship.name}</p>
                        <p className="text-xs text-muted-foreground">{[ship.imo && `IMO ${ship.imo}`, shipTypeLabel(ship.type), tradeLabel(ship.status)].filter(Boolean).join(' · ') || 'No type or trade saved'}</p>
                      </TableCell>
                      <TableCell className="px-4 py-2.5 text-right tabular-nums">{number(ship.grt)}</TableCell>
                      <TableCell className="px-4 py-2.5 text-right tabular-nums">{number(ship.nrt) || '—'}</TableCell>
                      <TableCell className="px-4 py-2.5 text-right tabular-nums">{ship.loa || '—'}</TableCell>
                      <TableCell className="px-4 py-2.5 text-right">
                        {confirming === ship.id
                          ? <span className="inline-flex items-center gap-1"><Button size="sm" variant="destructive" onClick={() => void remove(ship)}>Remove</Button><Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>Keep</Button></span>
                          : <span className="inline-flex gap-1">
                            <Button size="icon-sm" variant="ghost" aria-label={`Edit ${ship.name}`} onClick={() => edit(ship)}><Pencil aria-hidden="true" /></Button>
                            <Button size="icon-sm" variant="ghost" aria-label={`Remove ${ship.name}`} onClick={() => { setNotice(''); setConfirming(ship.id) }}><Trash2 aria-hidden="true" /></Button>
                          </span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
    </div>
  )
}

function Field({ id, label, value, onChange, required, placeholder, inputMode }: { id: string; label: string; value: string; onChange: (value: string) => void; required?: boolean; placeholder?: string; inputMode?: 'numeric' | 'decimal' }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}{required && <span className="text-muted-foreground"> (required)</span>}</Label>
      <Input id={id} value={value} onChange={event => onChange(event.target.value)} required={required} placeholder={placeholder} inputMode={inputMode} autoComplete="off" />
    </div>
  )
}
