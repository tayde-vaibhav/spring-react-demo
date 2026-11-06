import { defineConfig } from '@playwright/test'

// The installed runner otherwise captures a failed page's accessibility tree.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  maxFailures: 1,
  timeout: 30_000,
  globalTimeout: 240_000,
  expect: { timeout: 5_000 },
  quiet: true,
  reporter: [['./e2e/support/safe-reporter.ts']],
  outputDir: './test-results',
  use: {
    baseURL: 'http://localhost:5173',
    browserName: 'chromium',
    headless: true,
    serviceWorkers: 'block',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
})
