/**
 * Pure-IO helpers for the release-preflight checks. Separated from
 * `cli.ts` so the source-coherence checks are unit-testable without
 * spawning `bun pm pack` child processes.
 *
 * Three checks live here in pure form:
 *
 *   - `discoverPublishablePackages(rootDir)` — walks `packages/*`, returns
 *     the manifests for non-`private` `@bc-grid/*` packages.
 *   - `checkSourceVersionCoherence(packages)` — every publishable package
 *     declares the same `version` string. The release line is built from
 *     a single source-of-truth version; multi-version source = guaranteed
 *     skew at publish time.
 *   - `checkSourceInternalDeps(packages)` — every internal `@bc-grid/*`
 *     dependency in source uses `workspace:*` (the established repo
 *     policy per `tools/release-preflight` and the changesets fixed-mode
 *     config). Anything else (a literal version, a `workspace:^` /
 *     `workspace:~`, a `file:` path) is suspect — it'd publish a
 *     concrete version on the next `bun publish` run that may or may not
 *     match what the rest of the line is shipping.
 *   - `checkTagMatchesVersion(version, tag)` — when a release tag is
 *     present (e.g., `v0.2.0` from CI's `${{ github.ref_name }}`), the
 *     source version must match. Pure; the env-var lookup happens in
 *     `cli.ts`.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

export interface PackageManifest {
  name: string
  version: string
  private?: boolean
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

export interface DiscoveredPackage {
  name: string
  dir: string
  manifest: PackageManifest
}

export interface CoherenceFinding {
  severity: "error" | "warn"
  message: string
}

export const INTERNAL_PACKAGE_PREFIX = "@bc-grid/"

/** Walk `<rootDir>/packages/*` and return non-private `@bc-grid/*` manifests. */
export function discoverPublishablePackages(rootDir: string): DiscoveredPackage[] {
  const packagesDir = join(rootDir, "packages")
  if (!existsSync(packagesDir)) return []
  const entries = readdirSync(packagesDir, { withFileTypes: true })
  const out: DiscoveredPackage[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(packagesDir, entry.name)
    const manifestPath = join(dir, "package.json")
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as PackageManifest
    if (!manifest.name || !manifest.name.startsWith(INTERNAL_PACKAGE_PREFIX)) continue
    if (manifest.private === true) continue
    out.push({ name: manifest.name, dir, manifest })
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

/**
 * All publishable packages must declare the same `version`. Returns an
 * error finding if more than one distinct version is present, otherwise
 * a single-version summary as a warn-free finding list.
 */
export function checkSourceVersionCoherence(packages: readonly DiscoveredPackage[]): {
  findings: CoherenceFinding[]
  sharedVersion: string | null
} {
  if (packages.length === 0) {
    return {
      findings: [{ severity: "error", message: "No publishable @bc-grid/* packages found." }],
      sharedVersion: null,
    }
  }
  const byVersion = new Map<string, string[]>()
  for (const pkg of packages) {
    const list = byVersion.get(pkg.manifest.version) ?? []
    list.push(pkg.name)
    byVersion.set(pkg.manifest.version, list)
  }
  if (byVersion.size === 1) {
    const [sharedVersion] = byVersion.keys()
    return { findings: [], sharedVersion: sharedVersion ?? null }
  }
  const findings: CoherenceFinding[] = []
  findings.push({
    severity: "error",
    message: `Source-version skew across ${packages.length} publishable packages: ${byVersion.size} distinct versions`,
  })
  for (const [version, names] of byVersion) {
    findings.push({
      severity: "error",
      message: `  ${version} → ${names.join(", ")}`,
    })
  }
  return { findings, sharedVersion: null }
}

const ALLOWED_WORKSPACE_SPECIFIERS = new Set(["workspace:*"])

/**
 * Every internal `@bc-grid/*` dependency in source must be a `workspace:*`
 * specifier — the established repo policy. `bun publish` rewrites the
 * specifier to the concrete version at pack time. Any other shape (a
 * literal version, a `file:` path, a `workspace:^` / `~`) is a footgun:
 * it'll either publish out-of-line versions or fail the consumer install.
 */
export function checkSourceInternalDeps(
  packages: readonly DiscoveredPackage[],
): CoherenceFinding[] {
  const findings: CoherenceFinding[] = []
  for (const pkg of packages) {
    const buckets = [
      { kind: "dependencies" as const, deps: pkg.manifest.dependencies },
      { kind: "peerDependencies" as const, deps: pkg.manifest.peerDependencies },
      { kind: "devDependencies" as const, deps: pkg.manifest.devDependencies },
    ]
    for (const { kind, deps } of buckets) {
      if (!deps) continue
      for (const [depName, depSpec] of Object.entries(deps)) {
        if (!depName.startsWith(INTERNAL_PACKAGE_PREFIX)) continue
        if (ALLOWED_WORKSPACE_SPECIFIERS.has(depSpec)) continue
        findings.push({
          severity: "error",
          message: `${pkg.name}: ${kind}["${depName}"] = "${depSpec}" — expected "workspace:*"`,
        })
      }
    }
  }
  return findings
}

/**
 * Pure helper for the optional release-tag match. Returns a finding when
 * the tag is set and doesn't match the shared version. The env-var lookup
 * is the caller's job.
 *
 * Tag conventions accepted: `v0.2.0`, `v0.2.0-alpha.5`, `0.2.0` (no `v`
 * prefix). Any other shape is treated as "no tag context" and skipped.
 */
export function checkTagMatchesVersion(
  sharedVersion: string | null,
  tag: string | undefined,
): CoherenceFinding[] {
  if (!tag || !sharedVersion) return []
  const stripped = tag.startsWith("v") ? tag.slice(1) : tag
  if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(stripped)) return []
  if (stripped === sharedVersion) return []
  return [
    {
      severity: "error",
      message: `Release tag ${tag} does not match source version ${sharedVersion}.`,
    },
  ]
}

/**
 * Verify a packed tarball's `package.json` against the source version
 * group. Pure: the caller extracts `package.json` from the tarball and
 * passes the parsed manifest in.
 *
 * Two assertions:
 *   - The tarball's `version` matches the source's shared version
 *     (catches a `bun pm pack` quirk where the source bumped after pack).
 *   - Every internal `@bc-grid/*` dep in the tarball's `dependencies` /
 *     `peerDependencies` resolves to a CONCRETE version equal to the
 *     shared source version. No `workspace:*` (those leak to consumers
 *     who can't resolve the protocol); no out-of-line concrete version
 *     either.
 */
export function checkPackedManifest(
  packed: PackageManifest,
  sharedVersion: string,
): CoherenceFinding[] {
  const findings: CoherenceFinding[] = []
  if (packed.version !== sharedVersion) {
    findings.push({
      severity: "error",
      message: `${packed.name}: packed version ${packed.version} ≠ shared source version ${sharedVersion}`,
    })
  }
  const buckets = [
    { kind: "dependencies" as const, deps: packed.dependencies },
    { kind: "peerDependencies" as const, deps: packed.peerDependencies },
  ]
  for (const { kind, deps } of buckets) {
    if (!deps) continue
    for (const [depName, depSpec] of Object.entries(deps)) {
      if (!depName.startsWith(INTERNAL_PACKAGE_PREFIX)) continue
      if (depSpec.startsWith("workspace:")) {
        findings.push({
          severity: "error",
          message: `${packed.name}: ${kind}["${depName}"] = "${depSpec}" — workspace: leak in published metadata`,
        })
        continue
      }
      if (depSpec !== sharedVersion) {
        findings.push({
          severity: "error",
          message: `${packed.name}: ${kind}["${depName}"] = "${depSpec}" ≠ shared source version ${sharedVersion}`,
        })
      }
    }
  }
  return findings
}
