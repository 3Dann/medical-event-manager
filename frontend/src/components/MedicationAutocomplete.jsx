import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'

function DropdownPortal({ inputRef, open, children }) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })

  useEffect(() => {
    if (!open || !inputRef.current) return
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

export default function MedicationAutocomplete({
  value, onChange, onDosagesAvailable,
  placeholder = 'שם תרופה *', className = '',
}) {
  const [query, setQuery] = useState(value || '')
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { setQuery(value || '') }, [value])

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleChange = (e) => {
    const val = e.target.value
    setQuery(val)
    onChange({ name: val, generic_name: null, common_dosages: [] })
    if (onDosagesAvailable) onDosagesAvailable([])
    clearTimeout(debounceRef.current)
    if (val.length < 2) { setSuggestions([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await axios.get('/api/medications/search', { params: { q: val } })
        setSuggestions(res.data)
        setOpen(res.data.length > 0)
      } catch {
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }, 300)
  }

  const handleSelect = (drug) => {
    setQuery(drug.name)
    onChange(drug)
    if (onDosagesAvailable) onDosagesAvailable(drug.common_dosages || [])
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="search"
        className={`${className || 'border border-slate-300 rounded-lg px-3 py-2 text-sm w-full'} [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden`}
        placeholder={placeholder}
        value={query}
        onChange={handleChange}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        data-lpignore="true"
        data-form-type="other"
        name="med-drug-search"
        role="combobox"
        aria-autocomplete="list"
      />
      {loading && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">טוען...</span>
      )}
      <DropdownPortal inputRef={inputRef} open={open && suggestions.length > 0}>
        <ul className="bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto text-sm">
          {suggestions.map((d, i) => (
            <li
              key={i}
              onMouseDown={() => handleSelect(d)}
              className="px-4 py-2.5 cursor-pointer hover:bg-blue-50 border-b border-slate-100 last:border-0"
            >
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-medium text-slate-800">{d.name}</span>
                {d.hebrew_name && <span className="font-medium text-blue-700">{d.hebrew_name}</span>}
              </div>
              <div className="text-xs text-slate-400 mt-0.5 flex gap-2 flex-wrap">
                {d.generic_name && <span>{d.generic_name}</span>}
                {d.dosage_form && <span>· {d.dosage_form}</span>}
                {d.common_dosages?.length > 0 && (
                  <span className="text-slate-300">· {d.common_dosages.slice(0, 4).join(', ')}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </DropdownPortal>
    </div>
  )
}
