import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { LANDING_DEFAULTS, getLandingOverrides } from '../../components/LandingEditor'

// ── Feature meta (visual-only, not editable) ──────────────────────────────────
const FEATURE_META = [
  { id: 'journey',    color: 'from-blue-500 to-blue-600',       ring: 'border-blue-200',    text: 'text-blue-700'    },
  { id: 'doctors',    color: 'from-emerald-500 to-emerald-600', ring: 'border-emerald-200', text: 'text-emerald-700' },
  { id: 'insurance',  color: 'from-violet-500 to-violet-600',   ring: 'border-violet-200',  text: 'text-violet-700'  },
  { id: 'strategy',   color: 'from-amber-500 to-amber-600',     ring: 'border-amber-200',   text: 'text-amber-700'   },
  { id: 'responsive', color: 'from-rose-500 to-rose-600',       ring: 'border-rose-200',    text: 'text-rose-700'    },
  { id: 'security',   color: 'from-slate-600 to-slate-700',     ring: 'border-slate-200',   text: 'text-slate-700'   },
]

// ── Inline input components ───────────────────────────────────────────────────
// Dark bg (hero / CTA) — transparent, white text, subtle bottom border only
function DarkInput({ value, onChange, className = '', placeholder = '' }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`bg-transparent border-0 border-b border-white/30 focus:border-white outline-none text-white placeholder-white/40 w-full transition-colors ${className}`}
    />
  )
}

function DarkTextarea({ value, onChange, className = '', placeholder = '' }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = ref.current.scrollHeight + 'px'
    }
  }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={1}
      className={`bg-transparent border-0 border-b border-white/30 focus:border-white outline-none text-white placeholder-white/40 w-full resize-none overflow-hidden transition-colors ${className}`}
    />
  )
}

// Light bg (steps / features) — transparent, slate-800 text, subtle bottom border
function LightInput({ value, onChange, className = '', placeholder = '' }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`bg-transparent border-0 border-b border-slate-200 focus:border-blue-500 outline-none text-slate-800 placeholder-slate-300 w-full transition-colors ${className}`}
    />
  )
}

function LightTextarea({ value, onChange, className = '', placeholder = '' }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = ref.current.scrollHeight + 'px'
    }
  }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={1}
      className={`bg-transparent border-0 border-b border-slate-200 focus:border-blue-500 outline-none text-slate-800 placeholder-slate-300 w-full resize-none overflow-hidden transition-colors ${className}`}
    />
  )
}

// ── Main editor page ─────────────────────────────────────────────────────────
export default function LandingEditorPage() {
  const navigate = useNavigate()
  const [draft, setDraft] = useState(() => getLandingOverrides())
  const [saved, setSaved] = useState(() => getLandingOverrides())
  const [status, setStatus] = useState(null) // null | 'saving' | 'saved' | 'error'

  // Load from backend on mount
  useEffect(() => {
    axios.get('/api/settings/landing').then(res => {
      const data = res.data
      if (data && Object.keys(data).length > 0) {
        const merged = { ...LANDING_DEFAULTS, ...data }
        setDraft(merged)
        setSaved(merged)
      }
    }).catch(() => {})
  }, [])

  const isDirty = JSON.stringify(draft) !== JSON.stringify(saved)

  async function save() {
    setStatus('saving')
    try {
      await axios.put('/api/settings/landing', draft)
      localStorage.setItem('landing_overrides', JSON.stringify(draft))
      window.dispatchEvent(new Event('landing_overrides_changed'))
      setSaved(draft)
      setStatus('saved')
    } catch {
      setStatus('error')
    }
    setTimeout(() => setStatus(null), 2500)
  }

  function cancel() {
    setDraft(saved)
  }

  // ── Draft mutation helpers ──
  const set = (key, val) => setDraft(d => ({ ...d, [key]: val }))

  const setStat = (i, field, val) =>
    setDraft(d => ({ ...d, stats: d.stats.map((s, idx) => idx === i ? { ...s, [field]: val } : s) }))

  const setStep = (i, field, val) =>
    setDraft(d => ({ ...d, steps: d.steps.map((s, idx) => idx === i ? { ...s, [field]: val } : s) }))

  const setFeature = (i, field, val) =>
    setDraft(d => ({ ...d, features: d.features.map((f, idx) => idx === i ? { ...f, [field]: val } : f) }))

  const setFeaturePoint = (fi, pi, val) =>
    setDraft(d => ({
      ...d,
      features: d.features.map((f, idx) =>
        idx === fi ? { ...f, points: f.points.map((p, pidx) => pidx === pi ? val : p) } : f
      )
    }))

  return (
    <div className="min-h-screen bg-white" dir="rtl">

      {/* ── Sticky save bar ── */}
      <div className="sticky top-0 z-50 bg-amber-500 text-white px-4 py-3 flex items-center gap-3 shadow-lg flex-wrap">
        <span className="font-bold text-sm flex items-center gap-1.5">
          <span>✏️</span>
          <span>עורך דף נחיתה</span>
        </span>

        <div className="flex-1" />

        {/* Status indicator */}
        {status === 'saved' && (
          <span className="text-xs bg-white/20 px-2 py-1 rounded-full">✓ נשמר בהצלחה</span>
        )}
        {status === 'error' && (
          <span className="text-xs bg-red-600/80 px-2 py-1 rounded-full">⚠ שגיאה בשמירה</span>
        )}
        {isDirty && status === null && (
          <span className="text-xs bg-white/20 px-2 py-1 rounded-full">יש שינויים שלא נשמרו</span>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={cancel}
            disabled={!isDirty}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 disabled:opacity-40 transition-colors font-medium"
          >
            ביטול שינויים
          </button>
          <button
            onClick={save}
            disabled={status === 'saving' || !isDirty}
            className="text-xs px-4 py-1.5 rounded-lg bg-white text-amber-600 font-bold hover:bg-amber-50 disabled:opacity-50 transition-colors"
          >
            {status === 'saving' ? 'שומר...' : 'שמור'}
          </button>
          <button
            onClick={() => navigate('/manager/admin')}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors font-medium flex items-center gap-1"
          >
            <span>חזרה</span>
            <span>←</span>
          </button>
        </div>
      </div>

      {/* ── Hero section ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-bl from-blue-600 via-blue-700 to-slate-800" />
        <div className="absolute top-10 left-10 w-72 h-72 bg-blue-500 rounded-full opacity-20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-slate-600 rounded-full opacity-20 blur-3xl pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-6 py-24 text-center">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-white/10 text-blue-100 text-sm px-4 py-1.5 rounded-full mb-6 border border-white/20 max-w-sm mx-auto">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse flex-shrink-0" />
            <DarkInput
              value={draft.heroBadge}
              onChange={v => set('heroBadge', v)}
              className="text-sm text-blue-100"
              placeholder="תגית"
            />
          </div>

          {/* Title */}
          <div className="mb-6">
            <DarkInput
              value={draft.heroTitle}
              onChange={v => set('heroTitle', v)}
              className="text-4xl sm:text-5xl md:text-6xl font-bold leading-tight text-center"
              placeholder="כותרת ראשית"
            />
          </div>

          {/* Subtitle */}
          <div className="max-w-2xl mx-auto mb-10">
            <DarkTextarea
              value={draft.heroSubtitle}
              onChange={v => set('heroSubtitle', v)}
              className="text-lg sm:text-xl leading-relaxed text-blue-100 text-center"
              placeholder="תת-כותרת"
            />
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-3 gap-6 max-w-lg mx-auto">
            {draft.stats.map((s, i) => (
              <div key={i} className="text-center">
                <DarkInput
                  value={s.val}
                  onChange={v => setStat(i, 'val', v)}
                  className="text-3xl font-bold text-white text-center"
                  placeholder="ערך"
                />
                <DarkInput
                  value={s.label}
                  onChange={v => setStat(i, 'label', v)}
                  className="text-blue-200 text-xs mt-0.5 text-center"
                  placeholder="תיאור"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Wave */}
        <svg viewBox="0 0 1440 60" className="w-full block" preserveAspectRatio="none" style={{ height: 60 }}>
          <path d="M0,60 C360,0 1080,0 1440,60 L1440,60 L0,60 Z" fill="white" />
        </svg>
      </section>

      {/* ── Steps section ── */}
      <section className="py-16 max-w-5xl mx-auto px-6">
        <p className="text-center text-blue-600 font-semibold text-sm uppercase tracking-widest mb-2">איך זה עובד</p>
        <div className="text-center mb-12">
          <LightInput
            value={draft.stepsTitle}
            onChange={v => set('stepsTitle', v)}
            className="text-3xl font-bold text-slate-800 text-center"
            placeholder="כותרת שלבים"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {draft.steps.map((step, i) => (
            <div key={i} className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white text-xl font-bold flex items-center justify-center mx-auto mb-4 shadow-md select-none">
                {step.num}
              </div>
              <div className="mb-2">
                <LightInput
                  value={step.title}
                  onChange={v => setStep(i, 'title', v)}
                  className="font-bold text-slate-800 text-lg text-center"
                  placeholder="כותרת שלב"
                />
              </div>
              <LightTextarea
                value={step.desc}
                onChange={v => setStep(i, 'desc', v)}
                className="text-slate-500 text-sm leading-relaxed text-center"
                placeholder="תיאור שלב"
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── Features section ── */}
      <section className="py-16 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-center text-blue-600 font-semibold text-sm uppercase tracking-widest mb-2">תכונות המערכת</p>
          <div className="text-center mb-12">
            <LightInput
              value={draft.featuresTitle}
              onChange={v => set('featuresTitle', v)}
              className="text-3xl font-bold text-slate-800 text-center"
              placeholder="כותרת תכונות"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {draft.features.map((f, fi) => {
              const meta = FEATURE_META[fi] || FEATURE_META[0]
              return (
                <div key={f.id} className={`bg-white rounded-2xl border ${meta.ring} p-6 hover:shadow-md transition-shadow`}>
                  {/* Icon (not editable) */}
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${meta.color} flex items-center justify-center text-2xl mb-4 shadow-sm select-none`}>
                    {f.icon}
                  </div>

                  {/* Title */}
                  <div className="mb-2">
                    <LightInput
                      value={f.title}
                      onChange={v => setFeature(fi, 'title', v)}
                      className={`text-lg font-bold ${meta.text}`}
                      placeholder="כותרת תכונה"
                    />
                  </div>

                  {/* Desc */}
                  <div className="mb-4">
                    <LightTextarea
                      value={f.desc}
                      onChange={v => setFeature(fi, 'desc', v)}
                      className="text-slate-500 text-sm leading-relaxed"
                      placeholder="תיאור תכונה"
                    />
                  </div>

                  {/* Bullet points */}
                  <ul className="space-y-1.5">
                    {f.points.map((p, pi) => (
                      <li key={pi} className="flex items-center gap-2 text-xs text-slate-600">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 bg-gradient-to-br ${meta.color}`} />
                        <LightInput
                          value={p}
                          onChange={v => setFeaturePoint(fi, pi, v)}
                          className="text-xs text-slate-600 flex-1"
                          placeholder="נקודה"
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── CTA section ── */}
      <section className="py-20 bg-gradient-to-bl from-blue-600 to-slate-800 text-center">
        <div className="max-w-2xl mx-auto px-6">
          <div className="mb-4">
            <DarkInput
              value={draft.ctaTitle}
              onChange={v => set('ctaTitle', v)}
              className="text-3xl font-bold text-white text-center"
              placeholder="כותרת CTA"
            />
          </div>
          <div className="mb-8">
            <DarkTextarea
              value={draft.ctaSubtitle}
              onChange={v => set('ctaSubtitle', v)}
              className="text-blue-200 text-lg text-center"
              placeholder="תת-כותרת CTA"
            />
          </div>
        </div>
      </section>

      {/* ── Footer preview ── */}
      <footer className="bg-slate-900 text-slate-400 py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-center">
          <p className="text-xs text-slate-500">תצוגת תחתית — Orly Medical © {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  )
}
