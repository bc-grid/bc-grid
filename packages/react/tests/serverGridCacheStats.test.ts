import { describe, expect, test } from "bun:test"
import type { ServerRowModelDiagnostics } from "@bc-grid/core"
import type { ServerRowModelMetricsSnapshot } from "@bc-grid/server-row-model"
import { composeServerCacheStats } from "../src/serverGrid"

// Worker1 v06 server-row cache stats — pure shape-mapper tests.
// `composeServerCacheStats` translates a model-layer diagnostics
// snapshot + a metrics snapshot into the consumer-facing
// BcServerCacheStats shape. The async loadPage flow that populates
// the underlying counters is exercised by the existing
// serverRowModel + diagnostics test suites; these tests pin the
// mapping contract.

const diagnostics: ServerRowModelDiagnostics = {
  mode: "paged",
  view: { sort: [], filter: null, search: "", groupBy: [], visibleColumns: [], pivotState: null },
  viewKey: "v::sort=&filter=&search=&groupBy=&visibleColumns=",
  viewSummary: {
    sort: [],
    filter: { type: null },
    search: "",
    groupBy: [],
    visibleColumns: [],
    pivotState: null,
  },
  rowCount: 1234,
  cache: {
    blockCount: 5,
    blockKeys: [],
    loadedRowCount: 500,
    states: { fresh: 5, loading: 0, queued: 0, error: 0, stale: 0 },
  },
  pendingMutationCount: 2,
  lastLoad: { status: "success" },
}

const metrics: ServerRowModelMetricsSnapshot = {
  blockFetchErrors: 1,
  blockFetches: 12,
  blockFetchLatencyMs: { count: 12, totalMs: 480, maxMs: 80, minMs: 20 },
  blockQueueWaitMs: { count: 12, totalMs: 60, maxMs: 10, minMs: 0 },
  cacheHitRate: 0.75,
  cacheHits: 9,
  cacheMisses: 3,
  dedupedRequests: 4,
  evictedBlocks: 2,
  maxQueueDepth: 3,
  queuedRequests: 16,
}

describe("composeServerCacheStats", () => {
  test("paged mode — combines diagnostics snapshot + metrics counters", () => {
    const stats = composeServerCacheStats({ mode: "paged", diagnostics, metrics })
    expect(stats).toEqual({
      mode: "paged",
      viewKey: diagnostics.viewKey,
      blocksLoaded: 5,
      loadedRowCount: 500,
      blocksFetched: 12,
      cacheHits: 9,
      cacheMisses: 3,
      cacheHitRate: 0.75,
      dedupedRequests: 4,
      evictedBlocks: 2,
      blockFetchErrors: 1,
      pendingMutationCount: 2,
    })
  })

  test("infinite mode — mode field reflects the active row-model mode", () => {
    const stats = composeServerCacheStats({ mode: "infinite", diagnostics, metrics })
    expect(stats.mode).toBe("infinite")
    expect(stats.viewKey).toBe(diagnostics.viewKey)
  })

  test("tree mode — mode field reflects the active row-model mode", () => {
    const stats = composeServerCacheStats({ mode: "tree", diagnostics, metrics })
    expect(stats.mode).toBe("tree")
  })

  test("zero-fetch state — cacheHitRate=1, all counters zero except blocksLoaded", () => {
    const emptyMetrics: ServerRowModelMetricsSnapshot = {
      blockFetchErrors: 0,
      blockFetches: 0,
      blockFetchLatencyMs: { count: 0, totalMs: 0, maxMs: 0, minMs: 0 },
      blockQueueWaitMs: { count: 0, totalMs: 0, maxMs: 0, minMs: 0 },
      cacheHitRate: 1,
      cacheHits: 0,
      cacheMisses: 0,
      dedupedRequests: 0,
      evictedBlocks: 0,
      maxQueueDepth: 0,
      queuedRequests: 0,
    }
    const emptyDiagnostics: ServerRowModelDiagnostics = {
      ...diagnostics,
      cache: { blockCount: 0, blockKeys: [], loadedRowCount: 0, states: diagnostics.cache.states },
      pendingMutationCount: 0,
    }
    const stats = composeServerCacheStats({
      mode: "paged",
      diagnostics: emptyDiagnostics,
      metrics: emptyMetrics,
    })
    expect(stats.blocksFetched).toBe(0)
    expect(stats.cacheHits).toBe(0)
    expect(stats.cacheMisses).toBe(0)
    expect(stats.cacheHitRate).toBe(1)
    expect(stats.blocksLoaded).toBe(0)
    expect(stats.loadedRowCount).toBe(0)
    expect(stats.pendingMutationCount).toBe(0)
  })

  test("preserves viewKey from diagnostics (not metrics)", () => {
    const customViewKey = "v::sort=name:asc&filter=status:open&search=foo"
    const customDiagnostics = { ...diagnostics, viewKey: customViewKey }
    const stats = composeServerCacheStats({
      mode: "paged",
      diagnostics: customDiagnostics,
      metrics,
    })
    expect(stats.viewKey).toBe(customViewKey)
  })
})
