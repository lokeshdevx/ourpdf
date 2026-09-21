import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.PORT ?? 3000)

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', screenshot: 'only-on-failure', acceptDownloads: true },
  // Tests run against the production build (real CSP, service worker, bundled workers).
  webServer: { command: 'npm run start', url: `http://localhost:${PORT}/editor`, reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1100 } }, grepInvert: /@mobile/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 1100 } }, grep: /@cross/, grepInvert: /@mobile/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1100 } }, grep: /@cross/, grepInvert: /@mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
})
