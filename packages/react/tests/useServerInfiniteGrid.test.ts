import { describe, expect, test } from "bun:test"
import type { BcGridFilter, ServerRowPatch } from "@bc-grid/core"
import {
  buildOptimisticEditPatch,
  resolveInitialServerInfiniteState,
  resolveServerInfiniteTotalRows,
} from "../src/useServerInfiniteGrid"

const acmeFilter: BcGridFilter = {
  columnId: "name",
  kind: "column",
  op: "contains",
  type: "text",
  value: "Acme",
}

describe("resolveInitialServerInfiniteState", () => {
  test("returns built-in defaults when initial is undefined", () => {
    expect(resolveInitialServerInfiniteState(undefined)).toEqual({
      sort: [],
      filter: null,
      searchText: "",
    })
  })

  test("returns built-in defaults when initial is empty", () => {
    expect(resolveInitialServerInfiniteState({})).toEqual({
      sort: [],
      filter: null,
      searchText: "",
    })
  })

  test("blends caller-supplied initial values over built-in defaults", () => {
    expect(
      resolveInitialServerInfiniteState({
        sort: [{ columnId: "name", direction: "asc" }],
        filter: acmeFilter,
        search: "acme",
      }),
    ).toEqual({
      sort: [{ columnId: "name", direction: "asc" }],
      filter: acmeFilter,
      searchText: "acme",
    })
  })
})

describe("buildOptimisticEditPatch", () => {
  test("uses the useServerInfiniteGrid mutation-ID prefix (distinct from useServerPagedGrid)", () => {
    const patch: ServerRowPatch = buildOptimisticEditPatch({
      rowId: "invoice-1",
      changes: { status: "paid" },
      sequence: 4,
    })
    expect(patch).toEqual({
      mutationId: "useServerInfiniteGrid:4",
      rowId: "invoice-1",
      changes: { status: "paid" },
    })
  })

  test("preserves multi-column changes intact", () => {
    const patch = buildOptimisticEditPatch({
      rowId: "invoice-2",
      changes: { status: "paid", amount: 1200, paidAt: "2026-05-02" },
      sequence: 0,
    })
    expect(patch.mutationId).toBe("useServerInfiniteGrid:0")
    expect(patch.changes).toEqual({ status: "paid", amount: 1200, paidAt: "2026-05-02" })
  })
})

describe("resolveServerInfiniteTotalRows", () => {
  test("explicit server totalRows wins over previous", () => {
    expect(
      resolveServerInfiniteTotalRows({
        previous: "unknown",
        result: { totalRows: 4321, blockStart: 0, rows: { length: 100 } },
      }),
    ).toBe(4321)
    expect(
      resolveServerInfiniteTotalRows({
        previous: 9999,
        result: { totalRows: 100, blockStart: 0, rows: { length: 50 } },
      }),
    ).toBe(100)
  })

  test("hasMore=false means loaded blocks are everything; computes from blockStart + rows.length", () => {
    expect(
      resolveServerInfiniteTotalRows({
        previous: "unknown",
        result: { hasMore: false, blockStart: 200, rows: { length: 37 } },
      }),
    ).toBe(237)
  })

  test("carries the previous total forward when neither totalRows nor hasMore=false is supplied", () => {
    expect(
      resolveServerInfiniteTotalRows({
        previous: 1234,
        result: { blockStart: 100, rows: { length: 100 } },
      }),
    ).toBe(1234)
    expect(
      resolveServerInfiniteTotalRows({
        previous: "unknown",
        result: { blockStart: 100, rows: { length: 100 } },
      }),
    ).toBe("unknown")
  })

  test("explicit totalRows overrides hasMore even when both are present", () => {
    expect(
      resolveServerInfiniteTotalRows({
        previous: "unknown",
        result: { totalRows: 5000, hasMore: false, blockStart: 4900, rows: { length: 100 } },
      }),
    ).toBe(5000)
  })
})
