import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'

/**
 * Two-level condition tag selector.
 * Props:
 *   value     — string[] of selected tag keys
 *   onChange  — (keys: string[]) => void
 */
export default function ConditionTagsSelector({ value = [], onChange }) {
  const [groups, setGroups]       = useState([])   // [{category, category_he, tags:[{key,label_he}]}]
  const [search, setSearch]       = useState('')
  const [open, setOpen]           = useState(false)
  const [newLabel, setNewLabel]   = useState('')
  const [newCat, setNewCat]       = useState('')
  const [adding, setAdding]       = useState(false)
  const ref = useRef()

  useEffect(() => {
    axios.get('/api/workflows/condition-tags')
      .then(r => setGroups(r.data))
      .catch(() => {})
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // All tags flat
  const allTags = groups.flatMap(g => g.tags.map(t => ({ ...t, category_he: g.category_he, category: g.category })))

  // Filter by search
  const filtered = search.trim()
    ? allTags.filter(t => t.label_he.includes(search) || t.key.includes(search))
    : null   // null = show grouped

  const toggle = (key) => {
    if (value.includes(key)) onChange(value.filter(k => k !== key))
    else onChange([...value, key])
  }

  const selectedTags = allTags.filter(t => value.includes(t.key))

  const handleAddNew = async () => {
    if (!newLabel.trim() || !newCat) return
    try {
      const catGroup = groups.find(g => g.category === newCat)
      await axios.post('/api/workflows/condition-tags', {
        key:         newLabel.trim().toLowerCase().replace(/\s+/g, '_'),
        label_he:    newLabel.trim(),
        category:    newCat,
        category_he: catGroup?.category_he || newCat,
      })
      // Refresh
      const r = await axios.get('/api/workflows/condition-tags')
      setGroups(r.data)
      setNewLabel('')
      setNewCat('')
      setAdding(false)
    } catch (e) {
      alert('שגיאה בהוספת תגית')
    }
  }

  return (
    <div ref={ref} className="relative">
      {/* Selected tags chips */}
      <div
        className="input min-h-[42px] flex flex-wrap gap-1.5 cursor-pointer"
        onClick={() => setOpen(v => !v)}
      >
        {selectedTags.length === 0 && (
          <span className="text-slate-400 text-sm self-center">בחר אבחנות / מצב רפואי...</span>
        )}
        {selectedTags.map(t => (
          <span key={t.key}
            className="flex items-center gap-1 bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full"
            onClick={e => { e.stopPropagation(); toggle(t.key) }}>
            {t.label_he}
            <span className="text-blue-400 hover:text-blue-700 cursor-pointer">✕</span>
          </span>
        ))}
        <span className="mr-auto text-slate-400 text-sm self-center">{open ? '▲' : '▼'}</span>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full mt-1 right-0 left-0 bg-white border border-slate-200 rounded-xl shadow-xl max-h-80 overflow-y-auto">
          {/* Search */}
          <div className="p-2 border-b border-slate-100 sticky top-0 bg-white">
            <input
              className="input text-sm py-1.5"
              placeholder="חפש אבחנה..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
              autoFocus
            />
          </div>

          {/* Flat search results */}
          {filtered ? (
            <div className="p-2 space-y-1">
              {filtered.length === 0 ? (
                <div className="text-slate-400 text-sm text-center py-3">לא נמצא — ניתן להוסיף</div>
              ) : filtered.map(t => (
                <button key={t.key} onClick={() => toggle(t.key)}
                  className={`w-full text-right px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center justify-between
                    ${value.includes(t.key) ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'}`}>
                  <span className="text-xs text-slate-400">{t.category_he}</span>
                  <span>{t.label_he}</span>
                  {value.includes(t.key) && <span className="text-blue-500 mr-2">✓</span>}
                </button>
              ))}
            </div>
          ) : (
            /* Grouped view */
            <div className="p-2 space-y-3">
              {groups.map(g => (
                <div key={g.category}>
                  <p className="text-xs font-semibold text-slate-500 px-2 mb-1">{g.category_he}</p>
                  <div className="flex flex-wrap gap-1.5 px-1">
                    {g.tags.map(t => (
                      <button key={t.key} onClick={() => toggle(t.key)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors
                          ${value.includes(t.key)
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'}`}>
                        {t.label_he}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add new tag */}
          <div className="border-t border-slate-100 p-2">
            {!adding ? (
              <button onClick={() => setAdding(true)}
                className="w-full text-sm text-blue-600 hover:underline text-right py-1">
                + הוסף אבחנה שאינה ברשימה
              </button>
            ) : (
              <div className="space-y-2">
                <input className="input text-sm py-1.5" placeholder="שם האבחנה בעברית"
                  value={newLabel} onChange={e => setNewLabel(e.target.value)} />
                <select className="input text-sm py-1.5" value={newCat} onChange={e => setNewCat(e.target.value)}>
                  <option value="">— בחר קטגוריה —</option>
                  {groups.map(g => <option key={g.category} value={g.category}>{g.category_he}</option>)}
                </select>
                <div className="flex gap-2">
                  <button onClick={handleAddNew} className="btn-primary text-xs py-1 flex-1">הוסף</button>
                  <button onClick={() => setAdding(false)} className="btn-secondary text-xs py-1 flex-1">ביטול</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
