import { describe, expect, test } from "bun:test"
import type { BcGridFilter, RowId, ServerRowPatch } from "@bc-grid/core"
import {
  addRowToExpansion,
  buildOptimisticEditPatch,
  removeRowFromExpansion,
  resolveInitialServerTreeState,
} from "../src/useServerTreeGrid"

const acmeFilter: BcGridFilter = {
  columnId: "name",
  kind: "column",
  op: "contains",
  type: "text",
  value: "Acme",
}

describe("resolveInitialServerTreeState", () => {
  test("returns built-in defaults when initial is undefined", () => {
    const result = resolveInitialServerTreeState(undefined)
    expect(result.sort).toEqual([])
    expect(result.filter).toBeNull()
    expect(result.searchText).toBe("")
    expect(result.expansion).toBeInstanceOf(Set)
    expect(result.expansion.size).toBe(0)
  })

  test("returns built-in defaults when initial is empty", () => {
    const result = resolveInitialServerTreeState({})
    expect(result.expansion.size).toBe(0)
  })

  test("blends caller-supplied initial values over built-in defaults", () => {
    const expansion = new Set<RowId>(["root-1", "child-7"])
    const result = resolveInitialServerTreeState({
      sort: [{ columnId: "name", direction: "asc" }],
      filter: acmeFilter,
      search: "acme",
      expansion,
    })
    expect(result.sort).toEqual([{ columnId: "name", direction: "asc" }])
    expect(result.filter).toEqual(acmeFilter)
    expect(result.searchText).toBe("acme")
    expect(result.expansion).toBe(expansion)
  })
})

describe("addRowToExpansion", () => {
  test("adds a new rowId and returns a new set", () => {
    const prev: ReadonlySet<RowId> = new Set(["row-1"])
    const next = addRowToExpansion(prev, "row-2")
    expect(next).not.toBe(prev)
    expect(next.has("row-1")).toBe(true)
    expect(next.has("row-2")).toBe(true)
  })

  test("returns the same set reference when the rowId is already present (state short-circuit)", () => {
    const prev: ReadonlySet<RowId> = new Set(["row-1", "row-2"])
    const next = addRowToExpansion(prev, "row-1")
    expect(next).toBe(prev)
  })

  test("adding to an empty set yields a singleton", () => {
    const next = addRowToExpansion(new Set(), "root")
    expect(next.size).toBe(1)
    expect(next.has("root")).toBe(true)
  })
})

describe("removeRowFromExpansion", () => {
  test("removes the rowId and returns a new set", () => {
    const prev: ReadonlySet<RowId> = new Set(["row-1", "row-2"])
    const next = removeRowFromExpansion(prev, "row-1")
    expect(next).not.toBe(prev)
    expect(next.has("row-1")).toBe(false)
    expect(next.has("row-2")).toBe(true)
  })

  test("returns the same set reference when the rowId is not present (state short-circuit)", () => {
    const prev: ReadonlySet<RowId> = new Set(["row-1"])
    const next = removeRowFromExpansion(prev, "row-99")
    expect(next).toBe(prev)
  })

  test("removing the last entry yields an empty set", () => {
    const prev: ReadonlySet<RowId> = new Set(["only"])
    const next = removeRowFromExpansion(prev, "only")
    expect(next.size).toBe(0)
  })
})

describe("buildOptimisticEditPatch", () => {
  test("uses the useServerTreeGrid mutation-ID prefix (distinct from paged + infinite)", () => {
    const patch: ServerRowPatch = buildOptimisticEditPatch({
      rowId: "child-1",
      changes: { qty: 12 },
      sequence: 3,
    })
    expect(patch).toEqual({
      mutationId: "useServerTreeGrid:3",
      rowId: "child-1",
      changes: { qty: 12 },
    })
  })

  test("preserves multi-column changes intact", () => {
    const patch = buildOptimisticEditPatch({
      rowId: "child-2",
      changes: { qty: 1, unitCost: 3.5, status: "released" },
      sequence: 0,
    })
    expect(patch.mutationId).toBe("useServerTreeGrid:0")
    expect(patch.changes).toEqual({ qty: 1, unitCost: 3.5, status: "released" })
  })
})
