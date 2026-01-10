import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './src',
  testMatch: '**/playwright.test.ts',
  fullyParallel: false, // Run tests serially - they share a server
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker to share server
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30000,
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
})
