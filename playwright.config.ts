import { defineConfig, devices } from "@playwright/test"

/**
 * Root Playwright config for bc-grid e2e tests.
 *
 * Two suites under one config:
 *   - `apps/benchmarks/tests/*.pw.ts` against the spike harness (port 5174)
 *   - `apps/examples/tests/*.pw.ts` against the React demo (port 5175)
 *
 * Each suite runs in three browser projects (Chromium / Firefox / WebKit)
 * because pinned cells use JS-driven translate3d and getBoundingClientRect
 * semantics differ slightly across engines.
 *
 * Absolute perf bars run through `playwright.perf.config.ts` and the
 * nightly perf workflow. PR e2e stays behavior-focused so shared CI timing
 * variance does not gate normal feature work.
 */

export default defineConfig({
  // Tests live under each app's `tests/` directory; pick them up by name.
  testMatch: "**/*.pw.ts",
  testIgnore: "**/*.perf.pw.ts",
  // Perf tests rely on stable timing; do not parallelise them.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    trace: "retain-on-failure",
    headless: true,
  },
  projects: [
    // ---- Spike harness (apps/benchmarks) ----
    {
      name: "spike-chromium",
      testDir: "./apps/benchmarks/tests",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:5174" },
    },
    {
      name: "spike-firefox",
      testDir: "./apps/benchmarks/tests",
      use: { ...devices["Desktop Firefox"], baseURL: "http://localhost:5174" },
    },
    {
      name: "spike-webkit",
      testDir: "./apps/benchmarks/tests",
      use: { ...devices["Desktop Safari"], baseURL: "http://localhost:5174" },
    },
    // ---- React demo (apps/examples) ----
    {
      name: "examples-chromium",
      testDir: "./apps/examples/tests",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:5175" },
    },
    {
      name: "examples-firefox",
      testDir: "./apps/examples/tests",
      use: { ...devices["Desktop Firefox"], baseURL: "http://localhost:5175" },
    },
    {
      name: "examples-webkit",
      testDir: "./apps/examples/tests",
      use: { ...devices["Desktop Safari"], baseURL: "http://localhost:5175" },
    },
  ],
  webServer: [
    {
      command: "bun run --cwd apps/benchmarks dev",
      url: "http://localhost:5174",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "bun run --cwd apps/examples dev",
      url: "http://localhost:5175",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
})
