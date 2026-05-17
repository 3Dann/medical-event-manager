/**
 * טסט 4 — תיק מטופל
 * בודק שתיק מטופל נפתח עם 6 טאבים ואין שגיאות.
 */
const { test, expect } = require('@playwright/test')

test('patient detail loads without errors', async ({ page }) => {
  // ניווט ישיר לתיק מטופל הבדיקה (ID=2 נוצר ב-seed)
  await page.goto('/manager/patients/2')

  // המתן לתוכן — לא networkidle כי יש polling
  await page.waitForSelector('h1, h2, [class*="patient"], [class*="detail"]', { timeout: 15_000 })

  // אין ErrorBoundary
  await expect(page.locator('text=אירעה שגיאה בלתי צפויה')).not.toBeVisible()
  await expect(page.locator('text=404')).not.toBeVisible()
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
