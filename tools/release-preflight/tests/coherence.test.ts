import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import {
  type DiscoveredPackage,
  type PackageManifest,
  checkPackedManifest,
  checkSourceInternalDeps,
  checkSourceVersionCoherence,
  checkTagMatchesVersion,
  discoverPublishablePackages,
} from "../src/coherence"

const ROOT = resolve(import.meta.dir, "..", "..", "..")

function makeManifest(overrides: Partial<PackageManifest> & { name: string }): PackageManifest {
  return {
    version: "0.2.0",
    private: false,
    ...overrides,
  }
}

function makePackage(manifest: PackageManifest): DiscoveredPackage {
  return { name: manifest.name, dir: `/fake/packages/${manifest.name.split("/")[1]}`, manifest }
}

describe("discoverPublishablePackages — repo state", () => {
  test("finds every publishable @bc-grid/* package and excludes private ones", () => {
    const packages = discoverPublishablePackages(ROOT)
    // Sanity: the repo has 11 publishable packages (the changesets fixed
    // group plus the same set listed in tools/api-surface/src/manifest).
    expect(packages.length).toBeGreaterThan(0)
    for (const pkg of packages) {
      expect(pkg.name.startsWith("@bc-grid/")).toBe(true)
      expect(pkg.manifest.private === true).toBe(false)
    }
  })
})

describe("checkSourceVersionCoherence — repo state (the 0.2.0 release gate)", () => {
  test("every publishable @bc-grid/* package declares the same source version", () => {
    const packages = discoverPublishablePackages(ROOT)
    const result = checkSourceVersionCoherence(packages)
    if (result.findings.length > 0) {
      // Fail loud: print every finding so the test report tells the
      // coordinator which packages are off-line and what versions they
      // declare. This is the gate that catches alpha.2-vs-alpha.5 skew.
      const summary = result.findings.map((f) => `${f.severity}: ${f.message}`).join("\n")
      throw new Error(`Source-version coherence failed:\n${summary}`)
    }
    expect(result.sharedVersion).not.toBeNull()
  })
})

describe("checkSourceInternalDeps — repo state", () => {
  test("every internal @bc-grid/* dep in source is workspace:*", () => {
    const packages = discoverPublishablePackages(ROOT)
    const findings = checkSourceInternalDeps(packages)
    if (findings.length > 0) {
      const summary = findings.map((f) => `${f.severity}: ${f.message}`).join("\n")
      throw new Error(`Source internal-dep policy failed:\n${summary}`)
    }
    expect(findings).toEqual([])
  })
})

describe("checkSourceVersionCoherence — synthetic", () => {
  test("returns sharedVersion when every package declares the same version", () => {
    const packages = [
      makePackage(makeManifest({ name: "@bc-grid/core", version: "0.2.0" })),
      makePackage(makeManifest({ name: "@bc-grid/react", version: "0.2.0" })),
    ]
    const result = checkSourceVersionCoherence(packages)
    expect(result.findings).toEqual([])
    expect(result.sharedVersion).toBe("0.2.0")
  })

  test("flags every off-line package when versions diverge", () => {
    const packages = [
      makePackage(makeManifest({ name: "@bc-grid/core", version: "0.2.0" })),
      makePackage(makeManifest({ name: "@bc-grid/react", version: "0.1.0-alpha.5" })),
      makePackage(makeManifest({ name: "@bc-grid/editors", version: "0.1.0-alpha.5" })),
    ]
    const result = checkSourceVersionCoherence(packages)
    expect(result.sharedVersion).toBeNull()
    expect(result.findings.some((f) => f.severity === "error")).toBe(true)
    // Every group is named in some finding so the coordinator can see
    // which version applies to which packages without re-grepping.
    const messages = result.findings.map((f) => f.message).join("\n")
    expect(messages).toContain("0.2.0")
    expect(messages).toContain("0.1.0-alpha.5")
  })

  test("errors when no publishable packages are discovered", () => {
    const result = checkSourceVersionCoherence([])
    expect(result.sharedVersion).toBeNull()
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]?.severity).toBe("error")
  })
})

describe("checkSourceInternalDeps — synthetic", () => {
  test("accepts workspace:* internal dep specifiers", () => {
    const packages = [
      makePackage(
        makeManifest({
          name: "@bc-grid/react",
          dependencies: {
            "@bc-grid/core": "workspace:*",
            "@bc-grid/virtualizer": "workspace:*",
            react: "^19.0.0",
          },
        }),
      ),
    ]
    expect(checkSourceInternalDeps(packages)).toEqual([])
  })

  test("rejects literal-version, file:, workspace:^ specifiers on internal deps", () => {
    const packages = [
      makePackage(
        makeManifest({
          name: "@bc-grid/react",
          dependencies: {
            "@bc-grid/core": "0.1.0-alpha.5",
            "@bc-grid/virtualizer": "workspace:^",
            "@bc-grid/animations": "file:../animations",
          },
        }),
      ),
    ]
    const findings = checkSourceInternalDeps(packages)
    expect(findings).toHaveLength(3)
    for (const finding of findings) {
      expect(finding.severity).toBe("error")
      expect(finding.message).toContain('expected "workspace:*"')
    }
  })

  test("ignores external (non-@bc-grid) deps regardless of specifier", () => {
    const packages = [
      makePackage(
        makeManifest({
          name: "@bc-grid/react",
          dependencies: { react: "^19.0.0" },
          peerDependencies: { "react-dom": "^19.0.0" },
          devDependencies: { typescript: "5.7.0" },
        }),
      ),
    ]
    expect(checkSourceInternalDeps(packages)).toEqual([])
  })

  test("walks dependencies / peerDependencies / devDependencies all", () => {
    const packages = [
      makePackage(
        makeManifest({
          name: "@bc-grid/editors",
          dependencies: { "@bc-grid/core": "0.2.0" },
          peerDependencies: { "@bc-grid/react": "0.2.0" },
          devDependencies: { "@bc-grid/theming": "0.2.0" },
        }),
      ),
    ]
    const findings = checkSourceInternalDeps(packages)
    expect(findings).toHaveLength(3)
    const messages = findings.map((f) => f.message).join("\n")
    expect(messages).toContain("dependencies[")
    expect(messages).toContain("peerDependencies[")
    expect(messages).toContain("devDependencies[")
  })
})

describe("checkTagMatchesVersion", () => {
  test("returns no findings when tag matches version (with v prefix)", () => {
    expect(checkTagMatchesVersion("0.2.0", "v0.2.0")).toEqual([])
  })

  test("returns no findings when tag matches version (no v prefix)", () => {
    expect(checkTagMatchesVersion("0.2.0", "0.2.0")).toEqual([])
  })

  test("matches pre-release semver tags", () => {
    expect(checkTagMatchesVersion("0.2.0-alpha.5", "v0.2.0-alpha.5")).toEqual([])
  })

  test("flags a mismatch with a clear error message", () => {
    const findings = checkTagMatchesVersion("0.1.0-alpha.2", "v0.2.0")
    expect(findings).toHaveLength(1)
    expect(findings[0]?.severity).toBe("error")
    expect(findings[0]?.message).toContain("v0.2.0")
    expect(findings[0]?.message).toContain("0.1.0-alpha.2")
  })

  test("skips check entirely when tag is missing", () => {
    expect(checkTagMatchesVersion("0.2.0", undefined)).toEqual([])
    expect(checkTagMatchesVersion("0.2.0", "")).toEqual([])
  })

  test("skips check when tag isn't a semver-shaped string (e.g., a branch ref)", () => {
    expect(checkTagMatchesVersion("0.2.0", "main")).toEqual([])
    expect(checkTagMatchesVersion("0.2.0", "refs/heads/main")).toEqual([])
  })

  test("skips check when shared version is null (upstream check already failed)", () => {
    expect(checkTagMatchesVersion(null, "v0.2.0")).toEqual([])
  })
})

describe("checkPackedManifest", () => {
  const sharedVersion = "0.2.0"

  test("accepts a clean packed manifest with concrete internal versions", () => {
    const packed = makeManifest({
      name: "@bc-grid/react",
      version: "0.2.0",
      dependencies: {
        "@bc-grid/core": "0.2.0",
        "@bc-grid/virtualizer": "0.2.0",
        react: "^19.0.0",
      },
      peerDependencies: { "react-dom": "^19.0.0" },
    })
    expect(checkPackedManifest(packed, sharedVersion)).toEqual([])
  })

  test("flags a workspace: leak in published metadata", () => {
    const packed = makeManifest({
      name: "@bc-grid/react",
      version: "0.2.0",
      dependencies: { "@bc-grid/core": "workspace:*" },
    })
    const findings = checkPackedManifest(packed, sharedVersion)
    expect(findings).toHaveLength(1)
    expect(findings[0]?.message).toContain("workspace: leak")
  })

  test("flags a packed version that doesn't match the shared source version", () => {
    const packed = makeManifest({
      name: "@bc-grid/react",
      version: "0.1.0-alpha.5",
    })
    const findings = checkPackedManifest(packed, sharedVersion)
    expect(findings).toHaveLength(1)
    expect(findings[0]?.message).toContain("packed version")
  })

  test("flags an internal dep that resolves to an out-of-line concrete version", () => {
    const packed = makeManifest({
      name: "@bc-grid/react",
      version: "0.2.0",
      dependencies: {
        "@bc-grid/core": "0.1.0-alpha.5",
        "@bc-grid/virtualizer": "0.2.0",
      },
    })
    const findings = checkPackedManifest(packed, sharedVersion)
    expect(findings).toHaveLength(1)
    expect(findings[0]?.message).toContain("@bc-grid/core")
    expect(findings[0]?.message).toContain("0.1.0-alpha.5")
  })

  test("ignores external deps in packed metadata", () => {
    const packed = makeManifest({
      name: "@bc-grid/react",
      version: "0.2.0",
      dependencies: { react: "^19.0.0" },
      peerDependencies: { "react-dom": "^19.0.0" },
    })
    expect(checkPackedManifest(packed, sharedVersion)).toEqual([])
  })
})
