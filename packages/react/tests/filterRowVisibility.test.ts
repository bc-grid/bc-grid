import { describe, expect, test } from "bun:test"
import type { ColumnId } from "@bc-grid/core"
import {
  buildGridFilter,
  columnFilterTextEqual,
  columnFilterTextFromGridFilter,
  encodeNumberFilterInput,
  encodeSetFilterInput,
  matchesGridFilter,
} from "../src/filter"
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

  test("multi-type filter state is preserved across show→hide→show toggles", () => {
    // Simulates a host app that wires `showFilterRow` to a "Show filters"
    // toggle button. The grid stores `columnFilterText` as React state and
    // computes `inlineFilter = buildGridFilter(columnFilterText, columnFilterTypes)`
    // independently of row visibility. Toggling visibility must not perturb
    // either map. We pin the contract across every supported inline-filter
    // type so a future regression in any single type-branch surfaces here.
    const types = {
      name: "text",
      balance: "number",
      status: "set",
      creditHold: "boolean",
    } as const
    const columnFilterText = {
      name: "Acme",
      balance: encodeNumberFilterInput({ op: ">=", value: "1000" }),
      status: encodeSetFilterInput({ op: "in", values: ["Open", "Past Due"] }),
      creditHold: "true",
    }
    const filterBeforeHide = buildGridFilter(columnFilterText, types)
    expect(filterBeforeHide).not.toBeNull()

    // Hide the row. `columnFilterText` is the storage; the row is the
    // input surface. The two are independent.
    expect(resolveFilterRowVisibility(false, [inlineFilterColumn])).toBe(false)

    // Without any state mutation, the resolved filter is identical
    // (deep equal, not just reference equal — buildGridFilter is pure).
    const filterWhileHidden = buildGridFilter(columnFilterText, types)
    expect(filterWhileHidden).toEqual(filterBeforeHide)

    // The predicate keeps narrowing the same row set while the row is
    // hidden, proving the filter is still active rather than dormant.
    const lookup =
      (values: Record<ColumnId, string>) =>
      (columnId: ColumnId): string =>
        values[columnId] ?? ""
    const matchingRow = lookup({
      name: "Acme Corp",
      balance: "$2,500",
      status: "Past Due",
      creditHold: "Yes",
    })
    const nonMatchingRow = lookup({
      name: "Beta Co",
      balance: "$100",
      status: "Closed",
      creditHold: "No",
    })
    if (!filterWhileHidden) throw new Error("expected filter")
    expect(matchesGridFilter(filterWhileHidden, matchingRow)).toBe(true)
    expect(matchesGridFilter(filterWhileHidden, nonMatchingRow)).toBe(false)

    // Show the row again. The same `columnFilterText` survives, so
    // `buildGridFilter` deep-equals what we computed before hiding.
    expect(resolveFilterRowVisibility(true, [inlineFilterColumn])).toBe(true)
    expect(buildGridFilter(columnFilterText, types)).toEqual(filterBeforeHide)
  })

  test("controlled-filter projection is stable across visibility toggles", () => {
    // For a host app driving `<BcGrid filter={...}>`, the React layer
    // projects the controlled filter into `columnFilterText` via
    // `columnFilterTextFromGridFilter`. Toggling row visibility must not
    // cause this projection to drift, otherwise the controlled-filter
    // display would re-hydrate to a different shape on the next render.
    const filter = {
      kind: "group" as const,
      op: "and" as const,
      filters: [
        {
          kind: "column" as const,
          columnId: "name",
          type: "text" as const,
          op: "contains",
          value: "Acme",
        },
        {
          kind: "column" as const,
          columnId: "balance",
          type: "number" as const,
          op: ">=" as const,
          value: 1000,
        },
      ],
    }
    const projection = columnFilterTextFromGridFilter(filter)
    expect(columnFilterTextEqual(projection, columnFilterTextFromGridFilter(filter))).toBe(true)

    // Visibility toggle is a pure read on `resolvedColumns`; the
    // projection is computed from `filter` and must remain identical.
    expect(resolveFilterRowVisibility(false, [inlineFilterColumn])).toBe(false)
    expect(columnFilterTextEqual(projection, columnFilterTextFromGridFilter(filter))).toBe(true)
    expect(resolveFilterRowVisibility(true, [inlineFilterColumn])).toBe(true)
    expect(columnFilterTextEqual(projection, columnFilterTextFromGridFilter(filter))).toBe(true)
  })

  test("filter cleared while row is hidden round-trips to {} after re-show", () => {
    // Edge case: a host app could call `setFilter(null)` (or the
    // imperative `gridApi.setFilter(null)`) while `showFilterRow=false`.
    // The cleared state must propagate to `columnFilterText` regardless
    // of row visibility — i.e., re-showing the row must NOT resurrect
    // stale filter text from a "previous" `columnFilterText` snapshot.
    const cleared = columnFilterTextFromGridFilter(null)
    expect(cleared).toEqual({})
    // Toggle visibility either direction. The cleared projection is the
    // same — visibility is a pure derive on column defs, not state.
    expect(resolveFilterRowVisibility(false, [inlineFilterColumn])).toBe(false)
    expect(columnFilterTextFromGridFilter(null)).toEqual({})
    expect(resolveFilterRowVisibility(true, [inlineFilterColumn])).toBe(true)
    expect(columnFilterTextFromGridFilter(null)).toEqual({})
    // And the cleared text round-trips via buildGridFilter to null.
    expect(buildGridFilter(cleared)).toBeNull()
  })
})
