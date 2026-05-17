/**
 * Auth setup — מתחבר פעם אחת ושומר את ה-token ל-localStorage.
 * כל שאר הטסטים משתמשים ב-storageState הזה.
 */
const { test: setup, expect } = require('@playwright/test')
const path = require('path')

const AUTH_FILE = path.join(__dirname, '.auth.json')

setup('authenticate', async ({ page }) => {
  const email    = process.env.E2E_EMAIL    || 'e2e@careflow.test'
  const password = process.env.E2E_PASSWORD || 'E2eTest2026!'

  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  // פתח modal כניסה
  const loginBtn = page.locator('button', { hasText: /כניסה/ }).first()
  await loginBtn.waitFor({ timeout: 10_000 })
  await loginBtn.click()

  // מלא פרטים
  await page.locator('input[type="email"], input[type="text"]').first().fill(email)
  await page.locator('input[type="password"]').first().fill(password)
  await page.locator('button[type="submit"]').click()

  // המתן לניווט לdashboard
  await page.waitForURL('**/manager**', { timeout: 15_000 })

  // שמור auth state
  await page.context().storageState({ path: AUTH_FILE })
  console.log('✅ Auth saved to', AUTH_FILE)
})
