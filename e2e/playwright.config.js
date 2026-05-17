require('dotenv').config()
const { defineConfig, devices } = require('@playwright/test')

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173'

module.exports = defineConfig({
  testDir: './specs',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: BASE_URL,
    screenshot: 'only-on-failure',
    trace:      'retain-on-failure',
    video:      'off',
    locale:     'he-IL',
    timezoneId: 'Asia/Jerusalem',
  },

  projects: [
    // Setup: login once, save auth state
    {
      name: 'setup',
      testMatch: '**/helpers/auth.setup.js',
    },

    // Smoke tests — run against production
    {
      name: 'smoke',
      use: {
        ...devices['Desktop Chrome'],
        storageState: './helpers/.auth.json',
      },
      dependencies: ['setup'],
    },
  ],
})
