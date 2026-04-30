/**
 * tarball-smoke
 *
 * Pre-publish verification: pack each @bc-grid/* package as a tarball,
 * install the tarballs into a clean throwaway project, and verify the
 * consumer-facing API resolves.
 *
 * Catches:
 *   - missing `exports` map entries
 *   - workspace:* leaks (deps that didn't get rewritten at publish-time)
 *   - missing files in the published tarball (`files: ["dist"]` typos)
 *   - broken type declarations
 *
 * Run via:
 *   bun run --filter @bc-grid/tarball-smoke check
 *   # or
 *   bun run tarball-smoke
 */

import { execSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const ROOT = resolve(import.meta.dir, "..", "..", "..")
const PACKAGES_DIR = join(ROOT, "packages")

interface PackageManifest {
  name: string
  version: string
  private?: boolean
}

function readManifest(packageDir: string): PackageManifest {
  const raw = readFileSync(join(packageDir, "package.json"), "utf-8")
  return JSON.parse(raw) as PackageManifest
}

function discoverPackages(): { name: string; dir: string; manifest: PackageManifest }[] {
  const dirs = readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(PACKAGES_DIR, entry.name))

  const out: { name: string; dir: string; manifest: PackageManifest }[] = []
  for (const dir of dirs) {
    if (!existsSync(join(dir, "package.json"))) continue
    const manifest = readManifest(dir)
    if (manifest.private === true) continue // Skip explicitly-private packages.
    out.push({ name: manifest.name, dir, manifest })
  }
  return out
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

function setupConsumerProject(workdir: string, tarballs: Record<string, string>): void {
  mkdirSync(workdir, { recursive: true })

  const dependencies: Record<string, string> = {}
  for (const [name, tarballPath] of Object.entries(tarballs)) {
    dependencies[name] = `file:${tarballPath}`
  }

  // Bun resolves nested `dependencies` via the registry (or workspace).
  // Each tarball declares its siblings as e.g. "@bc-grid/core": "0.1.0-alpha.1"
  // (rewritten from `workspace:*` at pack time), and without an override that
  // version won't be found anywhere yet (we haven't published). `overrides`
  // forces every transitive `@bc-grid/*` reference to resolve to its tarball.
  writeFileSync(
    join(workdir, "package.json"),
    JSON.stringify(
      {
        name: "bc-grid-tarball-smoke-consumer",
        version: "0.0.0",
        private: true,
        type: "module",
        dependencies: {
          ...dependencies,
          react: "^19.0.0",
          "react-dom": "^19.0.0",
          "@types/react": "^19.0.0",
          "@types/react-dom": "^19.0.0",
        },
        overrides: dependencies,
      },
      null,
      2,
    ),
    "utf-8",
  )

  // tsconfig with strict + bundler resolution to mirror a typical consumer.
  writeFileSync(
    join(workdir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          strict: true,
          skipLibCheck: true,
          noEmit: true,
          esModuleInterop: true,
        },
        include: ["smoke.tsx"],
      },
      null,
      2,
    ),
    "utf-8",
  )

  // Consumer file imports each public surface and uses key types/values.
  // If any import fails, type-check rejects.
  const smokeSource = `
import "@bc-grid/theming/styles.css"
import { BcGrid, BcEditGrid, BcServerGrid, useBcGridApi } from "@bc-grid/react"
import type { BcGridColumn, BcGridApi } from "@bc-grid/core"
import { Virtualizer } from "@bc-grid/virtualizer"
import { flip } from "@bc-grid/animations"
import { toCsv, toExcel, toPdf } from "@bc-grid/export"
import { createServerRowModel, defaultBlockKey } from "@bc-grid/server-row-model"
import { bcGridDensities, bcGridPreset } from "@bc-grid/theming"

interface Row { id: string; name: string }
const columns: BcGridColumn<Row>[] = [
  { columnId: "name", header: "Name", field: "name" },
]
const rows: Row[] = [{ id: "1", name: "smoke" }]

void function exerciseTypes() {
  const _grid = BcGrid
  const _editGrid = BcEditGrid
  const _serverGrid = BcServerGrid
  const _hook = useBcGridApi
  const _virt = Virtualizer
  const _flip = flip
  const _csv = toCsv
  const _xlsx = toExcel
  const _pdf = toPdf
  const _model = createServerRowModel
  const _key = defaultBlockKey
  const _dens = bcGridDensities
  const _preset = bcGridPreset
  const _api: BcGridApi<Row> | null = null
  return { columns, rows, _grid, _editGrid, _serverGrid, _hook, _virt, _flip, _csv, _xlsx, _pdf, _model, _key, _dens, _preset, _api }
}
`
  writeFileSync(join(workdir, "smoke.tsx"), smokeSource.trimStart(), "utf-8")
}

function main(): void {
  const packages = discoverPackages()
  if (packages.length === 0) {
    console.error("[tarball-smoke] No public packages found in packages/*")
    process.exit(1)
  }

  console.log(`[tarball-smoke] Found ${packages.length} public packages:`)
  for (const pkg of packages) console.log(`  ${pkg.name}@${pkg.manifest.version}`)

  const workdir = mkdtempSync(join(tmpdir(), "bc-grid-tarball-smoke-"))
  console.log(`[tarball-smoke] Workdir: ${workdir}`)
  const tarballsDir = join(workdir, "tarballs")
  mkdirSync(tarballsDir, { recursive: true })

  const tarballs: Record<string, string> = {}
  for (const pkg of packages) {
    console.log(`[tarball-smoke] Packing ${pkg.name}…`)
    tarballs[pkg.name] = packTarball(pkg.dir, tarballsDir)
  }

  const consumer = join(workdir, "consumer")
  console.log(`[tarball-smoke] Setting up consumer project at ${consumer}`)
  setupConsumerProject(consumer, tarballs)

  console.log("[tarball-smoke] Installing tarballs…")
  execSync("bun install --no-save", { cwd: consumer, stdio: "inherit" })

  console.log("[tarball-smoke] Type-checking consumer imports…")
  execSync("bunx tsc --noEmit -p tsconfig.json", { cwd: consumer, stdio: "inherit" })

  // Cleanup unless KEEP_WORKDIR is set.
  if (!process.env.KEEP_WORKDIR) {
    console.log(`[tarball-smoke] Cleaning up ${workdir}`)
    rmSync(workdir, { recursive: true, force: true })
  } else {
    console.log(`[tarball-smoke] KEEP_WORKDIR set; leaving ${workdir} for inspection`)
  }

  console.log(
    `[tarball-smoke] All ${packages.length} packages install + type-check from tarballs ✓`,
  )
}

main()
