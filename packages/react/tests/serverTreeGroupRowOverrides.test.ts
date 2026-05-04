import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Regression for bsncraft v0.6.0-alpha.1 P1 — server-tree group rows
 * rendered as empty data rows.
 *
 * Root cause: `<BcServerGrid rowModel="tree">` flattened the
 * `flatNodes` snapshot to extract `node.row` only:
 *
 *   const rows = flatNodes.map((node) => node.row)
 *
 * That stripped `kind: "group"` / `groupKey` / `level` / `childCount`
 * before passing to `<BcGrid>`, so the render loop's
 * `isDataRowEntry(entry)` gate always passed (every entry was
 * `kind: "data"`) and group rows rendered as flat data rows with
 * empty cells.
 *
 * Fix: `<BcServerGrid>` now ALSO builds
 * `__bcServerRowEntryOverrides` (a `Map<RowId,
 * ServerRowEntryOverride>`) from `flatNodes` and passes it to
 * `<BcGrid>` for tree mode. `<BcGrid>` consults the map after
 * `flattenGroupedRowTree` and synthesizes `GroupRowEntry` shape for
 * every override entry, so the render loop's group-row branch fires
 * correctly. Renamed from `serverRowEntryOverrides` to the `__bc`
 * prefix per v1.0 freeze audit (`docs/design/v1-api-surface-audit.md
 * §5 INTERNALIZE`) so the escape hatch de-emphasises in autocomplete.
 *
 * Pure source-shape regression suite — bun:test has no DOM.
 */

const here = fileURLToPath(new URL(".", import.meta.url))
const serverGridSource = readFileSync(`${here}../src/serverGrid.tsx`, "utf8")
const gridSource = readFileSync(`${here}../src/grid.tsx`, "utf8")
const typesSource = readFileSync(`${here}../src/types.ts`, "utf8")

describe("server-tree group-row overrides (bsncraft v0.6.0-alpha.1 P1)", () => {
  test("BcServerGrid builds the __bcServerRowEntryOverrides map from flatNodes", () => {
    expect(serverGridSource).toContain("const __bcServerRowEntryOverrides = useMemo")
    expect(serverGridSource).toMatch(/for \(const node of flatNodes\)/)
    expect(serverGridSource).toMatch(/if \(node\.kind !== "group"\) continue/)
    expect(serverGridSource).toMatch(/level: node\.level/)
    expect(serverGridSource).toMatch(/childCount.*node\.childCount/)
    expect(serverGridSource).toMatch(/childRowIds: node\.childIds/)
    expect(serverGridSource).toMatch(/expanded: expansionState\.has\(node\.rowId\)/)
  })

  test("label is derived from the latest groupKey in groupPath", () => {
    expect(serverGridSource).toMatch(
      /const groupKey = node\.groupPath\[node\.groupPath\.length - 1\]/,
    )
    expect(serverGridSource).toMatch(/const label = groupKey \? String\(groupKey\.value/)
  })

  test('childCount="unknown" is normalized to 0 (GroupRowEntry expects number)', () => {
    expect(serverGridSource).toMatch(
      /const childCount = node\.childCount === "unknown" \? 0 : node\.childCount/,
    )
  })

  test("BcServerGrid passes __bcServerRowEntryOverrides to <BcGrid> in tree mode only", () => {
    expect(serverGridSource).toMatch(
      /activeMode === "tree"\s*\?\s*\{\s*__bcServerRowEntryOverrides: tree\.__bcServerRowEntryOverrides\s*\}\s*:\s*\{\}/,
    )
  })

  test("TreeServerState type carries the __bcServerRowEntryOverrides field", () => {
    expect(serverGridSource).toMatch(
      /__bcServerRowEntryOverrides: ReadonlyMap<RowId, ServerRowEntryOverride>/,
    )
  })

  test("BcGrid post-processes rowEntries to inject GroupRowEntry shape from overrides", () => {
    // The post-process useMemo runs AFTER `flattenGroupedRowTree` so
    // the override-driven synthesis composes with whatever client
    // grouping the consumer also configured (manual mode + overrides
    // is the bsncraft case; client mode + overrides would be
    // unusual but the synthesis is still correct).
    expect(gridSource).toMatch(/const rowEntriesBase = useMemo<readonly RowEntry<TRow>\[\]>/)
    expect(gridSource).toMatch(/const overrides = props\.__bcServerRowEntryOverrides/)
    expect(gridSource).toMatch(
      /if \(!overrides \|\| overrides\.size === 0\) return groupedRowModel\.rows/,
    )
    expect(gridSource).toMatch(/kind: "group" as const/)
    expect(gridSource).toMatch(/satisfies GroupRowEntry/)
  })

  test("BcGridProps surfaces __bcServerRowEntryOverrides as an internal escape hatch (v1.0 INTERNALIZE)", () => {
    expect(typesSource).toContain(
      "__bcServerRowEntryOverrides?: ReadonlyMap<RowId, ServerRowEntryOverride>",
    )
    // Pin the @internal JSDoc tag so consumer-doc generators
    // (typedoc, etc.) hide the field from the public surface.
    expect(typesSource).toMatch(/@internal Not part of the consumer-facing API/)
  })

  test("ServerRowEntryOverride type matches the GroupRowEntry shape (excluding index)", () => {
    expect(typesSource).toMatch(/export interface ServerRowEntryOverride/)
    expect(typesSource).toMatch(/kind: "group"/)
    expect(typesSource).toMatch(/level: number/)
    expect(typesSource).toMatch(/label: string/)
    expect(typesSource).toMatch(/childCount: number/)
    expect(typesSource).toMatch(/childRowIds: readonly RowId\[\]/)
    expect(typesSource).toMatch(/expanded: boolean/)
  })
})
