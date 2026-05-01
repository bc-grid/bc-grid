import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import {
  deriveColumnGroupHeaderRows,
  flattenColumnDefinitions,
  resolveColumns,
} from "../src/gridInternals"
import { renderColumnGroupHeaderCell } from "../src/headerCells"
import type { BcReactGridColumn } from "../src/types"

interface Row {
  account: string
  current: number
  days1to30: number
  days31to60: number
}

const agingGroupColumn = {
  columnId: "aging",
  header: "Aging",
  children: [
    {
      columnId: "current",
      field: "current",
      header: "Current",
      width: 110,
    },
    {
      columnId: "pastDue",
      header: "Past Due",
      children: [
        {
          columnId: "days1to30",
          field: "days1to30",
          header: "1-30",
          width: 100,
        },
        {
          columnId: "days31to60",
          field: "days31to60",
          header: "31-60",
          width: 100,
        },
      ],
    },
  ],
} satisfies BcReactGridColumn<Row>

const groupedColumns = [
  {
    columnId: "account",
    field: "account",
    header: "Account",
    pinned: "left",
    width: 120,
  },
  agingGroupColumn,
] satisfies readonly BcReactGridColumn<Row>[]

const unpinnedGroupedColumns = [
  {
    columnId: "account",
    field: "account",
    header: "Account",
    width: 120,
  },
  agingGroupColumn,
] satisfies readonly BcReactGridColumn<Row>[]

describe("column group flattening", () => {
  test("resolves only visible leaf columns in display order", () => {
    const flattened = flattenColumnDefinitions(groupedColumns)

    expect(flattened.map((entry) => entry.columnId)).toEqual([
      "account",
      "current",
      "days1to30",
      "days31to60",
    ])
    expect(flattened.map((entry) => entry.groupPath.map((group) => group.groupId))).toEqual([
      [],
      ["aging"],
      ["aging", "pastDue"],
      ["aging", "pastDue"],
    ])

    const resolved = resolveColumns(groupedColumns, [])
    expect(resolved.map((column) => column.columnId)).toEqual([
      "account",
      "current",
      "days1to30",
      "days31to60",
    ])
    expect(resolved.map((column) => column.left)).toEqual([0, 120, 230, 330])
  })

  test("derives multi-row grouped header spans from visible leaves", () => {
    const resolved = resolveColumns(groupedColumns, [])
    const rows = deriveColumnGroupHeaderRows(groupedColumns, resolved)

    expect(rows).toHaveLength(2)
    expect(rows[0]?.map((cell) => cell.groupId)).toEqual(["aging"])
    expect(rows[0]?.[0]).toMatchObject({
      ariaColIndex: 2,
      ariaColSpan: 3,
      left: 120,
      width: 310,
    })
    expect(rows[1]?.map((cell) => cell.groupId)).toEqual(["pastDue"])
    expect(rows[1]?.[0]).toMatchObject({
      ariaColIndex: 3,
      ariaColSpan: 2,
      left: 230,
      width: 200,
    })
  })

  test("splits a parent group when leaf order makes its columns non-contiguous", () => {
    const resolved = resolveColumns(unpinnedGroupedColumns, [
      { columnId: "days1to30", position: 0 },
      { columnId: "account", position: 1 },
      { columnId: "current", position: 2 },
      { columnId: "days31to60", position: 3 },
    ])
    const rows = deriveColumnGroupHeaderRows(unpinnedGroupedColumns, resolved)

    expect(rows[0]?.map((cell) => cell.leafColumnIds)).toEqual([
      ["days1to30"],
      ["current", "days31to60"],
    ])
  })
})

describe("renderColumnGroupHeaderCell", () => {
  test("renders grouped header ARIA colspan semantics", () => {
    const resolved = resolveColumns(groupedColumns, [])
    const [cell] = deriveColumnGroupHeaderRows(groupedColumns, resolved)[0] ?? []
    if (!cell) throw new Error("expected grouped header cell")

    const html = renderToStaticMarkup(
      renderColumnGroupHeaderCell({
        cell,
        domBaseId: "grid",
        headerHeight: 40,
        scrollLeft: 0,
        totalWidth: 430,
        viewportWidth: 430,
      }),
    )

    expect(html).toContain('role="columnheader"')
    expect(html).toContain('aria-colspan="3"')
    expect(html).toContain('aria-colindex="2"')
    expect(html).toContain('data-bc-grid-column-group-id="aging"')
    expect(html).toContain("Aging")
  })
})
