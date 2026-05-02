import { describe, expect, test } from "bun:test"
import type { BcGridFilter, ServerRowPatch } from "@bc-grid/core"
import {
  buildOptimisticEditPatch,
  resolveInitialServerPagedState,
  resolveServerPagedPageAfterViewChange,
} from "../src/useServerPagedGrid"

const acmeFilter: BcGridFilter = {
  columnId: "name",
  kind: "column",
  op: "contains",
  type: "text",
  value: "Acme",
}

describe("resolveInitialServerPagedState", () => {
  test("returns built-in defaults when initial is undefined", () => {
    expect(resolveInitialServerPagedState(undefined)).toEqual({
      sort: [],
      filter: null,
      searchText: "",
      page: 0,
      pageSize: 100,
    })
  })

  test("returns built-in defaults when initial is empty", () => {
    expect(resolveInitialServerPagedState({})).toEqual({
      sort: [],
      filter: null,
      searchText: "",
      page: 0,
      pageSize: 100,
    })
  })

  test("blends caller-supplied initial values over built-in defaults", () => {
    expect(
      resolveInitialServerPagedState({
        sort: [{ columnId: "name", direction: "asc" }],
        filter: acmeFilter,
        search: "acme",
        page: 3,
        pageSize: 25,
      }),
    ).toEqual({
      sort: [{ columnId: "name", direction: "asc" }],
      filter: acmeFilter,
      searchText: "acme",
      page: 3,
      pageSize: 25,
    })
  })

  test("clamps a negative initial page to 0 (defensive)", () => {
    expect(resolveInitialServerPagedState({ page: -5 }).page).toBe(0)
  })

  test("clamps a sub-1 page size to 1 (defensive)", () => {
    expect(resolveInitialServerPagedState({ pageSize: 0 }).pageSize).toBe(1)
    expect(resolveInitialServerPagedState({ pageSize: -10 }).pageSize).toBe(1)
  })

  test("rounds non-integer page / pageSize", () => {
    expect(resolveInitialServerPagedState({ page: 2.7 }).page).toBe(2)
    expect(resolveInitialServerPagedState({ pageSize: 25.9 }).pageSize).toBe(25)
  })

  test("falls back to defaults when page / pageSize are not finite", () => {
    expect(resolveInitialServerPagedState({ page: Number.NaN }).page).toBe(0)
    expect(resolveInitialServerPagedState({ pageSize: Number.NaN }).pageSize).toBe(100)
  })
})

describe("resolveServerPagedPageAfterViewChange", () => {
  test("preserves the requested page when the viewKey is unchanged", () => {
    expect(
      resolveServerPagedPageAfterViewChange({
        previousViewKey: "view-1",
        nextViewKey: "view-1",
        page: 4,
      }),
    ).toBe(4)
  })

  test("resets to 0 when the viewKey changes", () => {
    expect(
      resolveServerPagedPageAfterViewChange({
        previousViewKey: "view-1",
        nextViewKey: "view-2",
        page: 4,
      }),
    ).toBe(0)
  })

  test("returns 0 when already on page 0 and the view changes", () => {
    expect(
      resolveServerPagedPageAfterViewChange({
        previousViewKey: "view-1",
        nextViewKey: "view-2",
        page: 0,
      }),
    ).toBe(0)
  })
})

describe("buildOptimisticEditPatch", () => {
  test("builds a ServerRowPatch with a deterministic mutation ID prefix", () => {
    const patch: ServerRowPatch = buildOptimisticEditPatch({
      rowId: "customer-1",
      changes: { name: "Acme Co." },
      sequence: 7,
    })

    expect(patch).toEqual({
      mutationId: "useServerPagedGrid:7",
      rowId: "customer-1",
      changes: { name: "Acme Co." },
    })
  })

  test("preserves multi-column changes intact", () => {
    const patch = buildOptimisticEditPatch({
      rowId: "customer-2",
      changes: { name: "Beta", status: "active", balance: 1234.56 },
      sequence: 0,
    })

    expect(patch.mutationId).toBe("useServerPagedGrid:0")
    expect(patch.changes).toEqual({ name: "Beta", status: "active", balance: 1234.56 })
  })
})
