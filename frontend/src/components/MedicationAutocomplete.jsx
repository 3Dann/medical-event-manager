import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'

export default function MedicationAutocomplete({ value, onChange, placeholder = 'שם תרופה *', className = '' }) {
  const [query, setQuery] = useState(value || '')
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)
  const containerRef = useRef(null)

  // Sync external value changes
  useEffect(() => { setQuery(value || '') }, [value])

  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleChange = (e) => {
    const val = e.target.value
    setQuery(val)
    onChange({ name: val, generic_name: null })
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
    }, 350)
  }

  const handleSelect = (drug) => {
    setQuery(drug.name)
    onChange(drug)
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        className={className || 'border border-slate-300 rounded-lg px-3 py-2 text-sm w-full'}
        placeholder={placeholder}
        value={query}
        onChange={handleChange}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        autoComplete="off"
      />
      {loading && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">טוען...</span>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 right-0 left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto text-sm">
          {suggestions.map((d, i) => (
            <li
              key={i}
              onMouseDown={() => handleSelect(d)}
              className="px-4 py-2.5 cursor-pointer hover:bg-blue-50 border-b border-slate-100 last:border-0"
            >
              <span className="font-medium text-slate-800">{d.name}</span>
              {d.generic_name && <span className="text-slate-400 text-xs mr-2">({d.generic_name})</span>}
              {d.dosage_form && <span className="text-slate-400 text-xs mr-1">· {d.dosage_form}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
