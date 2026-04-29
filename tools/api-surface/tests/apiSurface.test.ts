import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  checkApiSurface,
  extractExportNamesFromText,
  formatApiSurfaceReport,
  hasApiSurfaceDrift,
} from "../src/apiSurface"
import type { PackageApiSurfaceManifest } from "../src/manifest"

describe("api-surface export extraction", () => {
  test("extracts named declarations, aliases, type-only exports, and defaults", () => {
    const names = extractExportNamesFromText(`
      export interface Props {}
      export type Mode = "a" | "b"
      export const runtimeValue = 1
      const localValue = 2
      export { localValue as publicValue, type Mode as PublicMode }
      export default function Component() {}
    `)

    expect(names).toEqual(["default", "Mode", "Props", "PublicMode", "publicValue", "runtimeValue"])
  })

  test("extracts JavaScript runtime export lists", () => {
    const names = extractExportNamesFromText(
      `
        const helper = () => {}
        function publicFn() {}
        export { publicFn, helper as renamedHelper }
      `,
      "index.js",
    )

    expect(names).toEqual(["publicFn", "renamedHelper"])
  })
})

describe("api-surface diffing", () => {
  test("fails on unexpected declaration and runtime exports", () => {
    const results = withSurfaceFiles((repoRoot, entry) =>
      checkApiSurface(
        [
          manifest(entry, {
            declarationExports: ["BcGrid"],
            runtimeExports: ["BcGrid"],
          }),
        ],
        repoRoot,
      ),
    )

    expect(results[0]?.diff.unexpectedDeclarationExports).toEqual(["debugHelper"])
    expect(results[0]?.diff.unexpectedRuntimeExports).toEqual(["debugHelper"])
    expect(hasApiSurfaceDrift(results)).toBe(true)
  })

  test("planned packages allow missing exports but still reject unexpected names", () => {
    const results = withSurfaceFiles((repoRoot, entry) =>
      checkApiSurface(
        [
          manifest(entry, {
            mode: "planned",
            declarationExports: ["BcGrid", "plannedThing"],
            runtimeExports: ["BcGrid", "plannedThing"],
          }),
        ],
        repoRoot,
      ),
    )

    expect(results[0]?.diff.missingDeclarationExports).toEqual([])
    expect(results[0]?.diff.missingRuntimeExports).toEqual([])
    expect(results[0]?.diff.unexpectedDeclarationExports).toEqual(["debugHelper"])
    expect(results[0]?.diff.unexpectedRuntimeExports).toEqual(["debugHelper"])
  })

  test("formats a useful failure report", () => {
    const results = withSurfaceFiles((repoRoot, entry) =>
      checkApiSurface(
        [
          manifest(entry, {
            declarationExports: ["BcGrid", "MissingType"],
            runtimeExports: ["BcGrid"],
          }),
        ],
        repoRoot,
      ),
    )

    expect(formatApiSurfaceReport(results)).toContain("@bc-grid/test")
    expect(formatApiSurfaceReport(results)).toContain("missing declarations: MissingType")
    expect(formatApiSurfaceReport(results)).toContain("unexpected declarations: debugHelper")
  })
})

function manifest(
  entry: { declarationPath: string; runtimePath: string },
  overrides: Partial<PackageApiSurfaceManifest> = {},
): PackageApiSurfaceManifest {
  return {
    packageName: "@bc-grid/test",
    declarationPath: entry.declarationPath,
    runtimePath: entry.runtimePath,
    mode: "enforced",
    declarationExports: [],
    runtimeExports: [],
    ...overrides,
  }
}

function withSurfaceFiles<T>(
  callback: (repoRoot: string, entry: { declarationPath: string; runtimePath: string }) => T,
): T {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "bc-grid-api-surface-"))
  try {
    mkdirSync(path.join(repoRoot, "pkg"), { recursive: true })
    writeFileSync(
      path.join(repoRoot, "pkg/index.d.ts"),
      `
        declare function BcGrid(): void
        declare function debugHelper(): void
        export { BcGrid, debugHelper }
      `,
    )
    writeFileSync(
      path.join(repoRoot, "pkg/index.js"),
      `
        function BcGrid() {}
        function debugHelper() {}
        export { BcGrid, debugHelper }
      `,
    )
    return callback(repoRoot, {
      declarationPath: "pkg/index.d.ts",
      runtimePath: "pkg/index.js",
    })
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
}
