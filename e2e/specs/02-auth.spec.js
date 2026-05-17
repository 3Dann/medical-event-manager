/**
 * טסט 2 — אימות
 * כניסה דרך UI מחייבת 2FA (by design).
 */
const { test, expect } = require('@playwright/test')

test.use({ storageState: { cookies: [], origins: [] } })

test('valid credentials show 2FA screen', async ({ page }) => {
  const email    = process.env.E2E_EMAIL    || 'e2e@careflow.test'
  const password = process.env.E2E_PASSWORD || 'E2eTest2026!'

  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(2000) // angular init

  await page.locator('button', { hasText: /כניסה/ }).first().click()

  // המתן לmodal
  const modal = page.locator('[class*="modal"], [class*="fixed"][class*="inset"]').first()
  await modal.waitFor({ timeout: 8_000 })

  // מלא בתוך המودל
  const emailInput = modal.locator('input[type="email"], input[type="text"]').first()
  await emailInput.waitFor({ timeout: 5_000 })
  await emailInput.fill(email)

  const pwInput = modal.locator('input[type="password"]').first()
  await pwInput.fill(password)

  await modal.locator('button[type="submit"]').click()

  // המתן ל-2FA screen (המערכת תמיד דורשת 2FA)
  await expect(
    page.locator('text=אימות').or(page.locator('text=2FA')).or(page.locator('text=קוד'))
  ).toBeVisible({ timeout: 15_000 })
})

test('wrong password shows error', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(2000)

  await page.locator('button', { hasText: /כניסה/ }).first().click()

  const modal = page.locator('[class*="modal"], [class*="fixed"][class*="inset"]').first()
  await modal.waitFor({ timeout: 8_000 })

  const emailInput = modal.locator('input[type="email"], input[type="text"]').first()
  await emailInput.waitFor({ timeout: 5_000 })
  await emailInput.fill('e2e@careflow.test')

  await modal.locator('input[type="password"]').first().fill('WrongPassword123!')
  await modal.locator('button[type="submit"]').click()

  // שגיאת credentials מוצגת
  await expect(
    page.locator('p.text-red-500, [class*="red"]').first()
  ).toBeVisible({ timeout: 10_000 })
})

test('authenticated user stays on dashboard', async ({ page }) => {
  await page.goto('/manager')
  await page.waitForLoadState('networkidle', { timeout: 15_000 })
  expect(page.url()).toContain('/manager')
})
