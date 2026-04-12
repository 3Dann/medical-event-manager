import React, { useState, useEffect, useRef, useCallback } from 'react'

const GOV_API = 'https://data.gov.il/api/3/action/datastore_search'
const CITIES_RESOURCE = '5c78e9fa-c2e2-4771-93ff-7f400a12f7ba'
const STREETS_RESOURCE = 'a7296d1a-f8c9-4b70-96c2-6ebb4352f8e3'

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ── City autocomplete ─────────────────────────────────────────────────────────

export function CityAutocomplete({ value, cityCode, onChange, required, error }) {
  const [input, setInput] = useState(value || '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounced = useDebounce(input, 300)
  const ref = useRef()

  // Sync external value changes
  useEffect(() => { setInput(value || '') }, [value])

  useEffect(() => {
    if (!debounced || debounced.length < 1) { setResults([]); return }
    // Don't search if already selected
    if (debounced === value) return
    setLoading(true)
    fetch(`${GOV_API}?resource_id=${CITIES_RESOURCE}&q=${encodeURIComponent(debounced)}&limit=10`)
      .then(r => r.json())
      .then(data => {
        const records = data?.result?.records || []
        setResults(records.map(r => ({
          name: r['שם_ישוב']?.trim(),
          code: String(r['סמל_ישוב'] || ''),
        })).filter(r => r.name))
        setOpen(true)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [debounced])

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (city) => {
    setInput(city.name)
    setOpen(false)
    onChange(city.name, city.code)
  }

  return (
    <div ref={ref} className="relative">
      <input
        className={`w-full border rounded-lg px-3 py-2 text-sm ${error ? 'border-red-400' : 'border-slate-300'}`}
        value={input}
        placeholder="הקלד שם עיר..."
        onChange={e => { setInput(e.target.value); if (!e.target.value) onChange('', '') }}
        onFocus={() => results.length > 0 && setOpen(true)}
        required={required}
        autoComplete="off"
      />
      {loading && <span className="absolute left-3 top-2.5 text-xs text-slate-400">...</span>}
      {open && results.length > 0 && (
        <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
          {results.map(city => (
            <li
              key={city.code}
              onMouseDown={() => select(city)}
              className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer"
            >
              {city.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Street autocomplete ───────────────────────────────────────────────────────

async function fetchPostalCode(city, street) {
  try {
    const q = encodeURIComponent(`${street}, ${city}, ישראל`)
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&countrycodes=il&format=json&addressdetails=1&limit=1`, {
      headers: { 'Accept-Language': 'he' }
    })
    const data = await res.json()
    return data?.[0]?.address?.postcode || ''
  } catch {
    return ''
  }
}

export function StreetAutocomplete({ value, cityCode, cityName, onChange, onPostalCode, required, error, disabled }) {
  const [input, setInput] = useState(value || '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounced = useDebounce(input, 300)
  const ref = useRef()

  useEffect(() => { setInput(value || '') }, [value])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setInput(''); setResults([]); onChange('') }, [cityCode])

  useEffect(() => {
    if (!debounced || debounced.length < 1 || !cityCode) { setResults([]); return }
    if (debounced === value) return
    setLoading(true)
    const filters = JSON.stringify({ 'סמל_ישוב': cityCode })
    fetch(`${GOV_API}?resource_id=${STREETS_RESOURCE}&filters=${encodeURIComponent(filters)}&q=${encodeURIComponent(debounced)}&limit=15`)
      .then(r => r.json())
      .then(data => {
        const records = data?.result?.records || []
        setResults(records.map(r => r['שם_רחוב']?.trim()).filter(Boolean))
        setOpen(true)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [debounced, cityCode])

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <input
        className={`w-full border rounded-lg px-3 py-2 text-sm ${error ? 'border-red-400' : 'border-slate-300'} ${disabled ? 'bg-slate-50 text-slate-400' : ''}`}
        value={input}
        placeholder={disabled ? 'בחר עיר תחילה' : 'הקלד שם רחוב...'}
        onChange={e => { setInput(e.target.value); if (!e.target.value) onChange('') }}
        onFocus={() => results.length > 0 && setOpen(true)}
        required={required}
        disabled={disabled}
        autoComplete="off"
      />
      {loading && <span className="absolute left-3 top-2.5 text-xs text-slate-400">...</span>}
      {open && results.length > 0 && (
        <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
          {results.map(street => (
            <li
              key={street}
              onMouseDown={() => {
            setInput(street)
            setOpen(false)
            onChange(street)
            if (onPostalCode && cityName) {
              fetchPostalCode(cityName, street).then(zip => { if (zip) onPostalCode(zip) })
            }
          }}
              className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer"
            >
              {street}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
