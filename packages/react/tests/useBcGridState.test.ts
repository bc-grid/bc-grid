import { describe, expect, test } from "bun:test"
import { emptyBcPivotState, emptyBcRangeSelection } from "@bc-grid/core"
import type { PersistedGridState } from "../src/persistence"
import { parseLocalPersistTarget, resolveInitialState } from "../src/useBcGridState"

describe("parseLocalPersistTarget", () => {
  test("extracts the gridId from a 'local:<id>' string", () => {
    expect(parseLocalPersistTarget("local:customers")).toBe("customers")
    expect(parseLocalPersistTarget("local:order-lines")).toBe("order-lines")
  })

  test("returns undefined for an empty / missing target", () => {
    expect(parseLocalPersistTarget(undefined)).toBeUndefined()
    expect(parseLocalPersistTarget("local:")).toBeUndefined()
    expect(parseLocalPersistTarget("local:   ")).toBeUndefined()
  })

  test("returns undefined for non-'local:' prefixes (URL persistence is a follow-up)", () => {
    expect(parseLocalPersistTarget("session:customers")).toBeUndefined()
    expect(parseLocalPersistTarget("url:gridState")).toBeUndefined()
    expect(parseLocalPersistTarget("customers")).toBeUndefined()
  })
})

describe("resolveInitialState — precedence (built-in empty < defaults < persisted)", () => {
  test("returns built-in empty values when nothing is supplied", () => {
    const state = resolveInitialState({
      gridId: undefined,
      defaults: undefined,
      server: false,
      persisted: {},
    })

    expect(state.sort).toEqual([])
    expect(state.searchText).toBe("")
    expect(state.filter).toBeNull()
    expect(state.selection).toEqual({ mode: "explicit", rowIds: new Set() })
    expect(state.rangeSelection).toBe(emptyBcRangeSelection)
    expect(state.expansion).toEqual(new Set())
    expect(state.groupBy).toEqual([])
    expect(state.pivotState).toBe(emptyBcPivotState)
    expect(state.columnState).toEqual([])
    expect(state.activeCell).toBeNull()
    expect(state.page).toBe(1)
    expect(state.pageSize).toBe(25)
    expect(state.sidebarPanel).toBeNull()
  })

  test("defaults override built-in empty values", () => {
    const state = resolveInitialState({
      gridId: undefined,
      defaults: {
        sort: [{ columnId: "name", direction: "asc" }],
        pageSize: 100,
        searchText: "open",
      },
      server: false,
      persisted: {},
    })

    expect(state.sort).toEqual([{ columnId: "name", direction: "asc" }])
    expect(state.pageSize).toBe(100)
    expect(state.searchText).toBe("open")
  })

  test("persisted values override defaults for the dimensions that persist", () => {
    const persisted: PersistedGridState = {
      sort: [{ columnId: "createdAt", direction: "desc" }],
      pageSize: 50,
      filter: { kind: "column", columnId: "status", type: "text", op: "equals", value: "open" },
      groupBy: ["region"],
      pivotState: { ...emptyBcPivotState, rowGroups: ["region"] },
      columnState: [{ columnId: "name", width: 200 }],
      sidebarPanel: "filters",
    }
    const state = resolveInitialState({
      gridId: "customers",
      defaults: {
        sort: [{ columnId: "name", direction: "asc" }],
        pageSize: 25,
      },
      server: false,
      persisted,
    })

    expect(state.sort).toEqual([{ columnId: "createdAt", direction: "desc" }])
    expect(state.pageSize).toBe(50)
    expect(state.filter).toEqual({
      kind: "column",
      columnId: "status",
      type: "text",
      op: "equals",
      value: "open",
    })
    expect(state.groupBy).toEqual(["region"])
    expect(state.pivotState.rowGroups).toEqual(["region"])
    expect(state.columnState).toEqual([{ columnId: "name", width: 200 }])
    expect(state.sidebarPanel).toBe("filters")
  })

  test("non-persisted dimensions still pick up defaults even when other values are persisted", () => {
    // selection / rangeSelection / expansion / activeCell / searchText are
    // intentionally not part of `PersistedGridState` (they're per-session
    // ephemera). Defaults for those still apply when persisted state
    // covers other dimensions.
    const state = resolveInitialState({
      gridId: "customers",
      defaults: {
        searchText: "open",
        expansion: new Set(["row-1"]),
        activeCell: { rowId: "row-1", columnId: "name" },
      },
      server: false,
      persisted: {
        sort: [{ columnId: "createdAt", direction: "desc" }],
      },
    })

    expect(state.searchText).toBe("open")
    expect(state.expansion).toEqual(new Set(["row-1"]))
    expect(state.activeCell).toEqual({ rowId: "row-1", columnId: "name" })
    expect(state.sort).toEqual([{ columnId: "createdAt", direction: "desc" }])
  })

  test("explicit null sidebarPanel from persistence is honored over defaults", () => {
    // Sidebar default is `null`; persisted `null` means "the user closed
    // the sidebar last session" — must beat any default that would
    // re-open it.
    const state = resolveInitialState({
      gridId: "customers",
      defaults: { sidebarPanel: "filters" },
      server: false,
      persisted: { sidebarPanel: null },
    })

    expect(state.sidebarPanel).toBeNull()
  })

  test("server flag does not change the empty `page` default today (stable across modes)", () => {
    // Documented behavior: page defaults to 1 in both client and server
    // modes. The flag is a placeholder for `useServerPagedGrid`
    // integration; this test pins the current contract so a future
    // change is intentional.
    expect(
      resolveInitialState({ gridId: undefined, defaults: undefined, server: false, persisted: {} })
        .page,
    ).toBe(1)
    expect(
      resolveInitialState({ gridId: undefined, defaults: undefined, server: true, persisted: {} })
        .page,
    ).toBe(1)
  })
})
