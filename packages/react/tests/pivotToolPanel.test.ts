import { describe, expect, test } from "bun:test"
import type { BcPivotState } from "@bc-grid/core"
import {
  BcPivotToolPanel,
  addPivotColumnToZone,
  buildPivotToolPanelItems,
  movePivotEntry,
  removePivotEntry,
  setPivotValueAggregation,
} from "../src/pivotToolPanel"
import { resolveSidebarPanels } from "../src/sidebar"
import type { BcReactGridColumn, BcSidebarContext } from "../src/types"

interface Row {
  account: string
  balance: number
  postedOn: string
  region: string
}

const columns: readonly BcReactGridColumn<Row>[] = [
  { field: "region", header: "Region" },
  { field: "account", header: "Account" },
  { field: "balance", header: "Balance", format: "currency" },
  { field: "postedOn", header: "Posted", format: "date" },
]

const emptyState: BcPivotState = {
  colGroups: [],
  rowGroups: [],
  subtotals: { cols: true, rows: true },
  values: [],
}

describe("buildPivotToolPanelItems", () => {
  test("marks assigned columns and suggests values for numeric columns", () => {
    const items = buildPivotToolPanelItems(columns, {
      ...emptyState,
      rowGroups: ["region"],
      values: [{ columnId: "balance", aggregation: { type: "sum" } }],
    })

    expect(items.find((item) => item.columnId === "region")).toMatchObject({
      assigned: true,
      label: "Region",
      suggestedZone: "rowGroups",
    })
    expect(items.find((item) => item.columnId === "balance")).toMatchObject({
      assigned: true,
      suggestedZone: "values",
    })
    expect(items.find((item) => item.columnId === "account")?.assigned).toBe(false)
  })
})

describe("pivot panel state helpers", () => {
  test("adds columns to zones and removes them from other zones", () => {
    const balance = buildPivotToolPanelItems(columns, emptyState).find(
      (item) => item.columnId === "balance",
    )
    if (!balance) throw new Error("expected balance")

    const withValue = addPivotColumnToZone(emptyState, "values", balance, columns[2])
    expect(withValue.values).toEqual([
      { columnId: "balance", aggregation: { type: "sum" }, label: "Sum of Balance" },
    ])

    const asRowGroup = addPivotColumnToZone(withValue, "rowGroups", balance, columns[2])
    expect(asRowGroup.rowGroups).toEqual(["balance"])
    expect(asRowGroup.values).toEqual([])
  })

  test("moves, removes, and changes value aggregations", () => {
    const state: BcPivotState = {
      ...emptyState,
      rowGroups: ["region", "account"],
      values: [{ columnId: "balance", aggregation: { type: "sum" }, label: "Sum of Balance" }],
    }

    expect(movePivotEntry(state, "rowGroups", 1, -1).rowGroups).toEqual(["account", "region"])
    expect(removePivotEntry(state, "rowGroups", 0).rowGroups).toEqual(["account"])
    expect(setPivotValueAggregation(state, 0, "avg", columns[2]).values).toEqual([
      { columnId: "balance", aggregation: { type: "avg" }, label: "Average of Balance" },
    ])
  })
})

describe("pivot sidebar slot", () => {
  test("resolves the built-in pivot panel to the pivot tool panel", () => {
    const [panel] = resolveSidebarPanels<Row>(["pivot"])
    const context: BcSidebarContext<Row> = {
      api: {} as BcSidebarContext<Row>["api"],
      clearColumnFilterText: () => {},
      columnFilterText: {},
      columns,
      columnState: [],
      filterState: null,
      groupableColumns: [],
      groupBy: [],
      pivot: { setState: () => {}, state: emptyState },
      setColumnFilterText: () => {},
      setColumnState: () => {},
      setFilterState: () => {},
      setGroupBy: () => {},
    }

    expect(panel?.id).toBe("pivot")
    expect((panel?.render(context) as { type?: unknown }).type).toBe(BcPivotToolPanel)
  })
})
