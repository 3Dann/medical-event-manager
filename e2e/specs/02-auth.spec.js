/**
 * טסט 2 — אימות
 * בודק שכניסה עם test user עובדת ומגיעים ל-dashboard.
 */
const { test, expect } = require('@playwright/test')

test.use({ storageState: { cookies: [], origins: [] } }) // fresh login

test('login with valid credentials reaches dashboard', async ({ page }) => {
  const email    = process.env.E2E_EMAIL    || 'e2e@careflow.test'
  const password = process.env.E2E_PASSWORD || 'E2eTest2026!'

  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  // פתח modal
  await page.locator('button', { hasText: /כניסה/ }).first().click()
  await page.waitForSelector('input[type="password"]', { timeout: 8_000 })

  // מלא פרטים
  await page.locator('input[type="email"], input[type="text"]').first().fill(email)
  await page.locator('input[type="password"]').first().fill(password)
  await page.locator('button[type="submit"]').click()

  // מגיעים לdashboard
  await page.waitForURL('**/manager**', { timeout: 15_000 })
  expect(page.url()).toContain('/manager')
})

test('wrong password shows error', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  await page.locator('button', { hasText: /כניסה/ }).first().click()
  await page.waitForSelector('input[type="password"]', { timeout: 8_000 })

  await page.locator('input[type="email"], input[type="text"]').first().fill('e2e@careflow.test')
  await page.locator('input[type="password"]').first().fill('WrongPassword123!')
  await page.locator('button[type="submit"]').click()

  // שגיאה מוצגת, לא מתנווטים
  await expect(page.locator('[class*="red"], [class*="error"]').first()).toBeVisible({ timeout: 8_000 })
  expect(page.url()).not.toContain('/manager')
})
