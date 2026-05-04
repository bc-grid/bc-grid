import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { BcGrid } from "../src/grid"
import type { BcGridColumn, ServerRowEntryOverride } from "../src/types"

/**
 * Server-tree ARIA semantics — closes the v1 screenreader audit §5 GAP.
 *
 * `<BcServerGrid rowModel="tree">` emits both group and leaf rows
 * through the `__bcServerRowEntryOverrides` map. Group rows already
 * surfaced `aria-level` via the `GroupRowEntry` synthesis at
 * `grid.tsx:1430-1440`. Leaf rows did NOT — `aria-level` was conditional
 * on `groupingActive || treeModeActive`, and server-tree mode satisfies
 * neither (it sets `rowProcessingMode="manual"` and never passes
 * `treeData`).
 *
 * The fix:
 * - Extend `ServerRowEntryOverride` with a `kind: "data"` variant
 *   carrying just the row's hierarchy depth.
 * - serverGrid populates a data override for every leaf node alongside
 *   the existing group overrides.
 * - BcGrid stamps `level` onto the DataRowEntry when consuming a data
 *   override, and detects server-tree mode via overrides being non-empty.
 *
 * This file exercises just the BcGrid consumption path with a manually-
 * constructed override map — the same shape serverGrid produces. We
 * bypass the `<BcServerGrid>` wrapper and its async loaders so the test
 * stays SSR / bun-test friendly.
 */

interface BomRow {
  id: string
  name: string
}

const columns: readonly BcGridColumn<BomRow>[] = [
  { columnId: "name", field: "name", header: "Material", width: 240 },
]

const rows: readonly BomRow[] = [
  { id: "ASSEMBLY-A", name: "Assembly A" },
  { id: "SUB-A-1", name: "Sub A-1" },
  { id: "PART-A-1-a", name: "Part A-1-a" },
]

describe("server-tree ARIA semantics (v1 screenreader audit §5)", () => {
  test("server-tree mode → root role='treegrid'", () => {
    // Single leaf override is enough to flip the role — `serverTreeActive`
    // is signalled by overrides being non-empty.
    const overrides = new Map<string, ServerRowEntryOverride>([
      ["ASSEMBLY-A", { kind: "data", level: 0 }],
    ])
    const html = renderToStaticMarkup(
      <BcGrid<BomRow>
        ariaLabel="Server tree"
        columns={columns}
        data={rows.slice(0, 1)}
        rowId={(row) => row.id}
        rowProcessingMode="manual"
        __bcServerRowEntryOverrides={overrides}
        height={240}
      />,
    )
    expect(html).toContain('role="treegrid"')
    expect(html).not.toMatch(/role="grid"\s/)
  })

  test("server-tree mode → leaf rows surface aria-level", () => {
    // 3-deep server-tree leaf chain: level 0, 1, 2 (matches the BOM
    // example in the screenreader audit doc).
    const overrides = new Map<string, ServerRowEntryOverride>([
      ["ASSEMBLY-A", { kind: "data", level: 0 }],
      ["SUB-A-1", { kind: "data", level: 1 }],
      ["PART-A-1-a", { kind: "data", level: 2 }],
    ])
    const html = renderToStaticMarkup(
      <BcGrid<BomRow>
        ariaLabel="Server tree leaves"
        columns={columns}
        data={rows}
        rowId={(row) => row.id}
        rowProcessingMode="manual"
        __bcServerRowEntryOverrides={overrides}
        height={240}
      />,
    )
    // Each leaf row carries its server-reported level. Pre-fix all three
    // would have been `aria-level` undefined.
    expect(html).toMatch(/aria-rowindex="\d+"\s+aria-level="0"/)
    expect(html).toMatch(/aria-rowindex="\d+"\s+aria-level="1"/)
    expect(html).toMatch(/aria-rowindex="\d+"\s+aria-level="2"/)
  })

  test("server-tree mode → group-row override path still works (no regression)", () => {
    // The existing GroupRowEntry synthesis path (bsncraft v0.6.0-alpha.1
    // P1, #465) must not break. Group rows still carry kind:"group" with
    // label / childCount / childRowIds / expanded.
    const overrides = new Map<string, ServerRowEntryOverride>([
      [
        "ASSEMBLY-A",
        {
          kind: "group",
          level: 0,
          label: "Assembly A",
          childCount: 2,
          childRowIds: ["SUB-A-1"],
          expanded: true,
        },
      ],
      ["SUB-A-1", { kind: "data", level: 1 }],
    ])
    const html = renderToStaticMarkup(
      <BcGrid<BomRow>
        ariaLabel="Server tree mixed"
        columns={columns}
        data={rows.slice(0, 2)}
        rowId={(row) => row.id}
        rowProcessingMode="manual"
        __bcServerRowEntryOverrides={overrides}
        height={240}
      />,
    )
    // Root flips to treegrid because overrides is non-empty.
    expect(html).toContain('role="treegrid"')
    // Group row rendered with aria-level (always set on GroupRowEntry).
    expect(html).toMatch(/aria-level="0"/)
    // Leaf row also rendered with aria-level via the data-override path.
    expect(html).toMatch(/aria-level="1"/)
  })

  test("no overrides → role='grid' (no regression for non-tree manual mode)", () => {
    // Manual rowProcessingMode without overrides (e.g., paged + infinite
    // server modes) must keep role='grid' and NOT emit aria-level.
    const html = renderToStaticMarkup(
      <BcGrid<BomRow>
        ariaLabel="Manual paged"
        columns={columns}
        data={rows}
        rowId={(row) => row.id}
        rowProcessingMode="manual"
        height={240}
      />,
    )
    expect(html).toMatch(/role="grid"\s/)
    expect(html).not.toContain('role="treegrid"')
    expect(html).not.toContain("aria-level=")
  })
})
