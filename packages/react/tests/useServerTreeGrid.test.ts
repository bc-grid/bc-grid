import { describe, expect, test } from "bun:test"
import type {
  BcGridFilter,
  RowId,
  ServerGroupKey,
  ServerRowPatch,
  ServerTreeResult,
} from "@bc-grid/core"
import {
  addRowToExpansion,
  applyGroupRowIdOverride,
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

interface BomLine {
  id: string
  region: string
  status: string
  qty: number
}

const regionGroupKey: ServerGroupKey = { columnId: "region", value: "NSW" }
const statusGroupKey: ServerGroupKey = { columnId: "status", value: "Open" }

function makeTreeResult(
  rows: ServerTreeResult<BomLine>["rows"],
  groupPath: ServerGroupKey[] = [],
): ServerTreeResult<BomLine> {
  return {
    rows,
    parentRowId: null,
    groupPath,
    childStart: 0,
    childCount: rows.length,
  }
}

describe("applyGroupRowIdOverride", () => {
  test("returns the original result reference when no override is supplied (no churn for the common case)", () => {
    const result = makeTreeResult([
      { kind: "group", groupKey: regionGroupKey, hasChildren: true, data: {} as BomLine },
    ])
    expect(applyGroupRowIdOverride(result, undefined)).toBe(result)
  })

  test("stamps the override onto each group row's groupKey.rowId", () => {
    const result = makeTreeResult([
      { kind: "group", groupKey: regionGroupKey, hasChildren: true, data: {} as BomLine },
      { kind: "group", groupKey: statusGroupKey, hasChildren: true, data: {} as BomLine },
    ])
    const next = applyGroupRowIdOverride(result, (key, path) => {
      const tail = path[path.length - 1]
      return `bom:${key.columnId}=${String(key.value)}:${path.length}:${String(tail?.value)}`
    })
    expect(next).not.toBe(result)
    expect(next.rows[0]?.groupKey?.rowId).toBe("bom:region=NSW:1:NSW")
    expect(next.rows[1]?.groupKey?.rowId).toBe("bom:status=Open:1:Open")
  })

  test("path includes the full ancestor chain ending in the current key", () => {
    const ancestor: ServerGroupKey = { columnId: "region", value: "NSW" }
    const result = makeTreeResult(
      [{ kind: "group", groupKey: statusGroupKey, hasChildren: true, data: {} as BomLine }],
      [ancestor],
    )
    let capturedPath: readonly ServerGroupKey[] | null = null
    applyGroupRowIdOverride(result, (_key, path) => {
      capturedPath = path
      return "noop"
    })
    expect(capturedPath).not.toBeNull()
    expect(capturedPath).toHaveLength(2)
    expect(capturedPath?.[0]).toBe(ancestor)
    expect(capturedPath?.[1]).toBe(statusGroupKey)
  })

  test("leaves leaf rows untouched", () => {
    const leaf: ServerTreeResult<BomLine>["rows"][number] = {
      kind: "leaf",
      data: { id: "line-1", region: "NSW", status: "Open", qty: 1 },
      rowId: "line-1",
    }
    const result = makeTreeResult([leaf])
    const next = applyGroupRowIdOverride(result, () => "should-not-be-called")
    // No group rows means no mutation; result reference is preserved.
    expect(next).toBe(result)
  })

  test("preserves a consumer-set groupKey.rowId (existing id wins)", () => {
    const explicitGroup: ServerTreeResult<BomLine>["rows"][number] = {
      kind: "group",
      groupKey: { columnId: "region", value: "NSW", rowId: "explicit-region-NSW" },
      hasChildren: true,
      data: {} as BomLine,
    }
    const result = makeTreeResult([explicitGroup])
    const next = applyGroupRowIdOverride(result, () => "override-value")
    expect(next).toBe(result)
    expect(next.rows[0]?.groupKey?.rowId).toBe("explicit-region-NSW")
  })

  test("preserves a consumer-set row.rowId on a group row", () => {
    const groupWithRowId: ServerTreeResult<BomLine>["rows"][number] = {
      kind: "group",
      groupKey: regionGroupKey,
      rowId: "explicit-row-id",
      hasChildren: true,
      data: {} as BomLine,
    }
    const result = makeTreeResult([groupWithRowId])
    const next = applyGroupRowIdOverride(result, () => "should-not-be-called")
    expect(next).toBe(result)
  })
})
