/**
 * טסט 2 — אימות
 * כניסה דרך ה-UI מחייבת 2FA (by design).
 * הטסטים בודקים שה-flow מגיב נכון.
 */
const { test, expect } = require('@playwright/test')

test.use({ storageState: { cookies: [], origins: [] } })

test('valid credentials show 2FA screen', async ({ page }) => {
  const email    = process.env.E2E_EMAIL    || 'e2e@careflow.test'
  const password = process.env.E2E_PASSWORD || 'E2eTest2026!'

  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  await page.locator('button', { hasText: /כניסה/ }).first().click()
  await page.waitForSelector('input[type="password"]', { timeout: 8_000 })

  await page.locator('input[type="email"], input[type="text"]').first().fill(email)
  await page.locator('input[type="password"]').first().fill(password)
  await page.locator('button[type="submit"]').click()

  // המערכת מחייבת 2FA — צריך לראות מסך בחירת שיטה
  await expect(
    page.locator('text=/אימות דו|2FA|שלח קוד|שיטה|זהותך/')
  ).toBeVisible({ timeout: 10_000 })
})

test('wrong password shows error', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  await page.locator('button', { hasText: /כניסה/ }).first().click()
  await page.waitForSelector('input[type="password"]', { timeout: 8_000 })

  await page.locator('input[type="email"], input[type="text"]').first().fill('e2e@careflow.test')
  await page.locator('input[type="password"]').first().fill('WrongPassword123!')
  await page.locator('button[type="submit"]').click()

  // שגיאה מוצגת, לא מגיעים ל-2FA
  await expect(
    page.locator('[class*="red"], [class*="error"], p.text-red').first()
  ).toBeVisible({ timeout: 8_000 })
})

test('authenticated user reaches dashboard directly', async ({ page }) => {
  // טסט זה מאמת שה-storageState עם token עובד
  await page.goto('/manager')
  await page.waitForLoadState('networkidle', { timeout: 15_000 })

  // אם יש auth — נשארים ב-manager
  // אם אין — מופנים ל-login
  const url = page.url()
  expect(url).toContain('/manager')
})
