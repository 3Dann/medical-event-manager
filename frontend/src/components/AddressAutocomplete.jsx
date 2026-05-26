import React, { useState, useEffect, useRef } from 'react'

// Module-level cache
let _citiesCache = null
let _citiesLoading = false
const _citiesListeners = []

function loadCities() {
  if (_citiesCache) return Promise.resolve(_citiesCache)
  if (_citiesLoading) return new Promise(r => _citiesListeners.push(r))
  _citiesLoading = true
  return fetch('/api/address/cities')
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
    .then(data => {
      _citiesCache = (data.records || []).sort((a, b) => a.name.localeCompare(b.name, 'he'))
      _citiesListeners.forEach(r => r(_citiesCache))
      _citiesListeners.length = 0
      return _citiesCache
    })
    .catch(() => {
      _citiesLoading = false
      _citiesListeners.forEach(r => r([]))
      _citiesListeners.length = 0
      return []
    })
}

async function fetchPostalCode(cityName, streetName) {
  try {
    const params = new URLSearchParams({ city: cityName, street: streetName })
    const res = await fetch(`/api/address/postal-code?${params}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.postal_code ?? null
  } catch { return null }
}

// ── City autocomplete ─────────────────────────────────────────────────────────

export function CityAutocomplete({ value, cityCode, onChange, required, error }) {
  const [input, setInput]   = useState(value || '')
  const [allCities, setAll] = useState(_citiesCache || [])
  const [loading, setLoad]  = useState(false)
  const [loadErr, setErr]   = useState(false)
  const [open, setOpen]     = useState(false)
  const ref = useRef()

  useEffect(() => { setInput(value || '') }, [value])

  useEffect(() => {
    if (_citiesCache) return
    setLoad(true)
    loadCities().then(cities => {
      setAll(cities)
      setLoad(false)
      setErr(cities.length === 0)
    })
  }, [])

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = input.length > 0
    ? allCities.filter(c => c.name.includes(input)).slice(0, 15)
    : []

  const placeholder = loadErr ? 'שגיאה בטעינת ישובים — הקלד שם עיר ידנית'
    : loading ? 'טוען ישובים...'
    : 'הקלד שם עיר...'

  const handleChange = (v) => {
    setInput(v)
    setOpen(v.length > 0)
    onChange(v, '')
  }

  const handleBlur = () => {
    const trimmed = input.trim()
    if (trimmed) {
      // Try exact match first
      const exact = allCities.find(c => c.name === trimmed)
      if (exact) {
        onChange(exact.name, exact.code)
      } else {
        // Accept as manual entry — no city_code
        onChange(trimmed, '')
      }
    }
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <input
        className={`w-full border rounded-lg px-3 py-2 text-sm ${error ? 'border-red-400' : 'border-slate-300'} ${loadErr ? 'bg-yellow-50' : ''}`}
        value={input}
        placeholder={placeholder}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => filtered.length > 0 && setOpen(true)}
        onBlur={handleBlur}
        required={required}
        autoComplete="off"
      />
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
      {/* Manual entry hint when no match found */}
      {open && input.length > 1 && filtered.length === 0 && allCities.length > 0 && (
        <div className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 px-3 py-2 text-sm text-slate-500">
          לא נמצא ברשימה — הערך יישמר כהכנסה ידנית
        </div>
      )}
    </div>
  )
}

// ── Street autocomplete ───────────────────────────────────────────────────────

export function StreetAutocomplete({ value, cityCode, cityName, onChange, onPostalCode, required, error, disabled }) {
  const [input, setInput]       = useState(value || '')
  const [allStreets, setStreets] = useState([])
  const [loading, setLoad]      = useState(false)
  const [loadErr, setErr]       = useState(false)
  const [loadingZip, setZip]    = useState(false)
  const [open, setOpen]         = useState(false)
  const ref = useRef()
  const abortRef = useRef()
  const selectedStreetRef = useRef(null)

  useEffect(() => { setInput(value || '') }, [value])

  useEffect(() => {
    abortRef.current?.abort()
    setInput('')
    setStreets([])
    setErr(false)
    onChange('')
    onPostalCode?.('')
    if (!cityCode) return

    abortRef.current = new AbortController()
    setLoad(true)
    fetch(`/api/address/streets?city_code=${Number(cityCode)}`, { signal: abortRef.current.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(data => {
        const streets = (data.records || []).sort((a, b) => a.name.localeCompare(b.name, 'he'))
        setStreets(streets)
        // loadErr only if city was selected but API returned nothing
        setErr(streets.length === 0 && !!cityCode)
      })
      .catch(e => { if (e.name !== 'AbortError') setErr(true) })
      .finally(() => setLoad(false))
  }, [cityCode])

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = input.length > 0
    ? allStreets.filter(s => s.name.includes(input)).slice(0, 20)
    : []

  const noMatch = input.length > 1 && allStreets.length > 0 && filtered.length === 0

  const selectStreet = async (street) => {
    setInput(street.name)
    setOpen(false)
    onChange(street.name)
    selectedStreetRef.current = street.name
    if (onPostalCode && cityName && street.name) {
      setZip(true)
      const zip = await fetchPostalCode(cityName, street.name)
      setZip(false)
      if (zip && selectedStreetRef.current === street.name) onPostalCode(String(zip))
    }
  }

  const placeholder = disabled ? 'בחר עיר תחילה'
    : loadErr ? 'שגיאה בטעינת רחובות — הקלד ידנית'
    : loading ? 'טוען רחובות...'
    : 'הקלד שם רחוב...'

  // Allow manual entry when: no city selected (no cityCode), API error, or city entered manually
  const isManualMode = !cityCode || loadErr

  return (
    <div ref={ref} className="relative">
      <input
        className={`w-full border rounded-lg px-3 py-2 text-sm ${error ? 'border-red-400' : 'border-slate-300'} ${disabled ? 'bg-slate-50 text-slate-400' : ''}`}
        value={input}
        placeholder={placeholder}
        onChange={e => {
          const v = e.target.value
          setInput(v)
          onChange(v)
          onPostalCode?.('')
          selectedStreetRef.current = null
          setOpen(v.length > 0 && allStreets.length > 0 && !isManualMode)
        }}
        onFocus={() => filtered.length > 0 && setOpen(true)}
        onBlur={() => {
          const trimmed = input.trim()
          if (trimmed && allStreets.length > 0) {
            const exact = allStreets.find(s => s.name === trimmed)
            if (exact) selectStreet(exact)
          }
        }}
        required={required}
        disabled={disabled || loading}
        autoComplete="off"
      />
      {loadingZip && (
        <span className="absolute right-3 top-2.5 text-xs text-blue-400">מאתר מיקוד...</span>
      )}
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
          {filtered.map(street => (
            <li
              key={street.code}
              onMouseDown={() => selectStreet(street)}
              className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer"
            >
              {street.name}
            </li>
          ))}
        </ul>
      )}
      {/* No match hint — manual entry is accepted */}
      {noMatch && !open && (
        <p className="mt-1 text-xs text-slate-500">לא נמצא ברשימה — הערך יישמר כהכנסה ידנית</p>
      )}
      {/* Manual mode hint */}
      {isManualMode && !disabled && (
        <p className="mt-1 text-xs text-slate-400">הכנסה ידנית</p>
      )}
    </div>
  )
}
