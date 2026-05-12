export function fmtDate(iso, opts) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('he-IL', opts || { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function fmtDateShort(iso) {
  return fmtDate(iso, { day: '2-digit', month: '2-digit' })
}

export function fmtCurrency(n, fallback = '—') {
  if (n == null) return fallback
  return `₪${Math.round(n).toLocaleString('he-IL')}`
}

export function fmtPercent(n) {
  if (n == null) return '—'
  return `${Math.round(n)}%`
}
