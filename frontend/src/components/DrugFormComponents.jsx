import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export const INDICATION_OPTIONS = [
  'יתר לחץ דם', 'סוכרת', 'כולסטרול גבוה', 'אי ספיקת לב', 'פרפור פרוזדורים',
  'מניעת קרישי דם', 'כאב', 'דיכאון / חרדה', 'אפילפסיה', 'תת פעילות בלוטת תריס',
  'רפלוקס / קיבה', 'אוסטאופורוזיס', 'מחלה אוטואימונית', 'אחר',
]

export const FREQUENCY_OPTIONS = [
  'פעם ביום', 'פעמיים ביום', 'שלוש פעמים ביום', 'ארבע פעמים ביום',
  'כל 8 שעות', 'כל 12 שעות', 'פעם בשבוע', 'לפי הצורך (PRN)', 'אחר',
]

// ── Portal for dropdowns inside overflow:hidden / overflow:auto ancestors ─────
export function DropdownPortal({ inputRef, open, children }) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  useEffect(() => {
    if (!open || !inputRef?.current) return
    const r = inputRef.current.getBoundingClientRect()
    setPos({ top: r.bottom, left: r.left, width: r.width })
  }, [open, inputRef])
  if (!open) return null
  return createPortal(
    <div style={{ position: 'fixed', top: pos.top + 4, left: pos.left, width: pos.width, zIndex: 9999 }}>
      {children}
    </div>,
    document.body
  )
}

// ── IndicationCombobox ────────────────────────────────────────────────────────
export function IndicationCombobox({ value, onChange, className = 'input w-full' }) {
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { setQuery(value || '') }, [value])
  useEffect(() => {
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = query.trim()
    ? INDICATION_OPTIONS.filter(o => o.includes(query.trim()))
    : INDICATION_OPTIONS

  return (
    <div ref={wrapRef}>
      <input
        ref={inputRef}
        className={className}
        placeholder="הקלד או בחר התוויה"
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        data-form-type="other"
        name="indication-combobox"
      />
      <DropdownPortal inputRef={inputRef} open={open && filtered.length > 0}>
        <ul className="bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto text-sm">
          {filtered.map(opt => (
            <li key={opt} onMouseDown={() => { setQuery(opt); onChange(opt); setOpen(false) }}
              className="px-4 py-2 cursor-pointer hover:bg-blue-50 border-b border-slate-100 last:border-0">
              {opt}
            </li>
          ))}
        </ul>
      </DropdownPortal>
    </div>
  )
}

// ── DosageCombobox ────────────────────────────────────────────────────────────
export function DosageCombobox({ value, onChange, suggestions, className = 'input w-full' }) {
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { setQuery(value || '') }, [value])
  useEffect(() => {
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = query.trim()
    ? suggestions.filter(s => s.toLowerCase().startsWith(query.toLowerCase().trim()))
    : suggestions

  return (
    <div ref={wrapRef}>
      <input
        ref={inputRef}
        className={className}
        placeholder={suggestions.length > 0 ? `מינון (${suggestions.slice(0, 3).join(' / ')})` : 'מינון (למשל: 10mg)'}
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        data-form-type="other"
        name="dosage-combobox"
      />
      <DropdownPortal inputRef={inputRef} open={open && filtered.length > 0}>
        <ul className="bg-white border border-slate-200 rounded-xl shadow-lg max-h-44 overflow-y-auto text-sm">
          {filtered.map(d => (
            <li key={d} onMouseDown={() => { setQuery(d); onChange(d); setOpen(false) }}
              className="px-4 py-2.5 cursor-pointer hover:bg-blue-50 border-b border-slate-100 last:border-0 font-medium text-slate-700">
              {d}
            </li>
          ))}
        </ul>
      </DropdownPortal>
    </div>
  )
}
