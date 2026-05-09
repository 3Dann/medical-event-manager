import React, { useRef, useEffect, useCallback } from 'react'

const PDF_TYPES   = ['application/pdf']
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

function isPdf(t)   { return PDF_TYPES.includes(t) }
function isImage(t) { return IMAGE_TYPES.includes(t) }
function canView(t) { return isPdf(t) || isImage(t) }

/**
 * DocViewerModal — צפייה והדפסה של מסמכים ישירות מהמערכת.
 *
 * Props:
 *   viewUrl  — URL לצפייה inline (כולל ?token=... לiframe)
 *   dlUrl    — URL להורדה (download endpoint)
 *   fileName — שם הקובץ לכותרת
 *   fileType — MIME type
 *   onClose  — callback לסגירה
 */
export default function DocViewerModal({ viewUrl, dlUrl, fileName, fileType, onClose }) {
  const iframeRef = useRef(null)

  // ESC לסגירה
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const handlePrint = useCallback(() => {
    if (isPdf(fileType)) {
      // פתיחת הקובץ בחלון חדש — הדפדפן יכיל כפתור הדפסה משלו
      window.open(viewUrl, '_blank', 'noopener')
    } else if (isImage(fileType)) {
      const win = window.open('', '_blank')
      if (!win) return
      win.document.write(`<html><head><title>${fileName}</title>
        <style>body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;}
        img{max-width:100%;max-height:100vh;object-fit:contain;}</style></head>
        <body><img src="${viewUrl}" onload="window.print()"/></body></html>`)
      win.document.close()
    }
  }, [fileType, viewUrl, fileName])

  const downloadFile = useCallback(() => {
    const a = document.createElement('a')
    a.href = dlUrl
    a.download = fileName
    // הורדה דרך axios (עם auth header) דרך link מסוג blob
    fetch(dlUrl, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        a.href = url
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      })
  }, [dlUrl, fileName])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/80"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            title="סגור (ESC)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <button
            onClick={downloadFile}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            הורד
          </button>

          {canView(fileType) && (
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              title={isPdf(fileType) ? 'פתח לצפייה/הדפסה בחלון חדש' : 'הדפס'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              הדפס
            </button>
          )}
        </div>

        <p className="text-slate-300 text-sm truncate max-w-sm text-right" title={fileName}>
          {fileName}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isPdf(fileType) && (
          <iframe
            ref={iframeRef}
            src={viewUrl}
            className="w-full h-full border-0 bg-white"
            title={fileName}
          />
        )}

        {isImage(fileType) && (
          <div className="w-full h-full flex items-center justify-center p-4">
            <img
              src={viewUrl}
              alt={fileName}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            />
          </div>
        )}

        {!canView(fileType) && (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center text-white">
              <div className="text-5xl mb-4">📎</div>
              <p className="text-lg font-medium">{fileName}</p>
              <p className="text-slate-400 text-sm mt-2 mb-5">תצוגה מקדימה אינה זמינה לסוג קובץ זה</p>
              <button
                onClick={downloadFile}
                className="btn-primary inline-flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                הורד קובץ
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export { canView }
