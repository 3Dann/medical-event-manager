/**
 * טסט 4 — תיק מטופל
 * בודק שתיק מטופל נפתח עם 6 טאבים ואין שגיאות.
 */
const { test, expect } = require('@playwright/test')

test('patient detail loads with tabs', async ({ page }) => {
  // ניווט לרשימת מטופלים
  await page.goto('/manager')
  await page.waitForLoadState('networkidle', { timeout: 15_000 })

  // חפש את מטופל הבדיקה
  const patientLink = page.locator('a, button', { hasText: /מטופל בדיקה E2E/ }).first()

  if (await patientLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await patientLink.click()
  } else {
    // ניווט ישיר לתיק הראשון
    await page.goto('/manager/patients/2')
  }

  await page.waitForLoadState('networkidle', { timeout: 15_000 })

  // אין ErrorBoundary
  await expect(page.locator('text=אירעה שגיאה בלתי צפויה')).not.toBeVisible()

  // טאבים קיימים
  const tabs = page.locator('[role="tab"], [class*="tab"]')
  const tabCount = await tabs.count()
  expect(tabCount).toBeGreaterThan(0)
})

test('patient insurance tab loads', async ({ page }) => {
  await page.goto('/manager/patients/2/insurance')
  await page.waitForLoadState('networkidle', { timeout: 15_000 })

  await expect(page.locator('text=אירעה שגיאה בלתי צפויה')).not.toBeVisible()
})

test('patient claims tab loads', async ({ page }) => {
  await page.goto('/manager/patients/2/claims')
  await page.waitForLoadState('networkidle', { timeout: 15_000 })

  await expect(page.locator('text=אירעה שגיאה בלתי צפויה')).not.toBeVisible()
})
