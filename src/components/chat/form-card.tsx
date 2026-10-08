'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, ClipboardList } from 'lucide-react'
import type { FormCard as FormCardType, FormField } from './chat-view'

interface Props {
  formCard: FormCardType
  onSubmit: (data: Record<string, string>, note: string) => void
  onCancel: (note: string) => void
}

function Field({
  field,
  value,
  onChange,
}: {
  field: FormField
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-600">
        {field.label}
        {field.required !== false && <span className="text-slate-400 ml-0.5">*</span>}
      </label>

      {field.type === 'radio' && field.options && (
        <div className="flex flex-wrap gap-2">
          {field.options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                value === opt
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {field.type === 'text' && (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder ?? ''}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      )}

      {field.type === 'number' && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder ?? '0'}
            className="w-32 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {field.unit && <span className="text-xs text-slate-500">{field.unit}</span>}
        </div>
      )}

      {field.type === 'textarea' && (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder ?? ''}
          rows={3}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        />
      )}
    </div>
  )
}

export default function FormCard({ formCard, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')

  const setValue = (name: string, v: string) => setValues(prev => ({ ...prev, [name]: v }))

  // Resolved state — show a summary
  if (formCard.response !== null) {
    const { cancelled, content } = formCard.response!
    return (
      <div className="border border-slate-100 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500 flex items-start gap-2.5">
        {cancelled ? (
          <XCircle className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
        )}
        <div>
          <p className="font-medium text-slate-600 mb-1">
            {formCard.title} — {cancelled ? 'cancelled' : 'submitted'}
          </p>
          <pre className="whitespace-pre-wrap font-sans text-slate-500 leading-relaxed">{content}</pre>
        </div>
      </div>
    )
  }

  const canSubmit = formCard.fields
    .filter(f => f.required !== false)
    .every(f => (values[f.name] ?? '').trim())

  return (
    <div className="border border-blue-100 rounded-2xl bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border-b border-blue-100">
        <ClipboardList className="w-4 h-4 text-blue-500 shrink-0" />
        <span className="text-sm font-semibold text-blue-800">{formCard.title}</span>
      </div>

      {/* Fields */}
      <div className="px-4 py-4 space-y-4">
        {formCard.fields.map(field => (
          <Field
            key={field.name}
            field={field}
            value={values[field.name] ?? ''}
            onChange={v => setValue(field.name, v)}
          />
        ))}

        {/* Chat about this */}
        <div className="space-y-1.5 pt-1">
          <label className="block text-xs font-medium text-slate-500">
            Chat about this <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Add context or ask a question…"
            rows={2}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-100">
        <button
          type="button"
          onClick={() => onCancel(note)}
          className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onSubmit(values, note)}
          className="px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Submit →
        </button>
      </div>
    </div>
  )
}
