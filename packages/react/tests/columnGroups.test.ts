import { describe, expect, test } from "bun:test"
import type { BcColumnStateEntry } from "@bc-grid/core"
import { buildColumnHeaderGroups, flattenLeafColumns, resolveColumns } from "../src/gridInternals"
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

  test("preserves leaf column metadata", () => {
    const columns = [
      {
        columnId: "locked",
        header: "Locked",
        children: [{ columnId: "jan", field: "jan", header: "Jan", hidden: true, pinned: "left" }],
      },
    ] satisfies readonly BcReactGridColumn<Row>[]

    expect(flattenLeafColumns(columns)).toEqual([
      expect.objectContaining({ columnId: "jan", hidden: true, pinned: "left" }),
    ])
  })
})

describe("buildColumnHeaderGroups", () => {
  test("renders parent groups with aria colspans", () => {
    const resolved = resolveColumns(flattenLeafColumns(groupedColumns), [])
    const layout = buildColumnHeaderGroups(groupedColumns, resolved)

    expect(layout.length).toBe(1)
    expect(layout[0]?.map((cell) => [cell[1], cell[2]])).toEqual([[1, 3]])
    expect(layout[0]?.[0]?.slice(1, 5)).toEqual([1, 3, 100, 280])
  })

  test("omits hidden leaves from group spans", () => {
    const columnState = [{ columnId: "jan", hidden: true }] satisfies readonly BcColumnStateEntry[]
    const resolved = resolveColumns(flattenLeafColumns(groupedColumns), columnState)
    const layout = buildColumnHeaderGroups(groupedColumns, resolved)

    expect(resolved.map((column) => column.columnId)).toEqual(["account", "feb", "mar"])
    expect(layout[0]?.[0]?.slice(1, 5)).toEqual([1, 2, 100, 200])
  })

  test("splits a group header when leaf columns are reordered into disjoint segments", () => {
    const columnState = [
      { columnId: "account", position: 1 },
      { columnId: "jan", position: 0 },
      { columnId: "feb", position: 2 },
      { columnId: "mar", position: 3 },
    ] satisfies readonly BcColumnStateEntry[]
    const resolved = resolveColumns(flattenLeafColumns(groupedColumns), columnState)
    const layout = buildColumnHeaderGroups(groupedColumns, resolved)

    expect(resolved.map((column) => column.columnId)).toEqual(["jan", "account", "feb", "mar"])
    expect(layout[0]?.map((cell) => [cell[1], cell[2]])).toEqual([
      [0, 1],
      [2, 2],
    ])
  })
})
