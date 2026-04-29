import { defineConfig, devices } from "@playwright/test"

/**
 * Root Playwright config for bc-grid e2e + perf tests.
 *
 * Per-app suites live alongside the apps (e.g. `apps/benchmarks/tests/`).
 * Each test starts its own dev server via `webServer` so CI doesn't depend
 * on an already-running process.
 *
 * Browser breadth: Chromium is the perf-bar target, but the *functional*
 * tests (ARIA, sticky pinned cells, focus retention) run in Firefox and
 * WebKit too. Pinned cells use JS-driven translate3d, which has different
 * compositing and getBoundingClientRect semantics across engines — running
 * cross-browser catches regressions early.
 *
 * The FPS perf tests are gated to Chromium only via `grepInvert` in the
 * Firefox/WebKit projects. They run unconditionally in Chromium.
 */

const FPS_TEST_TITLE = /scroll FPS|variable-height mode/

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
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      grepInvert: FPS_TEST_TITLE,
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      grepInvert: FPS_TEST_TITLE,
    },
  ],
  webServer: {
    command: "bun run --cwd apps/benchmarks dev",
    url: "http://localhost:5174",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
