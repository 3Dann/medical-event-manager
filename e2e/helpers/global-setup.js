/**
 * Global setup — מתחבר לפרודקשן ושומר auth state לפני כל ריצת טסטים.
 */
const { chromium } = require('@playwright/test')
const path = require('path')
const fs   = require('fs')

const AUTH_FILE = path.join(__dirname, '.auth.json')

module.exports = async function globalSetup() {
  const BASE_URL = process.env.BASE_URL || 'http://localhost:5173'
  const email    = process.env.E2E_EMAIL    || 'e2e@careflow.test'
  const password = process.env.E2E_PASSWORD || 'E2eTest2026!'

  console.log(`\n🔐 E2E Setup: logging in as ${email} on ${BASE_URL}`)

  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page    = await context.newPage()

  try {
    await page.goto(BASE_URL, { timeout: 20_000 })
    await page.waitForLoadState('domcontentloaded')

    // פתח modal כניסה
    const loginBtn = page.locator('button', { hasText: /כניסה/ }).first()
    await loginBtn.waitFor({ timeout: 15_000 })
    await loginBtn.click()

    // מלא פרטים
    await page.locator('input[type="email"], input[type="text"]').first().fill(email)
    await page.locator('input[type="password"]').first().fill(password)
    await page.locator('button[type="submit"]').click()

    // המתן לניווט
    await page.waitForURL('**/manager**', { timeout: 20_000 })
    console.log('✅ Login successful, URL:', page.url())

    // שמור auth state
    await context.storageState({ path: AUTH_FILE })
    console.log('💾 Auth state saved to', AUTH_FILE)

  } catch (err) {
    console.error('❌ Auth setup failed:', err.message)
    // שמור screenshot לדיבאג
    await page.screenshot({ path: path.join(__dirname, 'setup-error.png') })
    throw err
  } finally {
    await browser.close()
  }
}
