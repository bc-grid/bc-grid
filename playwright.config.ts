import { defineConfig, devices } from "@playwright/test"

function portFromEnv(name: string, fallback: number): number {
  const value = process.env[name]
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const benchmarksPort = portFromEnv("BC_GRID_BENCHMARKS_PORT", 5174)
const examplesPort = portFromEnv("BC_GRID_EXAMPLES_PORT", 5175)
const benchmarksBaseURL = `http://localhost:${benchmarksPort}`
const examplesBaseURL = `http://localhost:${examplesPort}`

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
  testIgnore: ["**/*.perf.pw.ts", "**/*.smoke.pw.ts"],
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
      use: { ...devices["Desktop Chrome"], baseURL: benchmarksBaseURL },
    },
    {
      name: "spike-firefox",
      testDir: "./apps/benchmarks/tests",
      use: { ...devices["Desktop Firefox"], baseURL: benchmarksBaseURL },
    },
    {
      name: "spike-webkit",
      testDir: "./apps/benchmarks/tests",
      use: { ...devices["Desktop Safari"], baseURL: benchmarksBaseURL },
    },
    // ---- React demo (apps/examples) ----
    {
      name: "examples-chromium",
      testDir: "./apps/examples/tests",
      use: { ...devices["Desktop Chrome"], baseURL: examplesBaseURL },
    },
    {
      name: "examples-firefox",
      testDir: "./apps/examples/tests",
      use: { ...devices["Desktop Firefox"], baseURL: examplesBaseURL },
    },
    {
      name: "examples-webkit",
      testDir: "./apps/examples/tests",
      use: { ...devices["Desktop Safari"], baseURL: examplesBaseURL },
    },
  ],
  webServer: [
    {
      command: `bun run --cwd apps/benchmarks dev -- --port ${benchmarksPort}`,
      url: benchmarksBaseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `bun run --cwd apps/examples dev -- --port ${examplesPort}`,
      url: examplesBaseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
})
