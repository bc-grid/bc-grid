import { describe, expect, test } from "bun:test"
import type { BcGridFilter, ServerRowPatch } from "@bc-grid/core"
import {
  buildOptimisticEditPatch,
  defaultBoundErrorMessage,
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

describe("useServerPagedGrid dual-output surface (worker1 v06 IMPL)", () => {
  // Source-pattern regression suite — the dual-output IMPL adds an
  // additional `bound` field on the result + an opt-in
  // `outputs: "server" | "bound"` option that gates internal
  // orchestration. These checks pin the public surface shape so a
  // refactor that breaks the contract catches in CI before the
  // orchestration path silently changes.
  const here = new URL(".", import.meta.url).pathname
  const source = require("node:fs").readFileSync(
    `${here}/../src/useServerPagedGrid.ts`,
    "utf8",
  ) as string

  test("UseServerPagedGridResult has serverProps + bound + props (deprecated alias)", () => {
    expect(source).toMatch(/serverProps: UseServerPagedGridBoundProps<TRow>/)
    expect(source).toMatch(/bound: UseServerPagedGridBoundOutput<TRow>/)
    expect(source).toMatch(/@deprecated Renamed to `serverProps` in v0\.6\.0/)
    expect(source).toMatch(/props: UseServerPagedGridBoundProps<TRow>/)
  })

  test("UseServerPagedGridBoundOutput shape matches BcGridProps subset (RFC §3.2)", () => {
    expect(source).toMatch(/data: readonly TRow\[\]/)
    expect(source).toMatch(/loading: boolean/)
    expect(source).toMatch(/errorOverlay: ReactNode \| undefined/)
    expect(source).toMatch(/rowProcessingMode: "manual"/)
    expect(source).toMatch(/pagination: BcPaginationState/)
    expect(source).toMatch(/onPaginationChange: \(next: BcPaginationState\)/)
  })

  test("outputs option is on UseServerPagedGridOptions with default 'server'", () => {
    expect(source).toMatch(/outputs\?: "server" \| "bound"/)
    expect(source).toMatch(/outputs = "server",/)
  })

  test("internal orchestration loop is gated on outputs === 'bound'", () => {
    expect(source).toMatch(/const boundActive = outputs === "bound"/)
    expect(source).toMatch(/if \(!boundActive\) return/)
    expect(source).toMatch(/wrappedLoadPage\(query, \{ signal: controller\.signal \}\)/)
  })

  test("orchestration cancels prior in-flight via AbortController", () => {
    expect(source).toMatch(/boundAbortRef\.current\?\.abort\(\)/)
    expect(source).toMatch(/return \(\) => controller\.abort\(\)/)
  })

  test("return statement aliases props → serverProps for backwards compat", () => {
    expect(source).toMatch(/return \{ serverProps, bound, props: serverProps, state, actions \}/)
  })
})

describe("defaultBoundErrorMessage (worker1 v06 dual-output IMPL)", () => {
  test("Error instance prefixes with 'Failed to load.'", () => {
    expect(defaultBoundErrorMessage(new Error("server hiccup"))).toBe(
      "Failed to load. server hiccup",
    )
  })

  test("Error with empty message returns the bare prefix", () => {
    expect(defaultBoundErrorMessage(new Error(""))).toBe("Failed to load.")
  })

  test("non-Error returns the bare prefix", () => {
    expect(defaultBoundErrorMessage({ status: 500 })).toBe("Failed to load.")
  })

  test("null returns the bare prefix", () => {
    expect(defaultBoundErrorMessage(null)).toBe("Failed to load.")
  })

  test("string returns the bare prefix (does not embed the string)", () => {
    expect(defaultBoundErrorMessage("network down")).toBe("Failed to load.")
  })
})
