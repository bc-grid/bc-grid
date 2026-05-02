import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import * as ts from "typescript"

interface Finding {
  column: number
  file: string
  line: number
  message: string
}

const repoRoot = path.resolve(import.meta.dirname, "..")
const packagesDir = path.join(repoRoot, "packages")
const findings: Finding[] = []

for (const packageDir of listDirectories(packagesDir)) {
  const testsDir = path.join(packageDir, "tests")
  if (!existsSync(testsDir)) continue
  for (const file of listSourceFiles(testsDir)) {
    checkTestFile(file)
  }
}

if (findings.length > 0) {
  console.error("Relative imports from package tests into another package's src/ are not allowed.")
  console.error("Use that package's public @bc-grid/* export instead.\n")
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}:${finding.column} ${finding.message}`)
  }
  process.exit(1)
}

function checkTestFile(filePath: string): void {
  const sourcePackage = packageNameForPath(filePath)
  if (!sourcePackage) return

  const sourceText = readFileSync(filePath, "utf8")
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true)

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      checkModuleSpecifier(filePath, sourcePackage, sourceFile, node.moduleSpecifier)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

function checkModuleSpecifier(
  filePath: string,
  sourcePackage: string,
  sourceFile: ts.SourceFile,
  moduleSpecifier: ts.Expression | undefined,
): void {
  if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) return
  const specifier = moduleSpecifier.text
  if (!specifier.startsWith(".")) return

  const targetPath = path.resolve(path.dirname(filePath), specifier)
  const targetPackage = packageNameForPath(targetPath)
  if (!targetPackage || targetPackage === sourcePackage) return
  if (!isPackageSrcPath(targetPath, targetPackage)) return

  const position = sourceFile.getLineAndCharacterOfPosition(moduleSpecifier.getStart(sourceFile))
  findings.push({
    column: position.character + 1,
    file: path.relative(repoRoot, filePath),
    line: position.line + 1,
    message: `${specifier} crosses from @bc-grid/${sourcePackage} tests into @bc-grid/${targetPackage}/src.`,
  })
}

function isPackageSrcPath(filePath: string, packageName: string): boolean {
  const packageSrc = path.join(packagesDir, packageName, "src")
  const relative = path.relative(packageSrc, filePath)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function packageNameForPath(filePath: string): string | null {
  const relative = path.relative(packagesDir, filePath)
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null
  const [packageName] = relative.split(path.sep)
  return packageName || null
}

function listDirectories(dir: string): string[] {
  return readdirSync(dir)
    .map((entry) => path.join(dir, entry))
    .filter((entry) => statSync(entry).isDirectory())
}

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir).map((entry) => path.join(dir, entry))
  return entries.flatMap((entry) => {
    const stats = statSync(entry)
    if (stats.isDirectory()) return listSourceFiles(entry)
    return /\.(?:tsx?|jsx?)$/.test(entry) ? [entry] : []
  })
}
