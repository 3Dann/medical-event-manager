/**
 * Global setup — מקבל token ישירות מ-API ללא 2FA, שומר ב-storageState.
 */
const { chromium } = require('@playwright/test')
const path = require('path')
const https = require('https')
const http  = require('http')

const AUTH_FILE = path.join(__dirname, '.auth.json')

function apiPost(url, body) {
  return new Promise((resolve, reject) => {
    const parsed   = new URL(url)
    const lib      = parsed.protocol === 'https:' ? https : http
    const payload  = JSON.stringify(body)
    const req = lib.request({
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode, body: data }) }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

module.exports = async function globalSetup() {
  const BASE_URL   = process.env.BASE_URL   || 'http://localhost:5173'
  const email      = process.env.E2E_EMAIL    || 'e2e@careflow.test'
  const e2eSecret  = process.env.E2E_SEED     || '1'

  console.log(`\n🔐 E2E Setup: getting token for ${email} on ${BASE_URL}`)

  // קבל token דרך endpoint E2E (עוקף 2FA)
  const { status, body } = await apiPost(`${BASE_URL}/api/auth/e2e-login`, {
    email, e2e_secret: e2eSecret,
  })

  if (status !== 200 || !body.access_token) {
    throw new Error(`E2E login failed: ${status} — ${JSON.stringify(body)}`)
  }

  const token = body.access_token
  console.log('✅ Token received, user:', body.full_name, `(${body.role})`)

  // שמור token ב-localStorage דרך Playwright
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page    = await context.newPage()

  await page.goto(BASE_URL, { timeout: 20_000 })
  await page.waitForLoadState('domcontentloaded')

  // הזן token ו-user ל-localStorage (כמו שהאפליקציה עושה אחרי login)
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
  }, {
    token,
    user: {
      id: body.user_id, full_name: body.full_name, email, role: body.role,
      is_admin: body.is_admin, must_change_password: body.must_change_password,
      demo_mode_allowed: body.demo_mode_allowed,
    },
  })

  // נווט לdashboard לאמת
  await page.goto(`${BASE_URL}/manager`, { timeout: 15_000 })
  await page.waitForLoadState('networkidle', { timeout: 15_000 })
  console.log('✅ Navigated to:', page.url())

  await context.storageState({ path: AUTH_FILE })
  console.log('💾 Auth saved to', AUTH_FILE)

  await browser.close()
}
