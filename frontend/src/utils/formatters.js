export function fmtDate(iso, opts) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('he-IL', opts || { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function fmtDateShort(iso) {
  return fmtDate(iso, { day: '2-digit', month: '2-digit' })
}
