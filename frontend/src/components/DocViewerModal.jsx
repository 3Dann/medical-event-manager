import React, { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'

const PDF_TYPES  = ['application/pdf']
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

function isPdf(fileType)   { return PDF_TYPES.includes(fileType) }
function isImage(fileType) { return IMAGE_TYPES.includes(fileType) }
function canView(fileType) { return isPdf(fileType) || isImage(fileType) }

/**
 * DocViewerModal — צפייה והדפסה של מסמכים ישירות מהמערכת.
 *
 * Props:
 *   fetchUrl   — URL לשליפת הקובץ (עם auth header, ללא token בURL)
 *   fileName   — שם הקובץ לכותרת
 *   fileType   — MIME type
 *   onClose    — callback לסגירה
 *
 * שימוש:
 *   <DocViewerModal fetchUrl="/api/patients/1/documents/5/download"
 *                   fileName="אבחון.pdf" fileType="application/pdf"
 *                   onClose={() => setViewing(null)} />
 */
export default function DocViewerModal({ fetchUrl, fileName, fileType, onClose }) {
  const [blobUrl, setBlobUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const iframeRef = useRef(null)

  // fetch with auth → blob URL
  useEffect(() => {
    let objectUrl = null
    axios.get(fetchUrl, { responseType: 'blob' })
      .then(res => {
        objectUrl = URL.createObjectURL(res.data)
        setBlobUrl(objectUrl)
      })
      .catch(() => setError('שגיאה בטעינת המסמך'))
      .finally(() => setLoading(false))

    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [fetchUrl])

  // ESC לסגירה
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handlePrint = useCallback(() => {
    if (isPdf(fileType) && iframeRef.current) {
      iframeRef.current.contentWindow?.print()
    } else if (isImage(fileType) && blobUrl) {
      const win = window.open('', '_blank')
      win.document.write(`
        <html><head><title>${fileName}</title>
        <style>body{margin:0;display:flex;justify-content:center;}img{max-width:100%;}</style>
        </head><body><img src="${blobUrl}" onload="window.print();window.close()"/></body></html>
      `)
      win.document.close()
    }
  }, [fileType, blobUrl, fileName])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/70"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-800 flex-shrink-0">
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

          {blobUrl && (
            <>
              <a
                href={blobUrl}
                download={fileName}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors"
                title="הורד"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                הורד
              </a>

              {(isPdf(fileType) || isImage(fileType)) && (
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  title="הדפס"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  הדפס
                </button>
              )}
            </>
          )}
        </div>

        <p className="text-slate-300 text-sm truncate max-w-xs text-right" title={fileName}>
          {fileName}
        </p>
      </div>

      {/* content */}
      <div className="flex-1 overflow-hidden flex items-center justify-center p-2">
        {loading && (
          <div className="text-white text-sm flex items-center gap-2">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            טוען מסמך...
          </div>
        )}

        {error && (
          <div className="text-red-400 text-sm bg-red-900/30 px-6 py-4 rounded-xl">{error}</div>
        )}

        {blobUrl && isPdf(fileType) && (
          <iframe
            ref={iframeRef}
            src={blobUrl}
            className="w-full h-full rounded-lg bg-white"
            title={fileName}
          />
        )}

        {blobUrl && isImage(fileType) && (
          <img
            src={blobUrl}
            alt={fileName}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          />
        )}

        {blobUrl && !canView(fileType) && (
          <div className="text-center text-white">
            <div className="text-5xl mb-4">📎</div>
            <p className="text-lg font-medium">{fileName}</p>
            <p className="text-slate-400 text-sm mt-2 mb-4">תצוגה מקדימה אינה זמינה לסוג קובץ זה</p>
            <a
              href={blobUrl}
              download={fileName}
              className="btn-primary inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              הורד קובץ
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

export { canView }
