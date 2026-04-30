import { describe, expect, test } from "bun:test"
import type { ColumnId } from "@bc-grid/core"
import { type DataRowEntry, type GroupRowEntry, resolveColumns } from "../src/gridInternals"
import { buildGroupedRowModel, formatGroupRowLabel } from "../src/grouping"
import type { BcReactGridColumn } from "../src/types"

interface Row {
  id: string
  status: string | null
  region: string
  amount: number
}

const rows: readonly Row[] = [
  { id: "1", status: "Open", region: "North", amount: 10 },
  { id: "2", status: "Closed", region: "North", amount: 20 },
  { id: "3", status: "Open", region: "South", amount: 30 },
  { id: "4", status: null, region: "South", amount: 40 },
]

const columns: readonly BcReactGridColumn<Row>[] = [
  { columnId: "status", field: "status", header: "Status" },
  { columnId: "region", field: "region", header: "Region" },
  { columnId: "amount", field: "amount", header: "Amount" },
]

const rowEntries: readonly DataRowEntry<Row>[] = rows.map((row, index) => ({
  kind: "data",
  row,
  rowId: row.id,
  index,
}))

describe("buildGroupedRowModel", () => {
  test("returns a flat model when no group columns resolve", () => {
    const model = buildModel(["missing"])

    expect(model.active).toBe(false)
    expect(model.allGroupRowIds).toEqual([])
    expect(model.rows.map((entry) => entry.rowId)).toEqual(["1", "2", "3", "4"])
    expect(model.rows.every((entry) => entry.kind === "data")).toBe(true)
  })

  test("creates collapsed group headers in leaf row order with row counts", () => {
    const model = buildModel(["status"])

    expect(model.active).toBe(true)
    expect(model.rows.every((entry) => entry.kind === "group")).toBe(true)
    expect(model.rows.map((entry) => (entry as GroupRowEntry).formattedValue)).toEqual([
      "Open",
      "Closed",
      "(Blank)",
    ])
    expect(model.rows.map((entry) => (entry as GroupRowEntry).childCount)).toEqual([2, 1, 1])
    expect(formatGroupRowLabel(model.rows[0] as GroupRowEntry)).toBe("Status: Open")
  })

  test("expands a group row and stamps tree levels on leaves", () => {
    const collapsed = buildModel(["status"])
    const openGroupId = visibleGroupIds(collapsed)[0]
    if (!openGroupId) throw new Error("expected group id")

    const expanded = buildModel(["status"], new Set([openGroupId]))

    expect(expanded.rows.map((entry) => entry.rowId)).toEqual([
      openGroupId,
      "1",
      "3",
      visibleGroupIds(collapsed)[1],
      visibleGroupIds(collapsed)[2],
    ])
    expect(expanded.rows[0]).toMatchObject({ kind: "group", level: 1, expanded: true })
    expect(expanded.rows[1]).toMatchObject({ kind: "data", level: 2 })
    expect(expanded.rows[2]).toMatchObject({ kind: "data", level: 2 })
  })

  test("builds nested groups for multiple group-by columns", () => {
    const byStatus = buildModel(["status", "region"])
    const openGroupId = visibleGroupIds(byStatus)[0]
    if (!openGroupId) throw new Error("expected status group id")
    expect(byStatus.allGroupRowIds).toHaveLength(7)

    const byStatusExpanded = buildModel(["status", "region"], new Set([openGroupId]))
    const northGroup = byStatusExpanded.rows.find(
      (entry): entry is GroupRowEntry =>
        entry.kind === "group" &&
        entry.groupColumnId === "region" &&
        entry.formattedValue === "North",
    )
    if (!northGroup) throw new Error("expected nested North group")

    const expanded = buildModel(["status", "region"], new Set([openGroupId, northGroup.rowId]))

    expect(expanded.rows.map((entry) => [entry.kind, entry.rowId, entry.level])).toEqual([
      ["group", openGroupId, 1],
      ["group", northGroup.rowId, 2],
      ["data", "1", 3],
      ["group", byStatusExpanded.rows[2]?.rowId, 2],
      ["group", visibleGroupIds(byStatus)[1], 1],
      ["group", visibleGroupIds(byStatus)[2], 1],
    ])
  })
})

function buildModel(groupBy: readonly ColumnId[], expansionState = new Set<string>()) {
  return buildGroupedRowModel({
    rows: rowEntries,
    columns: resolveColumns(columns, []),
    groupBy,
    expansionState,
  })
}

function visibleGroupIds(model: ReturnType<typeof buildModel>): readonly string[] {
  return model.rows
    .filter((entry): entry is GroupRowEntry => entry.kind === "group")
    .map((entry) => entry.rowId)
}
