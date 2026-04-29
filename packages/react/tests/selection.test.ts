import { describe, expect, test } from "bun:test"
import type { BcSelection, RowId } from "@bc-grid/core"
import {
  clearSelection,
  headerCheckboxState,
  isRowSelected,
  selectAllRows,
  selectOnly,
  selectRange,
  selectionSize,
  toggleRow,
} from "../src/selection"

const empty: BcSelection = { mode: "explicit", rowIds: new Set() }

describe("isRowSelected", () => {
  test("explicit: in the set ↔ selected", () => {
    const sel: BcSelection = { mode: "explicit", rowIds: new Set(["a" as RowId, "b" as RowId]) }
    expect(isRowSelected(sel, "a" as RowId)).toBe(true)
    expect(isRowSelected(sel, "b" as RowId)).toBe(true)
    expect(isRowSelected(sel, "c" as RowId)).toBe(false)
  })

  test("all: in the except set ↔ NOT selected", () => {
    const sel: BcSelection = { mode: "all", except: new Set(["a" as RowId]) }
    expect(isRowSelected(sel, "a" as RowId)).toBe(false)
    expect(isRowSelected(sel, "b" as RowId)).toBe(true)
  })

  test("filtered: same as all, scoped to viewKey", () => {
    const sel: BcSelection = { mode: "filtered", except: new Set(["a" as RowId]) }
    expect(isRowSelected(sel, "a" as RowId)).toBe(false)
    expect(isRowSelected(sel, "b" as RowId)).toBe(true)
  })
})

describe("selectOnly", () => {
  test("returns an explicit single-row selection", () => {
    const sel = selectOnly("row-5" as RowId)
    expect(sel.mode).toBe("explicit")
    if (sel.mode === "explicit") {
      expect([...sel.rowIds]).toEqual(["row-5"])
    }
  })
})

describe("toggleRow", () => {
  test("explicit: adds an unselected row", () => {
    const next = toggleRow(empty, "a" as RowId)
    expect(next.mode).toBe("explicit")
    if (next.mode === "explicit") expect(next.rowIds.has("a" as RowId)).toBe(true)
  })

  test("explicit: removes a selected row", () => {
    const sel: BcSelection = {
      mode: "explicit",
      rowIds: new Set(["a" as RowId, "b" as RowId]),
    }
    const next = toggleRow(sel, "a" as RowId)
    if (next.mode === "explicit") {
      expect(next.rowIds.has("a" as RowId)).toBe(false)
      expect(next.rowIds.has("b" as RowId)).toBe(true)
    }
  })

  test("explicit: does not mutate the input", () => {
    const sel: BcSelection = { mode: "explicit", rowIds: new Set(["a" as RowId]) }
    const next = toggleRow(sel, "b" as RowId)
    expect(sel).not.toBe(next)
    if (sel.mode === "explicit") expect(sel.rowIds.has("b" as RowId)).toBe(false)
  })

  test("all: toggling an in-set row removes it from except (re-selects it)", () => {
    const sel: BcSelection = { mode: "all", except: new Set(["a" as RowId]) }
    const next = toggleRow(sel, "a" as RowId)
    expect(next.mode).toBe("all")
    if (next.mode === "all") expect(next.except.has("a" as RowId)).toBe(false)
    expect(isRowSelected(next, "a" as RowId)).toBe(true)
  })

  test("all: toggling an out-of-set row adds it to except (de-selects it)", () => {
    const sel: BcSelection = { mode: "all", except: new Set() }
    const next = toggleRow(sel, "a" as RowId)
    if (next.mode === "all") expect(next.except.has("a" as RowId)).toBe(true)
    expect(isRowSelected(next, "a" as RowId)).toBe(false)
  })

  test("filtered: preserves viewKey", () => {
    const sel: BcSelection = {
      mode: "filtered",
      except: new Set(),
      viewKey: "view-1",
    }
    const next = toggleRow(sel, "a" as RowId)
    if (next.mode === "filtered") expect(next.viewKey).toBe("view-1")
  })
})

describe("selectRange", () => {
  const ids = ["a", "b", "c", "d", "e"] as RowId[]

  test("ascending range", () => {
    const sel = selectRange(ids, "b" as RowId, "d" as RowId)
    if (sel.mode === "explicit") expect([...sel.rowIds].sort()).toEqual(["b", "c", "d"])
  })

  test("descending range — same result, anchor and current swappable", () => {
    const sel = selectRange(ids, "d" as RowId, "b" as RowId)
    if (sel.mode === "explicit") expect([...sel.rowIds].sort()).toEqual(["b", "c", "d"])
  })

  test("single-row range when anchor === current", () => {
    const sel = selectRange(ids, "c" as RowId, "c" as RowId)
    if (sel.mode === "explicit") expect([...sel.rowIds]).toEqual(["c"])
  })

  test("full range", () => {
    const sel = selectRange(ids, "a" as RowId, "e" as RowId)
    if (sel.mode === "explicit") {
      expect([...sel.rowIds].sort()).toEqual(["a", "b", "c", "d", "e"])
    }
  })

  test("missing anchor → fallback to selectOnly(current)", () => {
    const sel = selectRange(ids, "missing" as RowId, "c" as RowId)
    if (sel.mode === "explicit") expect([...sel.rowIds]).toEqual(["c"])
  })

  test("missing current → fallback to selectOnly(current)", () => {
    const sel = selectRange(ids, "a" as RowId, "missing" as RowId)
    if (sel.mode === "explicit") expect([...sel.rowIds]).toEqual(["missing"])
  })
})

describe("selectionSize", () => {
  test("explicit: returns set size", () => {
    expect(selectionSize({ mode: "explicit", rowIds: new Set() })).toBe(0)
    expect(selectionSize({ mode: "explicit", rowIds: new Set(["a" as RowId, "b" as RowId]) })).toBe(
      2,
    )
  })

  test("all / filtered: undefined (consumer-dependent)", () => {
    expect(selectionSize({ mode: "all", except: new Set() })).toBeUndefined()
    expect(selectionSize({ mode: "filtered", except: new Set() })).toBeUndefined()
  })
})

describe("selectAllRows", () => {
  test("returns an explicit selection containing every supplied id", () => {
    const ids = ["a", "b", "c"] as RowId[]
    const sel = selectAllRows(ids)
    expect(sel.mode).toBe("explicit")
    if (sel.mode === "explicit") {
      expect(Array.from(sel.rowIds).sort()).toEqual(["a", "b", "c"])
    }
  })

  test("empty input → empty explicit selection", () => {
    const sel = selectAllRows([])
    expect(sel.mode).toBe("explicit")
    if (sel.mode === "explicit") {
      expect(sel.rowIds.size).toBe(0)
    }
  })
})

describe("clearSelection", () => {
  test("returns a fresh empty explicit selection", () => {
    const sel = clearSelection()
    expect(sel.mode).toBe("explicit")
    if (sel.mode === "explicit") {
      expect(sel.rowIds.size).toBe(0)
    }
  })
})

describe("headerCheckboxState", () => {
  const ids = ["a", "b", "c"] as RowId[]

  test("'none' when no visible row is selected", () => {
    expect(headerCheckboxState(empty, ids)).toBe("none")
  })

  test("'all' when every visible row is in the explicit set", () => {
    const sel: BcSelection = { mode: "explicit", rowIds: new Set(ids) }
    expect(headerCheckboxState(sel, ids)).toBe("all")
  })

  test("'some' when at least one but not all visible rows are selected", () => {
    const a = ids[0]
    const b = ids[1]
    if (!a || !b) throw new Error("test fixture")
    const sel: BcSelection = { mode: "explicit", rowIds: new Set([a, b]) }
    expect(headerCheckboxState(sel, ids)).toBe("some")
  })

  test("'none' for an empty visible-rows list", () => {
    expect(headerCheckboxState(empty, [])).toBe("none")
  })

  test("'all' / 'filtered' selection modes collapse to 'all' (the visible page is fully covered)", () => {
    expect(headerCheckboxState({ mode: "all", except: new Set() }, ids)).toBe("all")
    expect(headerCheckboxState({ mode: "filtered", except: new Set() }, ids)).toBe("all")
  })

  test("explicit selection containing rows OUTSIDE the visible set still reports 'none' if no visible row is in it", () => {
    const sel: BcSelection = { mode: "explicit", rowIds: new Set(["x" as RowId]) }
    expect(headerCheckboxState(sel, ids)).toBe("none")
  })
})
