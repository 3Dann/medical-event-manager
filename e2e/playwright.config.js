require('dotenv').config()
const { defineConfig, devices } = require('@playwright/test')

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173'

module.exports = defineConfig({
  testDir: './specs',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: 1,
  globalSetup:  './helpers/global-setup.js',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL:      BASE_URL,
    screenshot:   'only-on-failure',
    trace:        'retain-on-failure',
    video:        'off',
    locale:       'he-IL',
    timezoneId:   'Asia/Jerusalem',
    storageState: './helpers/.auth.json',
  },

  projects: [
    {
      name: 'smoke',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
