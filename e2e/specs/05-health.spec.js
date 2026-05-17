/**
 * טסט 5 — API Health & Critical Endpoints
 * בודק שה-backend עולה ומגיב תקין.
 */
const { test, expect } = require('@playwright/test')

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173'
const API_BASE = BASE_URL.replace(':5173', ':8000').replace(':5174', ':8000')

test('API health check returns ok', async ({ request }) => {
  const res = await request.get(`${BASE_URL}/api/health`)
  expect(res.status()).toBe(200)

  const body = await res.json()
  expect(body.status).toBe('ok')
  expect(body.db).toBe('ok')
})

test('frontend serves index.html', async ({ request }) => {
  const res = await request.get(BASE_URL)
  expect(res.status()).toBe(200)

  const html = await res.text()
  expect(html).toContain('CareFlow')
  expect(html).toContain('<div id="root">')
})

test('auth login endpoint accepts POST', async ({ request }) => {
  // רק בודק שהendpoint קיים ומחזיר 4xx (לא 404/500)
  const params = new URLSearchParams()
  params.append('username', 'nonexistent@test.com')
  params.append('password', 'wrongpassword')

  const res = await request.post(`${BASE_URL}/api/auth/login`, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data:    params.toString(),
  })

  // 401 = endpoint קיים ועובד (פשוט credentials שגויים)
  expect([401, 400, 422]).toContain(res.status())
})

test('no unhandled 500 errors on main pages', async ({ page }) => {
  const errors500 = []

  page.on('response', response => {
    if (response.status() >= 500) {
      errors500.push(`${response.status()} ${response.url()}`)
    }
  })

  await page.goto('/manager')
  await page.waitForLoadState('networkidle', { timeout: 15_000 })

  expect(errors500).toHaveLength(0)
})
