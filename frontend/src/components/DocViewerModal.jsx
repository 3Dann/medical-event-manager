import React, { useState, useEffect, useRef, useCallback } from 'react'

const PDF_TYPES   = ['application/pdf']
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

function isPdf(t)   { return PDF_TYPES.includes(t) }
function isImage(t) { return IMAGE_TYPES.includes(t) }
function canView(t) { return isPdf(t) || isImage(t) }

export default function DocViewerModal({ viewUrl, dlUrl, fileName, fileType, onClose }) {
  const [status, setStatus]   = useState('loading')
  const [blobUrl, setBlobUrl] = useState(null)
  const [errMsg, setErrMsg]   = useState('')
  const iframeRef  = useRef(null)
  const mountedRef = useRef(true)

  // ESC — useCapture כדי לתפוס לפני ה-iframe
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [onClose])

  useEffect(() => {
    mountedRef.current = true
    setStatus('loading')
    setBlobUrl(null)
    setErrMsg('')

    const token = localStorage.getItem('token') || ''

    fetch(viewUrl, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (!r.ok) throw new Error(
          r.status === 404 ? 'הקובץ לא נמצא. יש להעלות את המסמך מחדש.' : `שגיאת שרת (${r.status})`
        )
        return r.blob()
      })
      .then(blob => {
        if (!mountedRef.current) return
        setBlobUrl(URL.createObjectURL(blob))
        setStatus('ready')
      })
      .catch(e => {
        if (!mountedRef.current) return
        setErrMsg(e.message || 'שגיאה בטעינת המסמך')
        setStatus('error')
      })

    return () => {
      mountedRef.current = false
      setBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    }
  }, [viewUrl])

  const handlePrint = useCallback(() => {
    if (!blobUrl) return
    if (isPdf(fileType) && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print()
    } else {
      const win = window.open('', '_blank')
      if (!win) return
      win.document.write(`<html><head><title>${fileName}</title>
        <style>body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;}
        img{max-width:100%;max-height:100vh;object-fit:contain;}</style></head>
        <body><img src="${blobUrl}" onload="window.print();window.close()"/></body></html>`)
      win.document.close()
    }
  }, [fileType, blobUrl, fileName])

  const handleDownload = useCallback(() => {
    if (!blobUrl) return
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = fileName
    a.click()
  }, [blobUrl, fileName])

  return (
    <>
      {/* רקע — לחיצה עליו סוגרת */}
      <div
        className="fixed inset-0 bg-black/90 z-50"
        onClick={onClose}
      />

      {/* כפתורי שליטה — fixed מעל הכל, תמיד נגישים */}
      <div
        className="fixed top-4 left-4 z-[70] flex items-center gap-2"
        onClick={e => e.stopPropagation()}
      >
        {/* סגור — תמיד נגיש */}
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm shadow-xl transition-all"
          style={{ background: '#ef4444', color: '#fff', border: '2px solid #fff' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
          </svg>
          סגור
        </button>

        {/* הדפסה — נגיש רק אחרי טעינה */}
        {status === 'ready' && (
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm shadow-xl transition-all"
            style={{ background: '#2563eb', color: '#fff', border: '2px solid #fff' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            הדפס
          </button>
        )}

        {/* הורד */}
        {status === 'ready' && (
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm shadow-xl transition-all"
            style={{ background: '#374151', color: '#fff', border: '2px solid rgba(255,255,255,0.3)' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            הורד
          </button>
        )}
      </div>

      {/* שם קובץ */}
      <div
        className="fixed top-4 right-4 z-[70] max-w-xs"
        onClick={e => e.stopPropagation()}
      >
        <p className="text-white text-sm font-medium bg-black/60 px-3 py-2 rounded-lg truncate shadow-xl"
          title={fileName}>
          {fileName}
        </p>
      </div>

      {/* תוכן */}
      <div
        className="fixed z-[60] flex items-center justify-center"
        style={{ inset: '60px 0 28px 0' }}
        onClick={onClose}
      >
        {status === 'loading' && (
          <div className="flex items-center gap-3 text-white text-sm"
            onClick={e => e.stopPropagation()}>
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            טוען מסמך...
          </div>
        )}

        {status === 'error' && (
          <div className="text-center" onClick={e => e.stopPropagation()}>
            <div className="text-5xl mb-4">⚠️</div>
            <p className="text-white font-semibold text-lg mb-6">{errMsg}</p>
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-xl"
              style={{ background: '#ef4444', border: '2px solid #fff' }}
            >
              סגור
            </button>
          </div>
        )}

        {status === 'ready' && blobUrl && isPdf(fileType) && (
          <div className="w-full h-full px-2" onClick={e => e.stopPropagation()}>
            <iframe
              ref={iframeRef}
              src={blobUrl}
              className="w-full h-full border-0 rounded-lg shadow-2xl"
              title={fileName}
            />
          </div>
        )}

        {status === 'ready' && blobUrl && isImage(fileType) && (
          <img
            src={blobUrl}
            alt={fileName}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        )}

        {status === 'ready' && blobUrl && !canView(fileType) && (
          <div className="text-center" onClick={e => e.stopPropagation()}>
            <div className="text-5xl mb-4">📎</div>
            <p className="text-white text-lg font-medium mb-2">{fileName}</p>
            <p className="text-slate-400 text-sm mb-5">תצוגה מקדימה אינה זמינה לסוג קובץ זה</p>
            <button onClick={handleDownload}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-xl inline-flex items-center gap-2"
              style={{ background: '#374151', border: '2px solid rgba(255,255,255,0.3)' }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              הורד קובץ
            </button>
          </div>
        )}
      </div>

      {/* רמז תחתון */}
      <div className="fixed bottom-0 left-0 right-0 z-[70] text-center py-1.5 pointer-events-none">
        <p className="text-slate-400 text-xs">לחץ על הרקע או ESC לסגירה</p>
      </div>
    </>
  )
}

export { canView }
