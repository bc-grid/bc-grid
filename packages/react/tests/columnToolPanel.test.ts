import { describe, expect, test } from "bun:test"
import type { BcColumnStateEntry } from "@bc-grid/core"
import {
  buildColumnToolPanelItems,
  filterColumnToolPanelItems,
  moveColumnInToolPanel,
  reorderColumnInToolPanel,
  setColumnHidden,
  setColumnPinned,
} from "../src/columnToolPanel"
import type { BcReactGridColumn } from "../src/types"

interface Row {
  account: string
  balance: number
  status: string
}

const columns: readonly BcReactGridColumn<Row>[] = [
  { field: "account", header: "Account", groupable: true },
  { field: "balance", header: "Balance" },
  { field: "status", header: "Status", hidden: true },
]

describe("buildColumnToolPanelItems", () => {
  test("builds panel rows from column defaults and column state", () => {
    const items = buildColumnToolPanelItems(
      columns,
      [
        { columnId: "status", hidden: false, pinned: "left", position: 0 },
        { columnId: "account", position: 1 },
      ],
      [{ columnId: "balance", header: "Ledger balance" }],
    )

    expect(items.map((item) => item.columnId)).toEqual(["status", "account", "balance"])
    expect(items[0]).toMatchObject({
      columnId: "status",
      hidden: false,
      label: "Status",
      pinned: "left",
    })
    expect(items[2]).toMatchObject({
      columnId: "balance",
      groupable: true,
      label: "Ledger balance",
    })
  })

  test("disables hiding the last visible column", () => {
    const items = buildColumnToolPanelItems(columns, [
      { columnId: "balance", hidden: true },
      { columnId: "status", hidden: true },
    ])

    expect(items.find((item) => item.columnId === "account")?.hideDisabled).toBe(true)
    expect(items.find((item) => item.columnId === "balance")?.hideDisabled).toBe(false)
  })
})

describe("filterColumnToolPanelItems", () => {
  test("matches labels and column ids case-insensitively", () => {
    const items = buildColumnToolPanelItems(columns, [])

    expect(filterColumnToolPanelItems(items, "bal").map((item) => item.columnId)).toEqual([
      "balance",
    ])
    expect(filterColumnToolPanelItems(items, "STATUS").map((item) => item.columnId)).toEqual([
      "status",
    ])
  })
})

describe("column tool panel state updates", () => {
  test("updates hidden and pinned state without dropping existing entry data", () => {
    const state: readonly BcColumnStateEntry[] = [{ columnId: "account", width: 220 }]

    expect(setColumnHidden(state, "account", true)).toEqual([
      { columnId: "account", hidden: true, width: 220 },
    ])
    expect(setColumnPinned(state, "account", "left")).toEqual([
      { columnId: "account", pinned: "left", width: 220 },
    ])
    expect(setColumnPinned(state, "status", null)).toEqual([
      { columnId: "account", width: 220 },
      { columnId: "status", pinned: null },
    ])
  })

  test("reorders rows by assigning positions in panel order", () => {
    const items = buildColumnToolPanelItems(columns, [])

    expect(
      reorderColumnInToolPanel(items, [{ columnId: "balance", width: 140 }], "status", "account"),
    ).toEqual([
      { columnId: "status", position: 0 },
      { columnId: "account", position: 1 },
      { columnId: "balance", position: 2, width: 140 },
    ])
  })

  test("moves rows by offset for keyboard controls", () => {
    const items = buildColumnToolPanelItems(columns, [])

    expect(moveColumnInToolPanel(items, [], "balance", -1)).toEqual([
      { columnId: "balance", position: 0 },
      { columnId: "account", position: 1 },
      { columnId: "status", position: 2 },
    ])
    expect(moveColumnInToolPanel(items, [], "account", -1)).toEqual([])
  })
})
