import { describe, expect, test } from "bun:test"
import type { BcGridFilter, ServerRowPatch } from "@bc-grid/core"
import {
  buildOptimisticEditPatch,
  resolveInitialServerGridState,
  resolveServerGridActiveMode,
  resolveServerGridMissingLoaderMessage,
} from "../src/useServerGrid"

const acmeFilter: BcGridFilter = {
  columnId: "name",
  kind: "column",
  op: "contains",
  type: "text",
  value: "Acme",
}

describe("resolveServerGridActiveMode", () => {
  test('returns "paged" when rowModel is undefined and groupBy is empty', () => {
    expect(resolveServerGridActiveMode({ rowModel: undefined, groupBy: [] })).toBe("paged")
  })

  test('returns "paged" when rowModel is undefined and groupBy is undefined', () => {
    expect(resolveServerGridActiveMode({ rowModel: undefined, groupBy: undefined })).toBe("paged")
  })

  test('returns "tree" when rowModel is undefined and groupBy is non-empty', () => {
    expect(resolveServerGridActiveMode({ rowModel: undefined, groupBy: ["customerType"] })).toBe(
      "tree",
    )
  })

  test("explicit rowModel wins over the heuristic", () => {
    expect(resolveServerGridActiveMode({ rowModel: "infinite", groupBy: [] })).toBe("infinite")
    expect(resolveServerGridActiveMode({ rowModel: "infinite", groupBy: ["customerType"] })).toBe(
      "infinite",
    )
    expect(resolveServerGridActiveMode({ rowModel: "paged", groupBy: ["customerType"] })).toBe(
      "paged",
    )
    expect(resolveServerGridActiveMode({ rowModel: "tree", groupBy: [] })).toBe("tree")
  })
})

describe("resolveInitialServerGridState", () => {
  test("returns built-in defaults when initial is undefined", () => {
    const result = resolveInitialServerGridState(undefined)
    expect(result.sort).toEqual([])
    expect(result.filter).toBeNull()
    expect(result.searchText).toBe("")
    expect(result.groupBy).toEqual([])
    expect(result.expansion.size).toBe(0)
    expect(result.page).toBe(0)
    expect(result.pageSize).toBe(100)
  })

  test("returns built-in defaults when initial is empty", () => {
    const result = resolveInitialServerGridState({})
    expect(result.sort).toEqual([])
    expect(result.filter).toBeNull()
    expect(result.searchText).toBe("")
    expect(result.groupBy).toEqual([])
    expect(result.expansion.size).toBe(0)
    expect(result.page).toBe(0)
    expect(result.pageSize).toBe(100)
  })

  test("blends caller-supplied initial values over built-in defaults", () => {
    const initialExpansion = new Set(["row-1", "row-2"])
    const result = resolveInitialServerGridState({
      sort: [{ columnId: "name", direction: "asc" }],
      filter: acmeFilter,
      search: "acme",
      groupBy: ["customerType"],
      expansion: initialExpansion,
      page: 3,
      pageSize: 25,
    })
    expect(result.sort).toEqual([{ columnId: "name", direction: "asc" }])
    expect(result.filter).toEqual(acmeFilter)
    expect(result.searchText).toBe("acme")
    expect(result.groupBy).toEqual(["customerType"])
    expect(result.expansion).toBe(initialExpansion)
    expect(result.page).toBe(3)
    expect(result.pageSize).toBe(25)
  })

  test("clamps invalid page to 0", () => {
    expect(resolveInitialServerGridState({ page: -5 }).page).toBe(0)
    expect(resolveInitialServerGridState({ page: Number.NaN }).page).toBe(0)
    expect(resolveInitialServerGridState({ page: 1.7 }).page).toBe(1)
  })

  test("clamps invalid pageSize to default", () => {
    expect(resolveInitialServerGridState({ pageSize: 0 }).pageSize).toBe(1)
    expect(resolveInitialServerGridState({ pageSize: -10 }).pageSize).toBe(1)
    expect(resolveInitialServerGridState({ pageSize: Number.NaN }).pageSize).toBe(100)
    expect(resolveInitialServerGridState({ pageSize: 50.6 }).pageSize).toBe(50)
  })
})

describe("resolveServerGridMissingLoaderMessage", () => {
  test("returns null when paged mode has loadPage", () => {
    expect(
      resolveServerGridMissingLoaderMessage({
        activeMode: "paged",
        loadPage: () => undefined,
        loadBlock: undefined,
        loadChildren: undefined,
      }),
    ).toBeNull()
  })

  test("returns null when infinite mode has loadBlock", () => {
    expect(
      resolveServerGridMissingLoaderMessage({
        activeMode: "infinite",
        loadPage: undefined,
        loadBlock: () => undefined,
        loadChildren: undefined,
      }),
    ).toBeNull()
  })

  test("returns null when tree mode has loadChildren", () => {
    expect(
      resolveServerGridMissingLoaderMessage({
        activeMode: "tree",
        loadPage: undefined,
        loadBlock: undefined,
        loadChildren: () => undefined,
      }),
    ).toBeNull()
  })

  test("returns a console-friendly message when paged mode is missing loadPage", () => {
    const msg = resolveServerGridMissingLoaderMessage({
      activeMode: "paged",
      loadPage: undefined,
      loadBlock: undefined,
      loadChildren: undefined,
    })
    expect(msg).toContain("paged")
    expect(msg).toContain("loadPage")
  })

  test("returns a console-friendly message when infinite mode is missing loadBlock", () => {
    const msg = resolveServerGridMissingLoaderMessage({
      activeMode: "infinite",
      loadPage: () => undefined,
      loadBlock: undefined,
      loadChildren: undefined,
    })
    expect(msg).toContain("infinite")
    expect(msg).toContain("loadBlock")
  })

  test("returns a console-friendly message when tree mode is missing loadChildren", () => {
    const msg = resolveServerGridMissingLoaderMessage({
      activeMode: "tree",
      loadPage: undefined,
      loadBlock: undefined,
      loadChildren: undefined,
    })
    expect(msg).toContain("tree")
    expect(msg).toContain("loadChildren")
  })

  test("only flags the active mode's loader (cross-mode loaders do not satisfy)", () => {
    expect(
      resolveServerGridMissingLoaderMessage({
        activeMode: "tree",
        loadPage: () => undefined,
        loadBlock: () => undefined,
        loadChildren: undefined,
      }),
    ).toContain("loadChildren")
  })
})

describe("buildOptimisticEditPatch", () => {
  test("stamps the useServerGrid mutation-id prefix", () => {
    const patch: ServerRowPatch = buildOptimisticEditPatch({
      rowId: "row-7",
      changes: { name: "Updated" },
      sequence: 3,
    })
    expect(patch.mutationId.startsWith("useServerGrid:")).toBe(true)
    expect(patch.rowId).toBe("row-7")
    expect(patch.changes).toEqual({ name: "Updated" })
  })

  test("monotonic sequence yields distinct mutation IDs", () => {
    const a = buildOptimisticEditPatch({ rowId: "r", changes: {}, sequence: 1 })
    const b = buildOptimisticEditPatch({ rowId: "r", changes: {}, sequence: 2 })
    expect(a.mutationId).not.toBe(b.mutationId)
  })
})
