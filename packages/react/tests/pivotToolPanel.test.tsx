import { describe, expect, test } from "bun:test"
import { type BcPivotState, emptyBcPivotState } from "@bc-grid/core"
import { renderToStaticMarkup } from "react-dom/server"
import { defaultMessages } from "../src/gridInternals"
import {
  BcPivotToolPanel,
  addPivotColumn,
  buildPivotToolPanelFields,
  defaultPivotAggregationForColumn,
  filterPivotToolPanelFields,
  movePivotColumn,
  removePivotColumn,
  setPivotValueAggregation,
} from "../src/pivotToolPanel"
import { resolveSidebarPanels } from "../src/sidebar"
import type { BcReactGridColumn, BcSidebarContext } from "../src/types"

interface Row {
  balance: number
  owner: string
  region: string
  status: string
}

const columns: readonly BcReactGridColumn<Row>[] = [
  { field: "region", header: "Region" },
  { field: "status", header: "Status" },
  { field: "balance", format: "currency", header: "Balance" },
  { field: "owner", header: "Owner", aggregation: { type: "count" } },
]

function pivotState(partial: Partial<BcPivotState> = {}): BcPivotState {
  return {
    ...emptyBcPivotState,
    colGroups: [],
    rowGroups: [],
    values: [],
    ...partial,
  }
}

function sidebarContext(
  state: BcPivotState,
  setPivotState: (next: BcPivotState) => void = () => {},
): BcSidebarContext<Row> {
  return {
    api: {} as BcSidebarContext<Row>["api"],
    clearColumnFilterText: () => {},
    columnFilterText: {},
    columns,
    columnState: [],
    filterState: null,
    groupableColumns: [],
    groupBy: [],
    messages: defaultMessages,
    pivotState: state,
    setColumnFilterText: () => {},
    setColumnState: () => {},
    setFilterState: () => {},
    setGroupBy: () => {},
    setPivotState,
  }
}

describe("pivot tool panel helpers", () => {
  test("builds fields from columns and active pivot state", () => {
    const fields = buildPivotToolPanelFields(
      columns,
      pivotState({
        rowGroups: ["region"],
        values: [{ columnId: "balance", aggregation: { type: "sum" } }],
      }),
    )

    expect(fields.map((field) => field.columnId)).toEqual(["region", "status", "balance", "owner"])
    expect(fields.find((field) => field.columnId === "region")).toMatchObject({
      inRowGroups: true,
      label: "Region",
    })
    expect(fields.find((field) => field.columnId === "balance")).toMatchObject({
      defaultAggregation: { type: "sum" },
      inValues: true,
    })
    expect(fields.find((field) => field.columnId === "owner")).toMatchObject({
      defaultAggregation: null,
    })
    expect(filterPivotToolPanelFields(fields, "bal").map((field) => field.columnId)).toEqual([
      "balance",
    ])
  })

  test("inherits existing column aggregations when adding value fields", () => {
    const state = addPivotColumn(
      pivotState(),
      "values",
      "owner",
      defaultPivotAggregationForColumn(columns[3]),
    )

    expect(state.values).toEqual([{ columnId: "owner" }])
  })

  test("adds, removes, reorders, and updates pivot zones immutably", () => {
    let state = pivotState()
    state = addPivotColumn(state, "rowGroups", "region")
    expect(state.rowGroups).toEqual(["region"])

    state = addPivotColumn(state, "colGroups", "region")
    expect(state.rowGroups).toEqual([])
    expect(state.colGroups).toEqual(["region"])

    state = addPivotColumn(state, "values", "balance", { type: "sum" })
    state = addPivotColumn(state, "values", "owner", { type: "count" })
    expect(state.values.map((value) => value.columnId)).toEqual(["balance", "owner"])

    state = movePivotColumn(state, "values", "owner", -1)
    expect(state.values.map((value) => value.columnId)).toEqual(["owner", "balance"])

    state = setPivotValueAggregation(state, "balance", "avg")
    expect(state.values.find((value) => value.columnId === "balance")?.aggregation).toEqual({
      type: "avg",
    })

    state = setPivotValueAggregation(state, "balance", "inherit")
    expect(state.values.find((value) => value.columnId === "balance")?.aggregation).toBeUndefined()

    state = removePivotColumn(state, "values", "owner")
    expect(state.values.map((value) => value.columnId)).toEqual(["balance"])
  })
})

describe("pivot sidebar panel", () => {
  test("resolves the built-in pivot panel to the pivot tool panel", () => {
    const [panel] = resolveSidebarPanels<Row>(["pivot"])

    expect(panel?.id).toBe("pivot")
    expect((panel?.render(sidebarContext(pivotState())) as { type?: unknown }).type).toBe(
      BcPivotToolPanel,
    )
  })

  test("renders compact empty states", () => {
    const markup = renderToStaticMarkup(<BcPivotToolPanel context={sidebarContext(pivotState())} />)

    expect(markup).toContain("Search pivot fields")
    expect(markup).toContain("No row groups")
    expect(markup).toContain("No column groups")
    expect(markup).toContain("No values")
  })

  test("renders active row, column, and value chips", () => {
    const markup = renderToStaticMarkup(
      <BcPivotToolPanel
        context={sidebarContext(
          pivotState({
            colGroups: ["status"],
            rowGroups: ["region"],
            values: [{ columnId: "balance", aggregation: { type: "sum" } }],
          }),
        )}
      />,
    )

    expect(markup).toContain("Region")
    expect(markup).toContain("Status")
    expect(markup).toContain("Balance")
    expect(markup).toContain("Aggregate Balance")
  })
})
