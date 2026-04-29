import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import * as ts from "typescript"
import type { PackageApiSurfaceManifest } from "./manifest"

export interface ExtractedApiSurface {
  declarationExports: string[]
  runtimeExports: string[]
}

export interface ApiSurfaceDiff {
  missingDeclarationExports: string[]
  unexpectedDeclarationExports: string[]
  missingRuntimeExports: string[]
  unexpectedRuntimeExports: string[]
}

export interface ApiSurfaceResult {
  packageName: string
  mode: PackageApiSurfaceManifest["mode"]
  note?: string
  actual: ExtractedApiSurface
  expected: ExtractedApiSurface
  diff: ApiSurfaceDiff
}

export function checkApiSurface(
  manifests: readonly PackageApiSurfaceManifest[],
  repoRoot = findRepoRoot(),
): ApiSurfaceResult[] {
  return manifests.map((manifest) => {
    const actual = readPackageSurface(manifest, repoRoot)
    const expected = {
      declarationExports: sortedUnique(manifest.declarationExports),
      runtimeExports: sortedUnique(manifest.runtimeExports),
    }
    const enforceMissing = manifest.mode === "enforced"

    return {
      packageName: manifest.packageName,
      mode: manifest.mode,
      ...(manifest.note ? { note: manifest.note } : {}),
      actual,
      expected,
      diff: {
        missingDeclarationExports: enforceMissing
          ? difference(expected.declarationExports, actual.declarationExports)
          : [],
        unexpectedDeclarationExports: difference(
          actual.declarationExports,
          expected.declarationExports,
        ),
        missingRuntimeExports: enforceMissing
          ? difference(expected.runtimeExports, actual.runtimeExports)
          : [],
        unexpectedRuntimeExports: difference(actual.runtimeExports, expected.runtimeExports),
      },
    }
  })
}

export function hasApiSurfaceDrift(results: readonly ApiSurfaceResult[]): boolean {
  return results.some((result) => {
    return (
      result.diff.missingDeclarationExports.length > 0 ||
      result.diff.unexpectedDeclarationExports.length > 0 ||
      result.diff.missingRuntimeExports.length > 0 ||
      result.diff.unexpectedRuntimeExports.length > 0
    )
  })
}

export function formatApiSurfaceReport(results: readonly ApiSurfaceResult[]): string {
  if (!hasApiSurfaceDrift(results)) {
    const enforcedCount = results.filter((result) => result.mode === "enforced").length
    const plannedCount = results.filter((result) => result.mode === "planned").length
    return `API surface check passed (${enforcedCount} enforced packages, ${plannedCount} planned packages).`
  }

  const lines = ["API surface drift detected:"]
  for (const result of results) {
    if (!hasResultDrift(result)) continue
    lines.push("", `${result.packageName} (${result.mode})`)
    if (result.note) lines.push(`  note: ${result.note}`)
    pushDiffLine(lines, "missing declarations", result.diff.missingDeclarationExports)
    pushDiffLine(lines, "unexpected declarations", result.diff.unexpectedDeclarationExports)
    pushDiffLine(lines, "missing runtime exports", result.diff.missingRuntimeExports)
    pushDiffLine(lines, "unexpected runtime exports", result.diff.unexpectedRuntimeExports)
  }
  return lines.join("\n")
}

export function readPackageSurface(
  manifest: PackageApiSurfaceManifest,
  repoRoot = findRepoRoot(),
): ExtractedApiSurface {
  const declarationPath = path.resolve(repoRoot, manifest.declarationPath)
  const runtimePath = path.resolve(repoRoot, manifest.runtimePath)

  return {
    declarationExports: existsSync(declarationPath)
      ? extractExportNamesFromText(
          readFileSync(declarationPath, "utf8"),
          declarationPath,
          ts.ScriptKind.TS,
        )
      : [],
    runtimeExports: existsSync(runtimePath)
      ? extractExportNamesFromText(readFileSync(runtimePath, "utf8"), runtimePath, ts.ScriptKind.JS)
      : [],
  }
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

export function extractExportNamesFromText(
  sourceText: string,
  fileName = "index.ts",
  scriptKind: ts.ScriptKind = ts.ScriptKind.TS,
): string[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  )
  const names = new Set<string>()

  for (const statement of sourceFile.statements) {
    collectStatementExports(statement, names)
  }

  return sortedUnique(names)
}

function collectStatementExports(statement: ts.Statement, names: Set<string>): void {
  if (ts.isExportDeclaration(statement)) {
    if (!statement.exportClause) {
      names.add("*")
      return
    }
    if (!ts.isNamedExports(statement.exportClause)) return
    for (const specifier of statement.exportClause.elements) {
      names.add(specifier.name.text)
    }
    return
  }

  if (ts.isExportAssignment(statement)) {
    names.add("default")
    return
  }

  if (!hasExportModifier(statement)) return

  if (hasDefaultModifier(statement)) {
    names.add("default")
    return
  }

  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      collectBindingNameExports(declaration.name, names)
    }
    return
  }

  const namedDeclaration = statement as ts.DeclarationStatement
  if (namedDeclaration.name && ts.isIdentifier(namedDeclaration.name)) {
    names.add(namedDeclaration.name.text)
  }
}

function collectBindingNameExports(bindingName: ts.BindingName, names: Set<string>): void {
  if (ts.isIdentifier(bindingName)) {
    names.add(bindingName.text)
    return
  }

  for (const element of bindingName.elements) {
    if (ts.isBindingElement(element)) collectBindingNameExports(element.name, names)
  }
}

function hasExportModifier(node: ts.Node): boolean {
  return getModifiers(node).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
}

function hasDefaultModifier(node: ts.Node): boolean {
  return getModifiers(node).some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
}

function getModifiers(node: ts.Node): readonly ts.Modifier[] {
  return ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : []
}

function hasResultDrift(result: ApiSurfaceResult): boolean {
  return (
    result.diff.missingDeclarationExports.length > 0 ||
    result.diff.unexpectedDeclarationExports.length > 0 ||
    result.diff.missingRuntimeExports.length > 0 ||
    result.diff.unexpectedRuntimeExports.length > 0
  )
}

function pushDiffLine(lines: string[], label: string, values: readonly string[]): void {
  if (values.length === 0) return
  lines.push(`  ${label}: ${values.join(", ")}`)
}

function difference(left: readonly string[], right: readonly string[]): string[] {
  const rightSet = new Set(right)
  return left.filter((value) => !rightSet.has(value))
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}
