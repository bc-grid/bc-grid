import { describe, expect, test } from "bun:test"
import type { BcGridApi, BcGridPasteTsvResult, BcServerGridApi } from "@bc-grid/core"

describe("BcGridApi pasteTsv imperative method (v0.5 audit P0-1)", () => {
  test("BcGridApi exposes pasteTsv as a function", () => {
    const api: BcGridApi = stubApi()

    expect(typeof api.pasteTsv).toBe("function")
  })

  test("BcServerGridApi inherits pasteTsv", () => {
    const api: BcServerGridApi = stubServerApi()

    expect(typeof api.pasteTsv).toBe("function")
  })

  test("pasteTsv signature accepts a TSV payload with optional range and overflow", async () => {
    const api: BcGridApi = stubApi()
    await api.pasteTsv({ tsv: "Ada\t12" })
    await api.pasteTsv({
      range: {
        start: { rowId: "r1", columnId: "name" },
        end: { rowId: "r1", columnId: "name" },
      },
      tsv: "Ada\t12",
      overflow: "clip",
    })

    const result: BcGridPasteTsvResult = await api.pasteTsv({ tsv: "" })
    expect(result.ok).toBe(false)
  })
})

function stubApi(): BcGridApi {
  const noop = () => undefined
  const noopAsync = () => Promise.resolve()
  const noopPaste = () =>
    Promise.resolve({
      ok: false as const,
      error: { code: "no-paste-target" as const, message: "No paste target." },
    })
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
    pasteTsv: noopPaste,
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
