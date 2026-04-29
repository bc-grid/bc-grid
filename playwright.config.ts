import { defineConfig, devices } from "@playwright/test"

/**
 * Root Playwright config for bc-grid e2e + perf tests.
 *
 * Per-app suites live alongside the apps (e.g. `apps/benchmarks/tests/`).
 * Each test starts its own dev server via `webServer` so CI doesn't depend
 * on an already-running process.
 *
 * Tests intentionally run in Chromium only — bc-grid's perf bars target
 * Chromium first; Firefox/Safari smoke tests come later in Q1.
 */

export default defineConfig({
  testDir: "./apps/benchmarks/tests",
  // Perf tests rely on stable timing; do not parallelise them.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5174",
    trace: "retain-on-failure",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "bun run --cwd apps/benchmarks dev",
    url: "http://localhost:5174",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
