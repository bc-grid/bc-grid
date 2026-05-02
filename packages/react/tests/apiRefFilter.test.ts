import { describe, expect, test } from "bun:test"
import type { BcGridApi, BcGridFilter, BcServerGridApi } from "@bc-grid/core"

/**
 * Compile-time + runtime contract for the v0.5 imperative filter API
 * additions (audit P0-7). The methods live on the public grid API and
 * are inherited by the server grid API.
 */

describe("BcGridApi imperative filter methods (v0.5 audit P0-7)", () => {
  test("BcGridApi exposes openFilter, closeFilter, getActiveFilter as functions", () => {
    const api: BcGridApi = stubApi()

    expect(typeof api.openFilter).toBe("function")
    expect(typeof api.closeFilter).toBe("function")
    expect(typeof api.getActiveFilter).toBe("function")
  })

  test("BcServerGridApi inherits the same methods", () => {
    const api: BcServerGridApi = stubServerApi()

    expect(typeof api.openFilter).toBe("function")
    expect(typeof api.closeFilter).toBe("function")
    expect(typeof api.getActiveFilter).toBe("function")
  })

  test("openFilter signature accepts default, popup, and inline variants", () => {
    const api: BcGridApi = stubApi()
    api.openFilter("name")
    api.openFilter("name", { variant: "popup" })
    api.openFilter("name", { variant: "inline" })

    expect(true).toBe(true)
  })

  test("closeFilter accepts optional column id", () => {
    const api: BcGridApi = stubApi()
    api.closeFilter()
    api.closeFilter("name")

    expect(true).toBe(true)
  })

  test("getActiveFilter returns a column-scoped filter tree", () => {
    const api: BcGridApi = stubApi()
    const filter: BcGridFilter | null = api.getActiveFilter("name")

    expect(filter).toBeNull()
  })
})

function stubApi(): BcGridApi {
  const noop = () => undefined
  const noopAsync = () => Promise.resolve()
  return {
    scrollToRow: noop,
    scrollToCell: noop,
    focusCell: noop,
    isCellVisible: () => false,
    getRowById: () => undefined,
    getActiveCell: () => null,
    getSelection: () => ({ mode: "explicit", rowIds: new Set() }),
    getRangeSelection: () => ({ ranges: [], anchor: null }),
    getColumnState: () => [],
    getFilter: () => null,
    getActiveFilter: () => null,
    setColumnState: noop,
    setSort: noop,
    setFilter: noop,
    openFilter: noop,
    closeFilter: noop,
    clearFilter: noop,
    setColumnPinned: noop,
    setColumnHidden: noop,
    autoSizeColumn: noop,
    setRangeSelection: noop,
    copyRange: noopAsync,
    clearRangeSelection: noop,
    expandAll: noop,
    collapseAll: noop,
    startEdit: noop,
    commitEdit: noop,
    cancelEdit: noop,
    refresh: noop,
  }
}

function stubServerApi(): BcServerGridApi {
  const base = stubApi()
  const noop = () => undefined
  return {
    ...base,
    refreshServerRows: noop,
    invalidateServerRows: noop,
    retryServerBlock: noop,
    applyServerRowUpdate: noop,
    queueServerRowMutation: noop,
    settleServerRowMutation: noop,
    scrollToServerCell: () => Promise.resolve({ scrolled: false }),
    getServerRowModelState: () => ({
      mode: "paged",
      rows: [],
      pendingMutations: [],
    }),
    getServerDiagnostics: () => ({
      cache: { hits: 0, misses: 0, evictions: 0 },
      query: { active: 0, queued: 0, retrying: 0 },
      view: { rows: 0, blocks: 0 },
      load: { current: "idle" },
    }),
  }
}
