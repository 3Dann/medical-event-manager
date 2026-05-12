import { fmtDate, fmtDateShort } from './formatters'

describe('fmtDate', () => {
  test('formats a valid ISO date string', () => {
    const result = fmtDate('2026-05-12T10:00:00')
    expect(result).toMatch(/\d{2}.\d{2}.\d{4}/)
  })

  test('returns empty string for null', () => {
    expect(fmtDate(null)).toBe('')
  })

  test('returns empty string for undefined', () => {
    expect(fmtDate(undefined)).toBe('')
  })

  test('returns empty string for empty string', () => {
    expect(fmtDate('')).toBe('')
  })
})

describe('fmtDateShort', () => {
  test('formats a valid ISO date without year', () => {
    const result = fmtDateShort('2026-05-12T10:00:00')
    expect(result).toMatch(/\d{2}.\d{2}/)
    expect(result).not.toMatch(/2026/)
  })

  test('returns empty string for null', () => {
    expect(fmtDateShort(null)).toBe('')
  })
})
