import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./apps/benchmarks/tests",
  testMatch: "**/*.perf.pw.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:5174",
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "perf-chromium",
    },
  ],
  webServer: {
    command: "bun run --cwd apps/benchmarks dev",
    url: "http://localhost:5174",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
