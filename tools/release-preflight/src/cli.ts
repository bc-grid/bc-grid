/**
 * release-preflight
 *
 * Pre-publish coherence checks for the @bc-grid/* package line. Designed
 * to run BEFORE `bun publish` in `.github/workflows/release.yml` so a
 * source / tag / packed-metadata mismatch fails fast instead of pushing
 * a bad release line to the registry.
 *
 * Three checks (all source by default; pack-time check on by default):
 *
 *   1. Source-version coherence: all publishable @bc-grid/* packages
 *      share the same `version` string.
 *   2. Source-side internal-dep policy: every `@bc-grid/*` dep is
 *      `workspace:*` (the established repo policy).
 *   3. Packed metadata coherence: each tarball's `package.json` carries
 *      the shared source version and no `workspace:*` leaks; every
 *      internal `@bc-grid/*` dep resolves to the same concrete version.
 *
 * Optional fourth check (off by default; on when RELEASE_TAG or
 * GITHUB_REF_NAME is set in env):
 *
 *   4. Release-tag match: the source version matches the tag's semver.
 *
 * Flags:
 *
 *   --skip-pack   Skip check (3). Useful for unit tests / quick local runs
 *                 that don't want to spawn `bun pm pack`.
 *   --tag <v>     Override the tag for check (4). Mostly for local testing.
 *
 * Run via:
 *
 *   bun run release-preflight             # full check (1+2+3, plus 4 if env)
 *   bun run release-preflight --skip-pack # source-only (1+2, plus 4 if env)
 */

import { execSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  type CoherenceFinding,
  type DiscoveredPackage,
  type PackageManifest,
  checkPackedManifest,
  checkSourceInternalDeps,
  checkSourceVersionCoherence,
  checkTagMatchesVersion,
  discoverPublishablePackages,
} from "./coherence"

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(SCRIPT_DIR, "..", "..", "..")

interface CliOptions {
  skipPack: boolean
  tagOverride?: string
}

function parseArgs(argv: readonly string[]): CliOptions {
  const opts: CliOptions = { skipPack: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--skip-pack") opts.skipPack = true
    else if (arg === "--tag") {
      const next = argv[++i]
      if (next) opts.tagOverride = next
    }
  }
  return opts
}

function packTarball(packageDir: string, outDir: string): string {
  const result = execSync(`bun pm pack --destination ${outDir}`, {
    cwd: packageDir,
    encoding: "utf-8",
  })
  // bun pm pack prints the absolute tarball path somewhere in the output;
  // it's the only line ending in .tgz that resolves to an existing file.
  const tarballPath = result
    .split("\n")
    .map((line) => line.trim())
    .reverse()
    .find((line) => line.endsWith(".tgz") && existsSync(line))
  if (!tarballPath) {
    throw new Error(`bun pm pack did not produce a usable tarball; output was:\n${result}`)
  }
  return tarballPath
}

function extractPackedManifest(tarballPath: string): PackageManifest {
  // `tar -xOf` extracts a single file to stdout. The manifest lives at
  // `package/package.json` inside every npm-style tarball. macOS BSD tar
  // and GNU tar both support this flag set.
  const raw = execSync(`tar -xOf ${tarballPath} package/package.json`, {
    encoding: "utf-8",
  })
  return JSON.parse(raw) as PackageManifest
}

function checkPackedTarballs(
  packages: readonly DiscoveredPackage[],
  sharedVersion: string,
): { findings: CoherenceFinding[]; checked: number } {
  const findings: CoherenceFinding[] = []
  const workdir = mkdtempSync(join(tmpdir(), "bc-grid-release-preflight-"))
  try {
    for (const pkg of packages) {
      console.log(`[release-preflight] Packing ${pkg.name}…`)
      const tarballPath = packTarball(pkg.dir, workdir)
      const packed = extractPackedManifest(tarballPath)
      findings.push(...checkPackedManifest(packed, sharedVersion))
    }
  } finally {
    rmSync(workdir, { recursive: true, force: true })
  }
  return { findings, checked: packages.length }
}

function reportAndExit(findings: readonly CoherenceFinding[], context: string): void {
  if (findings.length === 0) {
    console.log(`[release-preflight] ${context} ✓`)
    return
  }
  for (const finding of findings) {
    const tag = finding.severity === "error" ? "ERROR" : "WARN"
    console.error(`[release-preflight] ${tag}: ${finding.message}`)
  }
  if (findings.some((f) => f.severity === "error")) {
    process.exit(1)
  }
}

function resolveTag(opts: CliOptions): string | undefined {
  if (opts.tagOverride) return opts.tagOverride
  const env = process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME
  return env || undefined
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2))
  const packages = discoverPublishablePackages(ROOT)

  console.log(`[release-preflight] Discovered ${packages.length} publishable @bc-grid/* packages.`)

  const sourceCheck = checkSourceVersionCoherence(packages)
  reportAndExit(sourceCheck.findings, "Check 1 — source-version coherence")
  const sharedVersion = sourceCheck.sharedVersion
  if (sharedVersion) {
    console.log(`[release-preflight]   shared source version: ${sharedVersion}`)
  }

  const internalDepFindings = checkSourceInternalDeps(packages)
  reportAndExit(internalDepFindings, "Check 2 — source-side internal-dep policy (workspace:*)")

  if (!opts.skipPack && sharedVersion) {
    const { findings: packedFindings, checked } = checkPackedTarballs(packages, sharedVersion)
    reportAndExit(
      packedFindings,
      `Check 3 — packed-tarball metadata coherence (${checked} packages)`,
    )
  } else if (opts.skipPack) {
    console.log("[release-preflight] Check 3 skipped (--skip-pack)")
  }

  const tag = resolveTag(opts)
  if (tag && sharedVersion) {
    const tagFindings = checkTagMatchesVersion(sharedVersion, tag)
    reportAndExit(tagFindings, `Check 4 — release tag (${tag}) matches source version`)
  } else if (!tag) {
    console.log(
      "[release-preflight] Check 4 skipped (no RELEASE_TAG / GITHUB_REF_NAME / --tag in env)",
    )
  }

  console.log("[release-preflight] All gates passed ✓")
}

if (typeof process !== "undefined") {
  // Read package.json from disk to confirm we can resolve relative to
  // the script's location; surfaces a clearer error than a missing-fn
  // exception if someone moves the script.
  if (!existsSync(join(ROOT, "package.json"))) {
    console.error(`[release-preflight] Cannot find repo root at ${ROOT}.`)
    process.exit(2)
  }
}

main()
