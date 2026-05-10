import { useState, useEffect, useCallback } from 'react'
import DocViewerModal from '../../components/DocViewerModal'
import AppToast from '../../components/AppToast'
import { useToast } from '../../hooks/useToast'

const TOKEN = () => localStorage.getItem('token')
const AUTH  = () => ({ Authorization: `Bearer ${TOKEN()}` })

function fmt_size(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fmt_date(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

// ── Report type card ────────────────────────────────────────────────────────
function ReportCard({ title, description, icon, onGenerate, generating }) {
  const [patients, setPatients] = useState([])
  const [selected, setSelected] = useState('')
  const [search, setSearch]     = useState('')
  const [open, setOpen]         = useState(false)

  useEffect(() => {
    fetch('/api/patients', { headers: AUTH() })
      .then(r => r.json())
      .then(data => setPatients(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  const filtered = patients.filter(p =>
    !search || p.full_name?.includes(search)
  )

  const selectedPatient = patients.find(p => p.id === +selected)

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
          <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icon} />
          </svg>
        </div>
        <div className="flex-1 text-right">
          <h3 className="font-bold text-slate-800 text-base">{title}</h3>
          <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>

      {/* Patient selector */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-slate-600 text-right">בחר מטופל</label>
        <div className="relative">
          <button
            onClick={() => setOpen(o => !o)}
            className="w-full text-right border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 hover:bg-white transition-colors flex items-center justify-between gap-2"
          >
            <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            <span className={selectedPatient ? 'text-slate-800 font-medium' : 'text-slate-600'}>
              {selectedPatient ? selectedPatient.full_name : 'בחר מטופל...'}
            </span>
          </button>

          {open && (
            <div className="absolute top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-64 overflow-hidden flex flex-col">
              <div className="p-2 border-b border-slate-100">
                <input
                  autoFocus
                  className="w-full text-right px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
                  placeholder="חיפוש לפי שם..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="overflow-y-auto flex-1">
                {filtered.length === 0 ? (
                  <p className="text-center text-slate-600 text-sm py-4">לא נמצאו מטופלים</p>
                ) : (
                  filtered.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setSelected(String(p.id)); setOpen(false); setSearch('') }}
                      className={`w-full text-right px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors
                        ${selected === String(p.id) ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'}`}
                    >
                      {p.full_name}
                      {p.diagnosis_details && (
                        <span className="text-xs text-slate-600 mr-2">{p.diagnosis_details}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={() => selected && onGenerate(+selected)}
        disabled={!selected || generating}
        className="w-full py-2.5 text-sm font-semibold rounded-xl transition-all
          bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed
          flex items-center justify-center gap-2"
      >
        {generating ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            מייצר דוח...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            הפק דוח PDF
          </>
        )}
      </button>
    </div>
  )
}

// ── Recent reports list ─────────────────────────────────────────────────────
function RecentReports({ reports, onDownload, onView }) {
  if (reports.length === 0) {
    return (
      <div className="text-center py-12 text-slate-600 text-sm">
        <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        טרם הופקו דוחות במערכת
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {reports.map(doc => (
        <div key={doc.id}
          className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex items-center justify-between gap-4 hover:border-blue-200 transition-colors">
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => onView(doc)}
              className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              צפייה
            </button>
            <button
              onClick={() => onDownload(doc.id)}
              className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              הורד
            </button>
            <span className="text-xs text-slate-600">{fmt_size(doc.file_size)}</span>
          </div>

          <div className="flex-1 min-w-0 text-right">
            <p className="font-medium text-sm text-slate-800 truncate">{doc.original_name}</p>
            <div className="flex items-center gap-3 justify-end mt-0.5">
              {doc.patient_name && (
                <span className="text-xs text-blue-600">{doc.patient_name}</span>
              )}
              <span className="text-xs text-slate-600">{fmt_date(doc.created_at)}</span>
            </div>
          </div>

          <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
      ))}
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [recent, setRecent]         = useState([])
  const [generating, setGenerating] = useState(null)
  const [viewingDoc, setViewingDoc] = useState(null)

  const loadRecent = useCallback(async () => {
    try {
      const r = await fetch('/api/reports/recent', { headers: AUTH() })
      if (r.ok) setRecent(await r.json())
    } catch (_) {}
  }, [])

  useEffect(() => { loadRecent() }, [loadRecent])

  const generate = async (reportType, patientId) => {
    setGenerating(reportType)
    try {
      const r = await fetch(
        `/api/patients/${patientId}/reports/${reportType}`,
        { headers: AUTH() },
      )
      if (!r.ok) throw new Error(await r.text())

      const blob = await r.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${reportType}-${patientId}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      loadRecent()
    } catch (e) {
      alert('שגיאה בייצור הדוח. בדוק שהמטופל מכיל נתוני מפה פיננסית.')
    } finally {
      setGenerating(null)
    }
  }

  const download = async (docId) => {
    window.open(`/api/documents/${docId}/download?token=${TOKEN()}`, '_blank')
  }

  return (
    <div className="p-4 md:p-6 space-y-8 max-w-4xl mx-auto">
      {viewingDoc && (
        <DocViewerModal
          viewUrl={`/api/patients/${viewingDoc.patient_id}/documents/${viewingDoc.id}/download`}
          dlUrl={`/api/patients/${viewingDoc.patient_id}/documents/${viewingDoc.id}/download`}
          fileName={viewingDoc.original_name}
          fileType="application/pdf"
          onClose={() => setViewingDoc(null)}
        />
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 text-right">דוחות</h1>
        <p className="text-sm text-slate-500 mt-1 text-right">
          הפק דוחות PDF מפורטים לכל מטופל — הדוחות נשמרים אוטומטית בלשונית המסמכים של המטופל
        </p>
      </div>

      {/* Report types */}
      <div>
        <h2 className="text-sm font-semibold text-slate-600 mb-3 text-right uppercase tracking-wide">
          סוגי דוחות זמינים
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          <ReportCard
            title="מפה פיננסית ומימון המסע"
            description="דוח מפורט: כל הכיסויים הביטוחיים לפי מקור, עלויות לפי שלב מסע, מקורות מימון נוספים, ופערים. מיועד למטופל וגם למנהל האירוע."
            icon="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            generating={generating === 'financial-map'}
            onGenerate={(patientId) => generate('financial-map', patientId)}
          />

          {/* Placeholder for future reports */}
          <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-6 flex items-center justify-center">
            <div className="text-center text-slate-600">
              <svg className="w-10 h-10 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium">דוחות נוספים בקרוב</p>
              <p className="text-xs mt-1">סיכום מטופל, תביעות, תרופות</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent reports */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={loadRecent}
            className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            רענן
          </button>
          <h2 className="text-sm font-semibold text-slate-600 text-right uppercase tracking-wide">
            דוחות אחרונים
          </h2>
        </div>
        <RecentReports reports={recent} onDownload={download} onView={setViewingDoc} />
      </div>

    </div>
  )
}
