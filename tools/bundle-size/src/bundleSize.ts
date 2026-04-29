import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { gzipSync } from "node:zlib"
import type { BundleSizeEntryManifest, BundleSizeManifest } from "./manifest"

export interface BundleSizeEntryResult {
  packageName: string
  bundlePath: string
  baselineGzipBytes: number
  actualGzipBytes: number | null
  missing: boolean
}

export interface BundleSizeResult {
  name: string
  budgetGzipBytes: number
  maxRegressionPercent: number
  baselineGzipBytes: number
  actualGzipBytes: number
  maxAllowedGzipBytes: number
  overBudgetBytes: number
  regressionBytes: number
  entries: readonly BundleSizeEntryResult[]
}

export function checkBundleSize(
  manifest: BundleSizeManifest,
  repoRoot = findRepoRoot(),
): BundleSizeResult {
  const entries = manifest.entries.map((entry) => readBundleSize(entry, repoRoot))
  const baselineGzipBytes = sum(manifest.entries.map((entry) => entry.baselineGzipBytes))
  const actualGzipBytes = sum(entries.map((entry) => entry.actualGzipBytes ?? 0))
  const maxAllowedGzipBytes = Math.ceil(
    baselineGzipBytes * (1 + manifest.maxRegressionPercent / 100),
  )

  return {
    name: manifest.name,
    budgetGzipBytes: manifest.budgetGzipBytes,
    maxRegressionPercent: manifest.maxRegressionPercent,
    baselineGzipBytes,
    actualGzipBytes,
    maxAllowedGzipBytes,
    overBudgetBytes: Math.max(0, actualGzipBytes - manifest.budgetGzipBytes),
    regressionBytes: Math.max(0, actualGzipBytes - maxAllowedGzipBytes),
    entries,
  }
}

export function hasBundleSizeDrift(result: BundleSizeResult): boolean {
  return (
    result.entries.some((entry) => entry.missing) ||
    result.overBudgetBytes > 0 ||
    result.regressionBytes > 0
  )
}

export function formatBundleSizeReport(result: BundleSizeResult): string {
  const lines = [
    `${hasBundleSizeDrift(result) ? "Bundle size check failed" : "Bundle size check passed"}: ${
      result.name
    } ${formatBytes(result.actualGzipBytes)} gzip / ${formatBytes(result.budgetGzipBytes)} budget`,
    `Baseline: ${formatBytes(result.baselineGzipBytes)}; max allowed with +${
      result.maxRegressionPercent
    }% regression: ${formatBytes(result.maxAllowedGzipBytes)}.`,
    "",
    "Packages:",
  ]

  for (const entry of result.entries) {
    const actual =
      entry.actualGzipBytes == null ? "missing" : `${formatBytes(entry.actualGzipBytes)} gzip`
    lines.push(
      `  ${entry.packageName}: ${actual} (baseline ${formatBytes(entry.baselineGzipBytes)})`,
    )
  }

  if (result.overBudgetBytes > 0) {
    lines.push("", `Over hard budget by ${formatBytes(result.overBudgetBytes)}.`)
  }
  if (result.regressionBytes > 0) {
    lines.push(
      "",
      `Over +${result.maxRegressionPercent}% regression allowance by ${formatBytes(result.regressionBytes)}.`,
    )
  }
  if (result.entries.some((entry) => entry.missing)) {
    lines.push("", "Missing bundle file(s). Run `bun run build` before `bun run bundle-size`.")
  }

  return lines.join("\n")
}

export function gzipSize(input: Buffer | string): number {
  return gzipSync(input, { level: 9 }).length
}

export function findRepoRoot(start = process.cwd()): string {
  let current = path.resolve(start)
  while (true) {
    if (
      existsSync(path.join(current, "package.json")) &&
      existsSync(path.join(current, "tsconfig.base.json")) &&
      existsSync(path.join(current, "packages"))
    ) {
      return current
    }

    const parent = path.dirname(current)
    if (parent === current) {
      throw new Error(`Unable to find bc-grid repo root from ${start}`)
    }
    current = parent
  }
}

function readBundleSize(entry: BundleSizeEntryManifest, repoRoot: string): BundleSizeEntryResult {
  const bundlePath = path.resolve(repoRoot, entry.bundlePath)
  if (!existsSync(bundlePath)) {
    return {
      packageName: entry.packageName,
      bundlePath: entry.bundlePath,
      baselineGzipBytes: entry.baselineGzipBytes,
      actualGzipBytes: null,
      missing: true,
    }
  }

  return {
    packageName: entry.packageName,
    bundlePath: entry.bundlePath,
    baselineGzipBytes: entry.baselineGzipBytes,
    actualGzipBytes: gzipSize(readFileSync(bundlePath)),
    missing: false,
  }
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(2)} KiB`
}
