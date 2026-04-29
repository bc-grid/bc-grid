import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./apps/benchmarks/tests",
  testMatch: "**/*.smoke.pw.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:5174",
    headless: true,
    trace: "off",
  },
  projects: [
    {
      name: "smoke-perf-chromium",
    },
  ],
  webServer: {
    command: "bun run --cwd apps/benchmarks dev",
    url: "http://localhost:5174",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
