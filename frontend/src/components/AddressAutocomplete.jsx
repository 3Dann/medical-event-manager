import React, { useState, useEffect, useRef } from 'react'

const GOV_API = 'https://data.gov.il/api/3/action/datastore_search'
const CITIES_RESOURCE  = '5c78e9fa-c2e2-4771-93ff-7f400a12f7ba'
const STREETS_RESOURCE = 'a7296d1a-f8c9-4b70-96c2-6ebb4352f8e3'

// Module-level cache — loaded once per session
let _citiesCache = null
let _citiesLoading = false
const _citiesListeners = []

function loadCities() {
  if (_citiesCache) return Promise.resolve(_citiesCache)
  if (_citiesLoading) return new Promise(r => _citiesListeners.push(r))
  _citiesLoading = true
  return fetch(`${GOV_API}?resource_id=${CITIES_RESOURCE}&limit=1500`)
    .then(r => r.json())
    .then(data => {
      _citiesCache = (data?.result?.records || [])
        .map(r => ({ name: r['שם_ישוב']?.trim(), code: String(r['סמל_ישוב'] || '') }))
        .filter(r => r.name)
        .sort((a, b) => a.name.localeCompare(b.name, 'he'))
      _citiesListeners.forEach(r => r(_citiesCache))
      return _citiesCache
    })
    .catch(() => { _citiesLoading = false; return [] })
}

// ── City autocomplete ─────────────────────────────────────────────────────────

export function CityAutocomplete({ value, onChange, required, error }) {
  const [input, setInput]     = useState(value || '')
  const [allCities, setAll]   = useState(_citiesCache || [])
  const [open, setOpen]       = useState(false)
  const ref = useRef()

  useEffect(() => { setInput(value || '') }, [value])

  useEffect(() => {
    if (!_citiesCache) loadCities().then(setAll)
  }, [])

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = input.length > 0
    ? allCities.filter(c => c.name.startsWith(input) || c.name.includes(input)).slice(0, 12)
    : []

  return (
    <div ref={ref} className="relative">
      <input
        className={`w-full border rounded-lg px-3 py-2 text-sm ${error ? 'border-red-400' : 'border-slate-300'}`}
        value={input}
        placeholder="הקלד שם עיר..."
        onChange={e => {
          const v = e.target.value
          setInput(v)
          setOpen(v.length > 0)
          if (!v) onChange('', '')
        }}
        onFocus={() => filtered.length > 0 && setOpen(true)}
        required={required}
        autoComplete="off"
      />
      {!_citiesCache && input.length > 0 && (
        <span className="absolute left-3 top-2.5 text-xs text-slate-400">טוען...</span>
      )}
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
          {filtered.map(city => (
            <li
              key={city.code}
              onMouseDown={() => { setInput(city.name); setOpen(false); onChange(city.name, city.code) }}
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

export function StreetAutocomplete({ value, cityCode, onChange, onPostalCode, required, error, disabled }) {
  const [input, setInput]       = useState(value || '')
  const [allStreets, setStreets] = useState([])
  const [loadingStreets, setLoadingStreets] = useState(false)
  const [open, setOpen]         = useState(false)
  const ref = useRef()

  useEffect(() => { setInput(value || '') }, [value])

  // Load all streets for city once when city changes
  useEffect(() => {
    setInput('')
    setStreets([])
    onChange('')
    if (!cityCode) return
    setLoadingStreets(true)
    const filters = encodeURIComponent(JSON.stringify({ 'סמל_ישוב': Number(cityCode) }))
    fetch(`${GOV_API}?resource_id=${STREETS_RESOURCE}&filters=${filters}&limit=500`)
      .then(r => r.json())
      .then(data => {
        const recs = data?.result?.records || []
        setStreets(
          recs.map(r => r['שם_רחוב']?.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, 'he'))
        )
      })
      .catch(() => {})
      .finally(() => setLoadingStreets(false))
  }, [cityCode])

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = input.length > 0
    ? allStreets.filter(s => s.startsWith(input) || s.includes(input)).slice(0, 15)
    : []

  return (
    <div ref={ref} className="relative">
      <input
        className={`w-full border rounded-lg px-3 py-2 text-sm ${error ? 'border-red-400' : 'border-slate-300'} ${disabled ? 'bg-slate-50 text-slate-400' : ''}`}
        value={input}
        placeholder={disabled ? 'בחר עיר תחילה' : loadingStreets ? 'טוען רחובות...' : 'הקלד שם רחוב...'}
        onChange={e => {
          const v = e.target.value
          setInput(v)
          onChange(v)
          setOpen(v.length > 0 && allStreets.length > 0)
        }}
        onFocus={() => filtered.length > 0 && setOpen(true)}
        required={required}
        disabled={disabled || loadingStreets}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
          {filtered.map(street => (
            <li
              key={street}
              onMouseDown={() => { setInput(street); setOpen(false); onChange(street) }}
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
