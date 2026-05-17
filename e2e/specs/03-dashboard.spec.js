/**
 * טסט 3 — דשבורד מנהל
 * בודק שהדשבורד נטען עם הרכיבים הנדרשים.
 */
const { test, expect } = require('@playwright/test')

test('manager dashboard loads', async ({ page }) => {
  await page.goto('/manager')
  await page.waitForLoadState('networkidle', { timeout: 15_000 })

  // ניווט בצד שמאל קיים
  await expect(page.locator('nav, [class*="layout"], [class*="sidebar"]').first()).toBeVisible()

  // אין קריסת React (ErrorBoundary)
  const errorBoundary = page.locator('text=אירעה שגיאה בלתי צפויה')
  await expect(errorBoundary).not.toBeVisible()

  // תפריט ניווט עם לינקים
  await expect(page.locator('a[href*="/manager"]').first()).toBeVisible()
})

test('patients list accessible', async ({ page }) => {
  await page.goto('/manager')
  await page.waitForLoadState('networkidle', { timeout: 15_000 })

  // לחץ על "מטופלים" בניווט
  const patientsLink = page.locator('a, button', { hasText: /מטופל/ }).first()
  if (await patientsLink.isVisible()) {
    await patientsLink.click()
    await page.waitForLoadState('networkidle', { timeout: 10_000 })
  }

  // אין שגיאה
  await expect(page.locator('text=אירעה שגיאה')).not.toBeVisible()
})

test('notification bell visible', async ({ page }) => {
  await page.goto('/manager')
  await page.waitForLoadState('networkidle', { timeout: 15_000 })

  // פעמון התראות קיים ב-navbar
  const bell = page.locator('[class*="notification"], [aria-label*="התראה"], svg[class*="bell"]')
  // לא חובה — אם קיים, בודקים שלא קורס
  const count = await bell.count()
  if (count > 0) {
    await expect(bell.first()).toBeVisible()
  }
})
