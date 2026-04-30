import { describe, expect, test } from "bun:test"
import type { BcColumnStateEntry } from "@bc-grid/core"
import { buildColumnHeaderLayout, flattenLeafColumns, resolveColumns } from "../src/gridInternals"
import type { BcReactGridColumn } from "../src/types"

interface Row {
  account: string
  jan: number
  feb: number
  mar: number
}

const groupedColumns = [
  {
    columnId: "account",
    field: "account",
    header: "Account",
    width: 100,
  },
  {
    columnId: "q1",
    header: "Q1 Sales",
    children: [
      { columnId: "jan", field: "jan", header: "Jan", width: 80 },
      { columnId: "feb", field: "feb", header: "Feb", width: 90 },
      { columnId: "mar", field: "mar", header: "Mar", width: 110 },
    ],
  },
] satisfies readonly BcReactGridColumn<Row>[]

describe("flattenLeafColumns", () => {
  test("returns body columns in visible tree order and excludes group-only nodes", () => {
    expect(flattenLeafColumns(groupedColumns).map((column) => column.columnId)).toEqual([
      "account",
      "jan",
      "feb",
      "mar",
    ])
  })

  test("inherits hidden and pinned hints from parent groups", () => {
    const columns = [
      {
        columnId: "locked",
        header: "Locked",
        hidden: true,
        pinned: "left",
        children: [{ columnId: "jan", field: "jan", header: "Jan" }],
      },
    ] satisfies readonly BcReactGridColumn<Row>[]

    expect(flattenLeafColumns(columns)).toEqual([
      expect.objectContaining({ columnId: "jan", hidden: true, pinned: "left" }),
    ])
  })
})

describe("buildColumnHeaderLayout", () => {
  test("renders parent groups with aria colspans and leaf row spans", () => {
    const resolved = resolveColumns(flattenLeafColumns(groupedColumns), [])
    const layout = buildColumnHeaderLayout(groupedColumns, resolved)

    expect(layout.rowCount).toBe(2)
    expect(
      layout.rows[0]?.map((cell) => [cell.kind, cell.id, cell.colStart, cell.colSpan]),
    ).toEqual([
      ["leaf", "account", 0, 1],
      ["group", "group-q1-1-3", 1, 3],
    ])
    expect(layout.rows[0]?.[0]).toEqual(
      expect.objectContaining({ kind: "leaf", id: "account", rowSpan: 2, width: 100 }),
    )
    expect(layout.rows[0]?.[1]).toEqual(
      expect.objectContaining({ kind: "group", colSpan: 3, left: 100, width: 280 }),
    )
    expect(
      layout.rows[1]?.map((cell) => [cell.kind, cell.id, cell.colStart, cell.rowSpan]),
    ).toEqual([
      ["leaf", "jan", 1, 1],
      ["leaf", "feb", 2, 1],
      ["leaf", "mar", 3, 1],
    ])
  })

  test("omits hidden leaves from group spans", () => {
    const columnState = [{ columnId: "jan", hidden: true }] satisfies readonly BcColumnStateEntry[]
    const resolved = resolveColumns(flattenLeafColumns(groupedColumns), columnState)
    const layout = buildColumnHeaderLayout(groupedColumns, resolved)

    expect(resolved.map((column) => column.columnId)).toEqual(["account", "feb", "mar"])
    expect(layout.rows[0]?.[1]).toEqual(
      expect.objectContaining({ kind: "group", colStart: 1, colSpan: 2, left: 100, width: 200 }),
    )
    expect(layout.rows[1]?.map((cell) => cell.id)).toEqual(["feb", "mar"])
  })

  test("splits a group header when leaf columns are reordered into disjoint segments", () => {
    const columnState = [
      { columnId: "account", position: 1 },
      { columnId: "jan", position: 0 },
      { columnId: "feb", position: 2 },
      { columnId: "mar", position: 3 },
    ] satisfies readonly BcColumnStateEntry[]
    const resolved = resolveColumns(flattenLeafColumns(groupedColumns), columnState)
    const layout = buildColumnHeaderLayout(groupedColumns, resolved)

    expect(resolved.map((column) => column.columnId)).toEqual(["jan", "account", "feb", "mar"])
    expect(
      layout.rows[0]
        ?.filter((cell) => cell.kind === "group")
        .map((cell) => [cell.id, cell.colStart, cell.colSpan]),
    ).toEqual([
      ["group-q1-0-0", 0, 1],
      ["group-q1-2-3", 2, 2],
    ])
  })
})
