import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  checkBundleSize,
  formatBundleSizeReport,
  gzipSize,
  hasBundleSizeDrift,
} from "../src/bundleSize"
import type { BundleSizeManifest } from "../src/manifest"

describe("bundle-size gate", () => {
  test("passes when the aggregate is within hard budget and regression allowance", () => {
    const result = withBundleFile("export const value = 1\n", (repoRoot, bundlePath, baseline) =>
      checkBundleSize(manifest(bundlePath, baseline), repoRoot),
    )

    expect(hasBundleSizeDrift(result)).toBe(false)
    expect(formatBundleSizeReport(result)).toContain("Bundle size check passed")
  })

  test("fails when the aggregate exceeds the hard budget", () => {
    const result = withBundleFile(
      "export const value = 'budget'\n",
      (repoRoot, bundlePath, baseline) =>
        checkBundleSize(
          {
            ...manifest(bundlePath, baseline),
            budgetGzipBytes: baseline - 1,
          },
          repoRoot,
        ),
    )

    expect(result.overBudgetBytes).toBeGreaterThan(0)
    expect(hasBundleSizeDrift(result)).toBe(true)
    expect(formatBundleSizeReport(result)).toContain("Over hard budget")
  })

  test("fails when the aggregate exceeds the regression allowance", () => {
    const result = withBundleFile("export const value = 'regression'\n", (repoRoot, bundlePath) =>
      checkBundleSize(
        {
          ...manifest(bundlePath, 1),
          budgetGzipBytes: 10_000,
          maxRegressionPercent: 5,
        },
        repoRoot,
      ),
    )

    expect(result.regressionBytes).toBeGreaterThan(0)
    expect(hasBundleSizeDrift(result)).toBe(true)
    expect(formatBundleSizeReport(result)).toContain("regression allowance")
  })

  test("fails when a bundle file is missing", () => {
    const repoRoot = mkdtempSync(path.join(tmpdir(), "bc-grid-bundle-size-"))
    try {
      const result = checkBundleSize(manifest("missing/dist/index.js", 100), repoRoot)

      expect(result.entries[0]?.missing).toBe(true)
      expect(hasBundleSizeDrift(result)).toBe(true)
      expect(formatBundleSizeReport(result)).toContain("Missing bundle file")
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })
})

function manifest(bundlePath: string, baselineGzipBytes: number): BundleSizeManifest {
  return {
    name: "test-bundle",
    budgetGzipBytes: 10_000,
    maxRegressionPercent: 5,
    entries: [
      {
        packageName: "@bc-grid/test",
        bundlePath,
        baselineGzipBytes,
      },
    ],
  }
}

function withBundleFile<T>(
  contents: string,
  callback: (repoRoot: string, bundlePath: string, baselineGzipBytes: number) => T,
): T {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "bc-grid-bundle-size-"))
  const bundlePath = "pkg/dist/index.js"
  try {
    mkdirSync(path.join(repoRoot, "pkg/dist"), { recursive: true })
    writeFileSync(path.join(repoRoot, bundlePath), contents)
    return callback(repoRoot, bundlePath, gzipSize(contents))
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
}
