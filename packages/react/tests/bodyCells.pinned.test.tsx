import { describe, expect, test } from "bun:test"
import type { RowId } from "@bc-grid/core"
import { renderToStaticMarkup } from "react-dom/server"
import { renderBodyCell } from "../src/bodyCells"
import type { DataRowEntry, ResolvedColumn } from "../src/gridInternals"

interface Row {
  id: string
  name: string
}

const row: Row = { id: "r1", name: "Acme" }

const entry: DataRowEntry<Row> = {
  kind: "data",
  row,
  rowId: "r1" as RowId,
  index: 0,
}

const pinnedRightColumn: ResolvedColumn<Row> = {
  align: "left",
  columnId: "name",
  left: 300,
  pinned: "right",
  position: 3,
  source: { columnId: "name", field: "name", header: "Name" },
  width: 90,
}

describe("renderBodyCell — pinned lanes", () => {
  test("renders pinned-lane cells relative to the lane, not with scroll compensation", () => {
    const html = renderToStaticMarkup(
      renderBodyCell({
        activeCell: null,
        column: pinnedRightColumn,
        domBaseId: "grid",
        entry,
        locale: undefined,
        onCellFocus: undefined,
        pinnedEdge: "right",
        pinnedLaneOffset: 300,
        searchText: "",
        scrollLeft: 120,
        selected: false,
        disabled: false,
        expanded: false,
        setActiveCell: () => {},
        totalWidth: 390,
        viewportWidth: 240,
        virtualCol: { index: 3, left: 300, width: 90, pinned: "right" },
        virtualRow: { height: 30 },
      }),
    )

    expect(html).toContain("bc-grid-cell-pinned-right")
    expect(html).toContain("bc-grid-cell-pinned-right-edge")
    expect(html).toContain("left:0")
    expect(html).not.toContain("translate3d")
  })
})
