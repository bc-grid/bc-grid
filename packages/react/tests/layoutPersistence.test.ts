import { describe, expect, test } from "bun:test"
import type { BcColumnStateEntry, BcGridFilter } from "@bc-grid/core"
import {
  buildLayoutColumnState,
  mergeLayoutColumnState,
  pruneLayoutFilterForColumns,
  pruneLayoutGroupByForColumns,
  pruneLayoutSortForColumns,
} from "../src/gridInternals"
import type { BcReactGridColumn } from "../src/types"

interface Row {
  account: string
  status: string
  amount: number
}

const columns = [
  { columnId: "account", field: "account", header: "Account", pinned: "left", width: 140 },
  { columnId: "status", field: "status", header: "Status" },
  { columnId: "amount", field: "amount", header: "Amount", flex: 1 },
] satisfies readonly BcReactGridColumn<Row>[]

describe("layout persistence helpers", () => {
  test("round-trips column order, width, flex, pinning, and visibility", () => {
    const current = [
      { columnId: "account", hidden: false, pinned: null, position: 2, width: 240 },
      { columnId: "status", hidden: true, position: 0, width: 160 },
      { columnId: "amount", flex: 2, hidden: false, pinned: "right", position: 1, width: 180 },
    ] satisfies readonly BcColumnStateEntry[]

    const saved = buildLayoutColumnState(columns, current)
    const restored = mergeLayoutColumnState(columns, [], saved)

    expect(restored).toEqual(saved)
    expect(restored).toEqual([
      { columnId: "account", hidden: false, pinned: null, position: 2, width: 240 },
      { columnId: "status", hidden: true, pinned: null, position: 0, width: 160 },
      {
        columnId: "amount",
        flex: 2,
        hidden: false,
        pinned: "right",
        position: 1,
        width: 180,
      },
    ])
  })

  test("ignores unknown columns and preserves missing known columns", () => {
    const current = [
      { columnId: "account", hidden: false, pinned: "left", position: 0, width: 140 },
      { columnId: "status", hidden: true, pinned: null, position: 1, width: 120 },
      { columnId: "amount", flex: 1, hidden: false, pinned: null, position: 2, width: 120 },
    ] satisfies readonly BcColumnStateEntry[]
    const restored = mergeLayoutColumnState(columns, current, [
      { columnId: "legacy", hidden: false, position: 0, width: 999 },
      { columnId: "account", pinned: null, width: 280 },
    ])

    expect(restored).toEqual([
      { columnId: "account", hidden: false, pinned: null, position: 0, width: 280 },
      { columnId: "status", hidden: true, pinned: null, position: 1, width: 120 },
      { columnId: "amount", flex: 1, hidden: false, pinned: null, position: 2, width: 120 },
    ])
  })

  test("preserves flex null as an explicit cleared-flex layout state", () => {
    const current = [
      { columnId: "amount", flex: null, hidden: false, pinned: null, position: 2, width: 220 },
    ] satisfies readonly BcColumnStateEntry[]

    const saved = buildLayoutColumnState(columns, current)
    const restored = mergeLayoutColumnState(columns, [], saved)

    expect(saved.find((entry) => entry.columnId === "amount")).toEqual({
      columnId: "amount",
      flex: null,
      hidden: false,
      pinned: null,
      position: 2,
      width: 220,
    })
    expect(restored.find((entry) => entry.columnId === "amount")).toEqual({
      columnId: "amount",
      flex: null,
      hidden: false,
      pinned: null,
      position: 2,
      width: 220,
    })
  })

  test("restores known column layout after schema changes without corrupting new columns", () => {
    const nextColumns = [
      { columnId: "account", field: "account", header: "Account", pinned: "left", width: 140 },
      { columnId: "region", field: "status", header: "Region", width: 150 },
      { columnId: "amount", field: "amount", header: "Amount", flex: 1 },
    ] satisfies readonly BcReactGridColumn<Row>[]
    const savedBeforeSchemaChange = [
      { columnId: "amount", flex: 2, hidden: false, pinned: "right", position: 0, width: 180 },
      { columnId: "legacy", hidden: true, pinned: "left", position: 1, width: 999 },
      { columnId: "account", hidden: true, pinned: null, position: 2, width: 260 },
      { columnId: "status", hidden: false, pinned: null, position: 3, width: 120 },
    ] satisfies readonly BcColumnStateEntry[]

    const restored = mergeLayoutColumnState(nextColumns, [], savedBeforeSchemaChange)

    expect(restored).toEqual([
      { columnId: "account", hidden: true, pinned: null, position: 2, width: 260 },
      { columnId: "region", hidden: false, pinned: null, position: 1, width: 150 },
      {
        columnId: "amount",
        flex: 2,
        hidden: false,
        pinned: "right",
        position: 0,
        width: 180,
      },
    ])
  })

  test("prunes sort, group, and filter state to current columns", () => {
    const known = new Set(["account", "status"])
    const filter = {
      kind: "group",
      op: "and",
      filters: [
        { kind: "column", columnId: "status", type: "text", op: "contains", value: "open" },
        { kind: "column", columnId: "legacy", type: "text", op: "contains", value: "old" },
      ],
    } satisfies BcGridFilter

    expect(
      pruneLayoutSortForColumns(
        [
          { columnId: "amount", direction: "desc" },
          { columnId: "account", direction: "asc" },
        ],
        known,
      ),
    ).toEqual([{ columnId: "account", direction: "asc" }])
    expect(pruneLayoutGroupByForColumns(["legacy", "status", "account"], known)).toEqual([
      "status",
      "account",
    ])
    expect(pruneLayoutFilterForColumns(filter, known)).toEqual({
      kind: "group",
      op: "and",
      filters: [
        { kind: "column", columnId: "status", type: "text", op: "contains", value: "open" },
      ],
    })
  })
})
