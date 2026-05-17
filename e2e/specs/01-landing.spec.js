/**
 * טסט 1 — דף נחיתה
 * בודק שה-hero section מוצג נכון ושהדף נפתח מהחלק העליון.
 */
const { test, expect } = require('@playwright/test')

test.use({ storageState: { cookies: [], origins: [] } })

test('landing page loads with hero at top', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  // Hero section קיים
  const hero = page.locator('.hs-root')
  await expect(hero).toBeVisible({ timeout: 10_000 })

  // הכותרת מוצגת
  await expect(page.locator('.hs-title')).toBeVisible()

  // הדף פתוח בראש — scroll position = 0
  const scrollY = await page.evaluate(() => window.scrollY)
  expect(scrollY).toBeLessThan(50)

  // Navbar קיים ושקוף
  await expect(page.locator('nav')).toBeVisible()

  // שם המוצר מוצג
  await expect(page.locator('nav')).toContainText('CareFlow')
})

test('login and register buttons visible', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('button', { hasText: /כניסה/ }).first()).toBeVisible()
  await expect(page.locator('button', { hasText: /הרשמה|בקש גישה/ }).first()).toBeVisible()
})
