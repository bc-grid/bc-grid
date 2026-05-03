import { describe, expect, test } from "bun:test"
import type { BcColumnStateEntry, BcGridApi, BcGridFilter, BcGridSort } from "@bc-grid/core"
import {
  BC_SAVED_VIEW_VERSION,
  applySavedViewLayout,
  createSavedView,
  migrateSavedViewLayout,
} from "../src/savedView"
import type { BcGridLayoutState } from "../src/types"

interface Row {
  id: string
  status: string
}

describe("saved view helpers", () => {
  test("createSavedView pins the version, defaults scope, timestamps, and clones layout", () => {
    const layout: BcGridLayoutState = {
      version: 1,
      columnState: [{ columnId: "status", position: 0, width: 180 }],
      sort: [{ columnId: "status", direction: "asc" }],
    }

    const view = createSavedView<Row>({
      id: "view-open",
      gridId: "ar.customers",
      name: "Open customers",
      layout,
      createdAt: "2026-05-03T00:00:00.000Z",
      updatedAt: "2026-05-03T00:00:00.000Z",
    })

    expect(view).toEqual({
      id: "view-open",
      name: "Open customers",
      gridId: "ar.customers",
      version: BC_SAVED_VIEW_VERSION,
      layout,
      scope: "user",
      createdAt: "2026-05-03T00:00:00.000Z",
      updatedAt: "2026-05-03T00:00:00.000Z",
    })
    expect(view.layout).not.toBe(layout)
    expect(view.layout.columnState).not.toBe(layout.columnState)
  })

  test("migrateSavedViewLayout normalizes old versions without mutating the source", () => {
    const saved = {
      id: "legacy-view",
      name: "Legacy",
      gridId: "ar.customers",
      version: 0,
      scope: "team" as const,
      layout: {
        version: 0,
        sort: [{ columnId: "status", direction: "desc" as const }],
        sidebarPanel: null,
      },
    }

    const migrated = migrateSavedViewLayout<Row>(saved)

    expect(migrated.version).toBe(BC_SAVED_VIEW_VERSION)
    expect(migrated.layout.version).toBe(1)
    expect(migrated.layout.sort).toEqual([{ columnId: "status", direction: "desc" }])
    expect(migrated.layout.sidebarPanel).toBeNull()
    expect(saved.version).toBe(0)
    expect(saved.layout.version).toBe(0)
    expect(migrated.layout).not.toBe(saved.layout)
    expect(migrated.layout.sort).not.toBe(saved.layout.sort)
  })

  test("applySavedViewLayout writes API-backed fields and forwards controlled-only fields", () => {
    const columnStateCalls: BcColumnStateEntry[][] = []
    const sortCalls: BcGridSort[][] = []
    const filterCalls: Array<BcGridFilter | null> = []
    const groupByCalls: string[][] = []
    const searchTextCalls: string[] = []
    const paginationCalls: Array<{ page: number; pageSize: number }> = []
    const densityCalls: string[] = []
    const sidebarPanelCalls: Array<string | null> = []
    const api = {
      setColumnState: (state: BcColumnStateEntry[]) => columnStateCalls.push(state),
      setSort: (sort: BcGridSort[]) => sortCalls.push(sort),
      setFilter: (filter: BcGridFilter | null) => filterCalls.push(filter),
    } as Partial<BcGridApi<Row>> as BcGridApi<Row>
    const filter: BcGridFilter = {
      kind: "column",
      columnId: "status",
      type: "text",
      op: "equals",
      value: "open",
    }
    const layout: BcGridLayoutState = {
      version: 1,
      columnState: [{ columnId: "status", position: 0, width: 180 }],
      sort: [{ columnId: "status", direction: "asc" }],
      filter,
      groupBy: ["status"],
      searchText: "open",
      pagination: { page: 2, pageSize: 50 },
      density: "compact",
      sidebarPanel: null,
    }

    applySavedViewLayout<Row>(
      api,
      {
        id: "view-open",
        name: "Open customers",
        gridId: "ar.customers",
        version: 1,
        layout,
        scope: "user",
      },
      {
        setGroupBy: (next) => groupByCalls.push([...next]),
        setSearchText: (next) => searchTextCalls.push(next),
        setPagination: (next) => paginationCalls.push(next),
        setDensity: (next) => densityCalls.push(next),
        setSidebarPanel: (next) => sidebarPanelCalls.push(next),
      },
    )

    expect(columnStateCalls).toEqual([[{ columnId: "status", position: 0, width: 180 }]])
    expect(sortCalls).toEqual([[{ columnId: "status", direction: "asc" }]])
    expect(filterCalls).toEqual([filter])
    expect(groupByCalls).toEqual([["status"]])
    expect(searchTextCalls).toEqual(["open"])
    expect(paginationCalls).toEqual([{ page: 2, pageSize: 50 }])
    expect(densityCalls).toEqual(["compact"])
    expect(sidebarPanelCalls).toEqual([null])
    expect(columnStateCalls[0]).not.toBe(layout.columnState)
    expect(sortCalls[0]).not.toBe(layout.sort)
    expect(filterCalls[0]).not.toBe(filter)
    expect(paginationCalls[0]).not.toBe(layout.pagination)
  })

  test("applySavedViewLayout ignores absent optional layout fields", () => {
    const columnStateCalls: BcColumnStateEntry[][] = []
    const sortCalls: BcGridSort[][] = []
    const filterCalls: Array<BcGridFilter | null> = []
    const groupByCalls: string[][] = []
    const api = {
      setColumnState: (state: BcColumnStateEntry[]) => columnStateCalls.push(state),
      setSort: (sort: BcGridSort[]) => sortCalls.push(sort),
      setFilter: (filter: BcGridFilter | null) => filterCalls.push(filter),
    } as Partial<BcGridApi<Row>> as BcGridApi<Row>

    applySavedViewLayout<Row>(
      api,
      {
        id: "view-empty",
        name: "Empty",
        gridId: "ar.customers",
        version: 1,
        layout: { version: 1 },
        scope: "user",
      },
      {
        setGroupBy: (next) => groupByCalls.push([...next]),
      },
    )

    expect(columnStateCalls).toEqual([])
    expect(sortCalls).toEqual([])
    expect(filterCalls).toEqual([])
    expect(groupByCalls).toEqual([])
  })
})
