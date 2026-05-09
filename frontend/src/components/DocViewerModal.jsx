import React, { useState, useEffect, useRef, useCallback } from 'react'

const PDF_TYPES   = ['application/pdf']
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

function isPdf(t)   { return PDF_TYPES.includes(t) }
function isImage(t) { return IMAGE_TYPES.includes(t) }
function canView(t) { return isPdf(t) || isImage(t) }

/**
 * DocViewerModal — צפייה והדפסה של מסמכים.
 *
 * Props:
 *   viewUrl  — /api/.../view?token=... (inline)
 *   dlUrl    — /api/.../download (attachment)
 *   fileName — שם הקובץ
 *   fileType — MIME type
 *   onClose  — callback לסגירה
 */
export default function DocViewerModal({ viewUrl, dlUrl, fileName, fileType, onClose }) {
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [blobUrl, setBlobUrl] = useState(null)
  const [errMsg, setErrMsg]   = useState('')
  const iframeRef = useRef(null)
  const mountedRef = useRef(true)

  // ESC לסגירה — תמיד על window, לא תלוי ב-iframe
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h, true) // useCapture=true → לפני ה-iframe
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
        if (!r.ok) {
          const msg = r.status === 404
            ? 'הקובץ לא נמצא בשרת. יש להעלות את המסמך מחדש.'
            : `שגיאת שרת (${r.status})`
          throw new Error(msg)
        }
        return r.blob()
      })
      .then(blob => {
        if (!mountedRef.current) return
        const url = URL.createObjectURL(blob)
        setBlobUrl(url)
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
      // תמונה או fallback — חלון הדפסה נפרד
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
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80">

      {/* Toolbar — תמיד נגיש */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            סגור
          </button>

          {status === 'ready' && (
            <>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                הורד
              </button>

              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                הדפס
              </button>
            </>
          )}
        </div>

        <p className="text-slate-300 text-sm truncate max-w-sm text-right" title={fileName}>
          {fileName}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex items-center justify-center">

        {status === 'loading' && (
          <div className="text-white text-sm flex items-center gap-3">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            טוען מסמך...
          </div>
        )}

        {status === 'error' && (
          <div className="text-center px-8">
            <div className="text-5xl mb-4">⚠️</div>
            <p className="text-white font-semibold text-lg mb-2">{errMsg}</p>
            <button
              onClick={onClose}
              className="mt-4 px-5 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm transition-colors"
            >
              סגור
            </button>
          </div>
        )}

        {status === 'ready' && blobUrl && isPdf(fileType) && (
          <iframe
            ref={iframeRef}
            src={blobUrl}
            className="w-full h-full border-0"
            title={fileName}
          />
        )}

        {status === 'ready' && blobUrl && isImage(fileType) && (
          <div className="w-full h-full flex items-center justify-center p-4">
            <img
              src={blobUrl}
              alt={fileName}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            />
          </div>
        )}

        {status === 'ready' && blobUrl && !canView(fileType) && (
          <div className="text-center text-white">
            <div className="text-5xl mb-4">📎</div>
            <p className="text-lg font-medium mb-2">{fileName}</p>
            <p className="text-slate-400 text-sm mb-5">תצוגה מקדימה אינה זמינה לסוג קובץ זה</p>
            <button onClick={handleDownload} className="btn-primary inline-flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              הורד קובץ
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export { canView }
