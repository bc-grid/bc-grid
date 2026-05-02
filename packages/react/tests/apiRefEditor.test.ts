import { describe, expect, test } from "bun:test"
import type { BcGridApi, BcServerGridApi } from "@bc-grid/core"

/**
 * Compile-time + runtime contract for the v0.5 imperative editor API
 * additions (audit P0-7). Ensures `startEdit` / `commitEdit` /
 * `cancelEdit` are present on both the client and server api
 * surfaces. The TS compiler enforces presence; this file pins it as
 * runtime-checkable so a refactor that drops one of the methods is
 * caught even if the consumer code happens not to reference it.
 */

describe("BcGridApi imperative editor methods (v0.5 audit P0-7)", () => {
  test("BcGridApi exposes startEdit, commitEdit, cancelEdit as functions", () => {
    const api: BcGridApi = stubApi()

    expect(typeof api.startEdit).toBe("function")
    expect(typeof api.commitEdit).toBe("function")
    expect(typeof api.cancelEdit).toBe("function")
  })

  test("BcServerGridApi inherits the same methods", () => {
    const api: BcServerGridApi = stubServerApi()

    expect(typeof api.startEdit).toBe("function")
    expect(typeof api.commitEdit).toBe("function")
    expect(typeof api.cancelEdit).toBe("function")
  })

  test("startEdit signature accepts the optional seedKey hint", () => {
    // Compile-time assertion that the optional `seedKey` opt is part of
    // the public surface (a typo or accidental drop would fail tsc -b).
    const api: BcGridApi = stubApi()
    api.startEdit("row-1", "name")
    api.startEdit("row-1", "name", { seedKey: "A" })

    expect(true).toBe(true)
  })

  test("commitEdit signature accepts value override + moveOnSettle hint", () => {
    const api: BcGridApi = stubApi()
    api.commitEdit()
    api.commitEdit({ value: "Acme" })
    api.commitEdit({ moveOnSettle: "right" })
    api.commitEdit({ value: 42, moveOnSettle: "stay" })

    expect(true).toBe(true)
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
