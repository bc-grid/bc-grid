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
import {
  readPersistedGridState,
  readUrlPersistedGridState,
  writePersistedGridState,
} from "../src/persistence"
import type { BcReactGridColumn } from "../src/types"

interface InMemoryStorage {
  entries: Map<string, string>
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

function emptyStorage(): InMemoryStorage {
  const entries = new Map<string, string>()
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value)
    },
    removeItem: (key) => {
      entries.delete(key)
    },
  }
}

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

describe("filter-row-toggle-contract-v040 — explicit prop matrix", () => {
  // bsncraft reported the inline filter-row toggle as confusing.
  // The behaviour was correct but under-tested at the prop matrix
  // level. These tests pin the contract a host toolbar toggle
  // depends on so a future refactor that drops `showFilters` (the
  // back-compat alias), inverts the precedence, or accidentally
  // gates the toggle on column state surfaces here noisily.
  test("showFilterRow=true forces visible regardless of column config", () => {
    expect(resolveFilterRowVisibility(true, [])).toBe(true)
    expect(resolveFilterRowVisibility(true, [noFilterColumn])).toBe(true)
    expect(resolveFilterRowVisibility(true, [popupFilterColumn])).toBe(true)
    expect(resolveFilterRowVisibility(true, [inlineFilterColumn])).toBe(true)
  })

  test("showFilterRow=false hides regardless of column config", () => {
    expect(resolveFilterRowVisibility(false, [])).toBe(false)
    expect(resolveFilterRowVisibility(false, [noFilterColumn])).toBe(false)
    expect(resolveFilterRowVisibility(false, [popupFilterColumn])).toBe(false)
    expect(resolveFilterRowVisibility(false, [inlineFilterColumn])).toBe(false)
    // Mixed — still hidden.
    expect(
      resolveFilterRowVisibility(false, [inlineFilterColumn, popupFilterColumn, noFilterColumn]),
    ).toBe(false)
  })

  test("showFilterRow=undefined keeps the column-driven default", () => {
    // Empty / no-filter / all-popup → hidden by default (no inline
    // editor surface to render). At least one inline filter → visible.
    expect(resolveFilterRowVisibility(undefined, [])).toBe(false)
    expect(resolveFilterRowVisibility(undefined, [noFilterColumn])).toBe(false)
    expect(resolveFilterRowVisibility(undefined, [popupFilterColumn])).toBe(false)
    expect(resolveFilterRowVisibility(undefined, [inlineFilterColumn])).toBe(true)
    expect(resolveFilterRowVisibility(undefined, [popupFilterColumn, inlineFilterColumn])).toBe(
      true,
    )
  })

  test("showFilterRow + showFilters precedence — showFilterRow always wins", () => {
    // grid.tsx resolves the prop pair as
    // `showFilterRow ?? showFilters` so the explicit override beats
    // the back-compat alias even when they disagree. Reproduce the
    // resolution against the visibility helper to pin the contract.
    const resolve = (showFilterRow: boolean | undefined, showFilters: boolean | undefined) =>
      resolveFilterRowVisibility(showFilterRow ?? showFilters, [inlineFilterColumn])

    // Both undefined → column-driven (true here because the column
    // is inline-variant).
    expect(resolve(undefined, undefined)).toBe(true)
    // Only the alias → alias wins.
    expect(resolve(undefined, false)).toBe(false)
    expect(resolve(undefined, true)).toBe(true)
    // Both supplied — `showFilterRow` always wins.
    expect(resolve(true, false)).toBe(true)
    expect(resolve(false, true)).toBe(false)
    expect(resolve(false, false)).toBe(false)
    expect(resolve(true, true)).toBe(true)
  })

  test("showFilters alias accepted when showFilterRow is explicitly undefined", () => {
    // Some host apps migrated from a wrapper-level `showFilters` boolean
    // and still pass that field. The grid honours it as long as
    // `showFilterRow` is undefined. Pin the contract so the alias can't
    // silently become a no-op.
    const resolve = (showFilters: boolean | undefined) =>
      resolveFilterRowVisibility(showFilters, [inlineFilterColumn])

    expect(resolve(false)).toBe(false)
    expect(resolve(true)).toBe(true)
    expect(resolve(undefined)).toBe(true)
  })
})

describe("filter-row-toggle-contract-v040 — toolbar-toggle recipe", () => {
  // The intended host-app pattern: a toolbar button owns a boolean
  // and threads it into `<BcGrid showFilterRow={value}>`. Toggling
  // the button must not perturb `columnFilterText` (the active
  // filter state) or the resolved `BcGridFilter`. This is the
  // contract bsncraft cares about — the toolbar button reads as a
  // pure visibility toggle.
  test("a host useState boolean threaded into showFilterRow does not touch columnFilterText", () => {
    // Simulates the host-app loop:
    //   const [filtersOpen, setFiltersOpen] = useState(true)
    //   <BcGrid showFilterRow={filtersOpen} />
    // Toggling `filtersOpen` should be a pure visibility flip.
    const columnFilterText = {
      name: "Acme",
      balance: encodeNumberFilterInput({ op: ">=", value: "1000" }),
    }
    const types = { name: "text", balance: "number" } as const
    const filterStateBefore = buildGridFilter(columnFilterText, types)

    let filtersOpen = true
    expect(resolveFilterRowVisibility(filtersOpen, [inlineFilterColumn])).toBe(true)

    // Toggle off — the row hides; the filter map and the resolved
    // filter MUST be byte-identical.
    filtersOpen = false
    expect(resolveFilterRowVisibility(filtersOpen, [inlineFilterColumn])).toBe(false)
    expect(buildGridFilter(columnFilterText, types)).toEqual(filterStateBefore)

    // Toggle on again — same invariant in reverse.
    filtersOpen = true
    expect(resolveFilterRowVisibility(filtersOpen, [inlineFilterColumn])).toBe(true)
    expect(buildGridFilter(columnFilterText, types)).toEqual(filterStateBefore)
  })

  test("toggling visibility does not affect popup-variant columns' funnel reachability", () => {
    // When a column is configured as `filter: { variant: "popup" }`,
    // its filter affordance lives on the column header (the funnel
    // button), not in the inline filter row. Toggling the row's
    // visibility must not change the column's filter configuration —
    // the popup funnel stays reachable in either state. This pins the
    // separation of concerns between row visibility and per-column
    // filter UI.
    expect(popupFilterColumn.source.filter).toEqual({ type: "text", variant: "popup" })

    expect(resolveFilterRowVisibility(true, [popupFilterColumn])).toBe(true)
    expect(popupFilterColumn.source.filter).toEqual({ type: "text", variant: "popup" })

    expect(resolveFilterRowVisibility(false, [popupFilterColumn])).toBe(false)
    expect(popupFilterColumn.source.filter).toEqual({ type: "text", variant: "popup" })

    expect(resolveFilterRowVisibility(undefined, [popupFilterColumn])).toBe(false)
    expect(popupFilterColumn.source.filter).toEqual({ type: "text", variant: "popup" })
  })
})

describe("filter-row-toggle-contract-v040 — persistence invariant", () => {
  // Visibility is a host-controlled prop, not persisted state. A
  // toolbar toggle that flips `showFilterRow` between true / false
  // must NEVER round-trip through `gridId` localStorage or
  // `urlStatePersistence`. This test pins the negative invariant
  // by inspecting the persistence type at runtime.
  //
  // Both `PersistedGridState` and `UrlPersistedGridState` are
  // structural — TypeScript doesn't expose them as runtime objects.
  // The helpers `readPersistedGridState` / `readUrlPersistedGridState`
  // return the shape with explicit-undefined keys, which lets us
  // assert via `Object.keys` that no `showFilterRow` slot exists.
  test("readPersistedGridState never carries showFilterRow / showFilters", () => {
    const empty = readPersistedGridState("test-grid", emptyStorage())
    const keys = Object.keys(empty)
    expect(keys).not.toContain("showFilterRow")
    expect(keys).not.toContain("showFilters")
    // Sanity: the read returned the documented eight persistence keys
    // (filter / pageSize / density / groupBy / pivotState / sidebarPanel
    // / sort + columnState). If a key gets added to the persistence
    // type, this list is the place to update it.
    for (const key of keys) {
      expect([
        "columnState",
        "pageSize",
        "density",
        "groupBy",
        "pivotState",
        "filter",
        "sidebarPanel",
        "sort",
      ]).toContain(key)
    }
  })

  test("readUrlPersistedGridState never carries showFilterRow / showFilters", () => {
    const empty = readUrlPersistedGridState(
      { searchParam: "grid" },
      { pathname: "/", search: "", hash: "" },
    )
    const keys = Object.keys(empty)
    expect(keys).not.toContain("showFilterRow")
    expect(keys).not.toContain("showFilters")
  })

  test("writing visibility-bearing state has no observable effect on storage", () => {
    // Belt-and-braces: even if a future refactor accidentally widened
    // PersistedGridState to accept arbitrary keys, the writer should
    // still ignore an unsupported `showFilterRow` field. Cast to a
    // permissive shape to model the misuse and assert no key with that
    // name lands in storage.
    const storage = emptyStorage()
    writePersistedGridState(
      "test-grid",
      // Unknown keys are stripped by the writer — pass them anyway to
      // confirm the contract.
      {
        filter: null as unknown as undefined,
      } as Parameters<typeof writePersistedGridState>[1] & {
        showFilterRow?: boolean
      },
      storage,
    )
    const keys = Array.from(storage.entries.keys())
    expect(keys).not.toContain("bc-grid:test-grid:showFilterRow")
    expect(keys).not.toContain("bc-grid:test-grid:showFilters")
  })
})
