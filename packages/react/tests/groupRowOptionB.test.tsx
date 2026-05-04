import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { BcGrid } from "../src/grid"
import type { BcGridColumn } from "../src/types"

// Worker1 v06 — regression guard for the pinned-lane Option B fix
// (#479). Worker3 flagged in their pinned-lane RFC verdict (#473):
// "verify <BcServerGrid rowModel='tree'> group rows still render
// correctly under Option B" (the new 3-track template
// `auto minmax(0, 1fr) auto`).
//
// Group rows render via `renderGroupRowCell` which uses
// `position: absolute; left: 0; width: totalWidth`. Absolute
// positioning sidesteps the row's grid layout entirely, so the
// 3-track template doesn't constrain the group cell's reach. These
// tests pin that contract so a future row-template change doesn't
// silently truncate the group cell.

interface Row {
  id: string
  name: string
  status: string
  amount: number
}

const columns: readonly BcGridColumn<Row>[] = [
  { columnId: "name", field: "name", header: "Name", width: 200 },
  { columnId: "status", field: "status", header: "Status", width: 120, groupable: true },
  { columnId: "amount", field: "amount", header: "Amount", width: 120, align: "right" },
]

const data: readonly Row[] = [
  { id: "a", name: "Acme", status: "active", amount: 100 },
  { id: "b", name: "Bravo", status: "active", amount: 200 },
  { id: "c", name: "Charlie", status: "inactive", amount: 50 },
]

describe("Group rows under Option B 3-track row template (worker1 v06 regression guard)", () => {
  test("groupBy=['status'] renders group rows with data-bc-grid-row-kind='group'", () => {
    const html = renderToStaticMarkup(
      <BcGrid<Row>
        ariaLabel="Customers"
        columns={columns}
        data={data}
        groupBy={["status"]}
        height={400}
        rowId={(row) => row.id}
      />,
    )
    expect(html).toContain('data-bc-grid-row-kind="group"')
  })

  test("group cell uses position:absolute + left:0 (sidesteps row grid layout)", () => {
    const html = renderToStaticMarkup(
      <BcGrid<Row>
        ariaLabel="Customers"
        columns={columns}
        data={data}
        groupBy={["status"]}
        height={400}
        rowId={(row) => row.id}
      />,
    )
    // The group cell's inline style declares position:absolute + left:0.
    // If a future row-template change forces grid layout to constrain
    // the group cell (e.g. drops the absolute positioning), this
    // assertion catches it before the cell visually clips.
    expect(html).toMatch(
      /class="bc-grid-cell bc-grid-group-cell[^"]*"[^>]*style="[^"]*position:absolute[^"]*"/,
    )
    expect(html).toMatch(
      /class="bc-grid-cell bc-grid-group-cell[^"]*"[^>]*style="[^"]*left:0[^"]*"/,
    )
  })

  test("group cell width spans the full row's totalWidth (not constrained to 1fr center track)", () => {
    const html = renderToStaticMarkup(
      <BcGrid<Row>
        ariaLabel="Customers"
        columns={columns}
        data={data}
        groupBy={["status"]}
        height={400}
        rowId={(row) => row.id}
      />,
    )
    // Sum of declared widths: name (200) + status (120) + amount (120) = 440px.
    // Group cell's inline `width: ${totalWidth}` should reflect this.
    // Under Option B, if grid layout were constraining the absolute cell,
    // the width would clamp to the 1fr center-track size — much smaller.
    expect(html).toMatch(
      /class="bc-grid-cell bc-grid-group-cell[^"]*"[^>]*style="[^"]*width:440px[^"]*"/,
    )
  })

  test("group cell carries aria-colspan equal to the visible column count", () => {
    const html = renderToStaticMarkup(
      <BcGrid<Row>
        ariaLabel="Customers"
        columns={columns}
        data={data}
        groupBy={["status"]}
        height={400}
        rowId={(row) => row.id}
      />,
    )
    // 3 visible columns → aria-colspan="3". AT contract is independent
    // of layout primitive but pinning it here catches accidental drops
    // when the row-template architecture next shifts.
    expect(html).toMatch(/class="bc-grid-cell bc-grid-group-cell[^"]*"[^>]*aria-colspan="3"/)
  })
})
