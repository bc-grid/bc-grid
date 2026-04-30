import { describe, expect, test } from "bun:test"
import { buildGridFilter } from "../src/filter"
import { type ResolvedColumn, resolveFilterRowVisibility } from "../src/gridInternals"
import type { BcReactGridColumn } from "../src/types"

interface Row {
  name: string
}

function makeColumn(
  columnId: string,
  filter: BcReactGridColumn<Row>["filter"],
): ResolvedColumn<Row> {
  return {
    align: "left",
    columnId,
    left: 0,
    pinned: null,
    position: 0,
    width: 120,
    source: {
      columnId,
      header: columnId,
      ...(filter !== undefined ? { filter } : {}),
    } satisfies BcReactGridColumn<Row>,
  }
}

const inlineFilterColumn = makeColumn("name", { type: "text" })
const popupFilterColumn = makeColumn("name", { type: "text", variant: "popup" })
const noFilterColumn = makeColumn("status", false)
const unconfiguredColumn = makeColumn("notes", undefined)

describe("resolveFilterRowVisibility — column-driven default (showFilterRow undefined)", () => {
  test("renders when at least one column has an inline-variant filter", () => {
    expect(resolveFilterRowVisibility(undefined, [inlineFilterColumn, noFilterColumn])).toBe(true)
  })

  test("hidden when every filterable column is variant='popup'", () => {
    expect(resolveFilterRowVisibility(undefined, [popupFilterColumn, noFilterColumn])).toBe(false)
  })

  test("hidden when no column declares a filter", () => {
    expect(resolveFilterRowVisibility(undefined, [noFilterColumn, unconfiguredColumn])).toBe(false)
  })

  test("hidden for an empty column set", () => {
    expect(resolveFilterRowVisibility(undefined, [])).toBe(false)
  })

  test("renders for the mixed case (inline + popup on different columns)", () => {
    expect(resolveFilterRowVisibility(undefined, [inlineFilterColumn, popupFilterColumn])).toBe(
      true,
    )
  })
})

describe("resolveFilterRowVisibility — explicit override", () => {
  test("`true` forces visible even if every column is popup-variant", () => {
    expect(resolveFilterRowVisibility(true, [popupFilterColumn, noFilterColumn])).toBe(true)
  })

  test("`true` forces visible even on an empty column set", () => {
    expect(resolveFilterRowVisibility(true, [])).toBe(true)
  })

  test("`false` hides the row even with an inline-variant column", () => {
    expect(resolveFilterRowVisibility(false, [inlineFilterColumn])).toBe(false)
  })

  test("`false` is honored across a mixed column set", () => {
    expect(
      resolveFilterRowVisibility(false, [inlineFilterColumn, popupFilterColumn, noFilterColumn]),
    ).toBe(false)
  })
})

describe("active filter state survives row visibility toggles", () => {
  test("buildGridFilter still produces an active filter when the row is hidden", () => {
    // The host app calls showFilterRow=false but the underlying
    // `columnFilterText` map is untouched. The predicate should keep
    // narrowing rows because the editor row is the input surface, not
    // the storage.
    const columnFilterText = { name: "Acme" }
    expect(buildGridFilter(columnFilterText)).toEqual({
      kind: "column",
      columnId: "name",
      type: "text",
      op: "contains",
      value: "Acme",
    })
    // Toggling the row visibility flag itself never touches the filter
    // text or the resolved filter — they are independent surfaces.
    expect(resolveFilterRowVisibility(false, [inlineFilterColumn])).toBe(false)
    expect(buildGridFilter(columnFilterText)).not.toBeNull()
  })

  test("popup-variant columns are unaffected by showFilterRow=false", () => {
    // showFilterRow only controls the inline-row editor surface. The
    // popup funnel sits in the column header (`renderHeaderCell`) and
    // is not gated by `hasInlineFilters`. resolveFilterRowVisibility
    // returns the row visibility — it does not represent whether the
    // header funnel is reachable.
    expect(resolveFilterRowVisibility(false, [popupFilterColumn])).toBe(false)
    // The column's `filter.variant === "popup"` configuration is
    // untouched by the visibility decision.
    expect(popupFilterColumn.source.filter).toEqual({ type: "text", variant: "popup" })
  })
})
