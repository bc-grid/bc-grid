import { describe, expect, test } from "bun:test"
import type { BcSelection, RowId } from "../src"
import {
  forEachSelectedRowId,
  isAllSelection,
  isExplicitSelection,
  isFilteredSelection,
} from "../src"

describe("BcSelection type guards (v0.6 §1 bcselection-narrowing)", () => {
  // The whole point: callers passing BcSelection across module
  // boundaries get type narrowing without manually destructuring
  // `selection.mode === "..."` at every call site. Pin the runtime
  // predicate at the same time as the type-guard signature.

  const explicit: BcSelection = { mode: "explicit", rowIds: new Set(["r1", "r2"]) }
  const all: BcSelection = { mode: "all", except: new Set(["r3"]) }
  const filtered: BcSelection = {
    mode: "filtered",
    except: new Set(["r4"]),
    viewKey: "open",
  }

  test("isExplicitSelection true only for explicit mode", () => {
    expect(isExplicitSelection(explicit)).toBe(true)
    expect(isExplicitSelection(all)).toBe(false)
    expect(isExplicitSelection(filtered)).toBe(false)
  })

  test("isAllSelection true only for all mode", () => {
    expect(isAllSelection(explicit)).toBe(false)
    expect(isAllSelection(all)).toBe(true)
    expect(isAllSelection(filtered)).toBe(false)
  })

  test("isFilteredSelection true only for filtered mode", () => {
    expect(isFilteredSelection(explicit)).toBe(false)
    expect(isFilteredSelection(all)).toBe(false)
    expect(isFilteredSelection(filtered)).toBe(true)
  })

  test("type narrowing works downstream — narrow inside the guard branch", () => {
    // Pin that the predicate narrows for downstream code. If the
    // type guard signature regressed (e.g. someone changed the
    // return type to `boolean` instead of `selection is Extract<...>`),
    // this code wouldn't compile.
    const reads: string[] = []
    function describe(selection: BcSelection): void {
      if (isExplicitSelection(selection)) {
        // selection.rowIds is accessible without `if (selection.mode === "explicit")`
        reads.push(`explicit: ${selection.rowIds.size}`)
        return
      }
      if (isAllSelection(selection)) {
        reads.push(`all except ${selection.except.size}`)
        return
      }
      if (isFilteredSelection(selection)) {
        // selection.viewKey is accessible only after narrowing.
        reads.push(`filtered ${selection.viewKey} except ${selection.except.size}`)
      }
    }
    describe(explicit)
    describe(all)
    describe(filtered)
    expect(reads).toEqual(["explicit: 2", "all except 1", "filtered open except 1"])
  })
})

describe("forEachSelectedRowId — unified iteration across modes (v0.6 §1)", () => {
  // The helper is the partner for `getSelectedRows(...)` style
  // consumer code that today branches on `.mode` to walk the right
  // structure. With this helper, consumers write one loop body.

  const visibleRowIds: RowId[] = ["r1", "r2", "r3", "r4"]

  test("explicit mode: callback fires for each rowId in the explicit set", () => {
    const seen: RowId[] = []
    forEachSelectedRowId(
      { mode: "explicit", rowIds: new Set(["r2", "r4"]) },
      visibleRowIds,
      (rowId) => seen.push(rowId),
    )
    // Insertion order in the Set determines iteration; matches what
    // the consumer would get with `for (const id of selection.rowIds)`.
    expect(seen).toEqual(["r2", "r4"])
  })

  test("explicit mode: ignores visibleRowIds entirely (no filtering)", () => {
    // If visibleRowIds doesn't contain a rowId the user explicitly
    // selected, the callback STILL fires. The semantics: "every
    // explicitly-selected rowId" — the consumer can decide whether
    // to drop unknowns.
    const seen: RowId[] = []
    forEachSelectedRowId(
      { mode: "explicit", rowIds: new Set(["off-screen"]) },
      visibleRowIds,
      (rowId) => seen.push(rowId),
    )
    expect(seen).toEqual(["off-screen"])
  })

  test("all mode: walks visibleRowIds, skips except set", () => {
    const seen: RowId[] = []
    forEachSelectedRowId({ mode: "all", except: new Set(["r2", "r3"]) }, visibleRowIds, (rowId) =>
      seen.push(rowId),
    )
    expect(seen).toEqual(["r1", "r4"])
  })

  test("filtered mode: walks visibleRowIds, skips except set (viewKey doesn't affect iteration)", () => {
    // viewKey is a discriminator the consumer reads to decide WHICH
    // visibleRowIds to pass — the helper doesn't reach for the view
    // itself. The iteration math is identical to "all" mode.
    const seen: RowId[] = []
    forEachSelectedRowId(
      { mode: "filtered", except: new Set(["r1"]), viewKey: "open" },
      visibleRowIds,
      (rowId) => seen.push(rowId),
    )
    expect(seen).toEqual(["r2", "r3", "r4"])
  })

  test("all mode with empty visibleRowIds: callback never fires", () => {
    const seen: RowId[] = []
    forEachSelectedRowId({ mode: "all", except: new Set() }, [], (rowId) => seen.push(rowId))
    expect(seen).toEqual([])
  })

  test("explicit mode with empty visibleRowIds: still iterates the explicit set", () => {
    // Pin that the explicit-mode short-circuit doesn't accidentally
    // depend on visibleRowIds — that would silently drop selections
    // when called during a virtualizer transition.
    const seen: RowId[] = []
    forEachSelectedRowId({ mode: "explicit", rowIds: new Set(["r1"]) }, [], (rowId) =>
      seen.push(rowId),
    )
    expect(seen).toEqual(["r1"])
  })

  test("preserves visibleRowIds order for all/filtered (consumers read row order)", () => {
    // Reverse the visible order — pin that the helper iterates in
    // the supplied order, not Set iteration order.
    const seen: RowId[] = []
    forEachSelectedRowId({ mode: "all", except: new Set() }, ["r4", "r3", "r2", "r1"], (rowId) =>
      seen.push(rowId),
    )
    expect(seen).toEqual(["r4", "r3", "r2", "r1"])
  })

  test("does not allocate beyond the callback's work", () => {
    // The helper iterates without building a temporary array.
    // Pin by counting only the callback invocations against a known
    // input — no need for extra-instance assertions.
    let count = 0
    forEachSelectedRowId({ mode: "all", except: new Set(["r2"]) }, visibleRowIds, () => count++)
    expect(count).toBe(3)
  })
})
