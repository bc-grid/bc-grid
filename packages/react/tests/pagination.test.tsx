import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import {
  BcGridPagination,
  getPaginationWindow,
  isPaginationEnabled,
  normalisePageSizeOptions,
  resolvePaginationEnabled,
  resolvePaginationRowCount,
} from "../src/pagination"

describe("normalisePageSizeOptions", () => {
  test("keeps positive integer options, deduped and sorted", () => {
    expect(normalisePageSizeOptions([100, 25, 25, 50.7, 0, -1])).toEqual([25, 50, 100])
  })

  test("falls back to defaults when no usable options are supplied", () => {
    expect(normalisePageSizeOptions([])).toEqual([25, 50, 100, 250])
    expect(normalisePageSizeOptions(undefined)).toEqual([25, 50, 100, 250])
  })
})

describe("getPaginationWindow", () => {
  test("returns the requested page slice", () => {
    expect(getPaginationWindow(250, 1, 100)).toEqual({
      page: 1,
      pageSize: 100,
      pageCount: 3,
      totalRows: 250,
      startIndex: 100,
      endIndex: 200,
    })
  })

  test("clamps requested page to the available range", () => {
    expect(getPaginationWindow(250, 99, 100)).toMatchObject({
      page: 2,
      startIndex: 200,
      endIndex: 250,
    })
  })

  test("handles empty row sets as page 1 of 1", () => {
    expect(getPaginationWindow(0, 3, 50)).toEqual({
      page: 0,
      pageSize: 50,
      pageCount: 1,
      totalRows: 0,
      startIndex: 0,
      endIndex: 0,
    })
  })
})

describe("isPaginationEnabled", () => {
  test("explicit true forces pagination on regardless of dataset size", () => {
    expect(isPaginationEnabled(true, 0, 100)).toBe(true)
    expect(isPaginationEnabled(true, 5, 100)).toBe(true)
  })

  test("explicit false bypasses the threshold and stays off", () => {
    expect(isPaginationEnabled(false, 5_000, 100)).toBe(false)
  })

  test("undefined auto-enables once rowCount exceeds pageSize", () => {
    expect(isPaginationEnabled(undefined, 99, 100)).toBe(false)
    expect(isPaginationEnabled(undefined, 100, 100)).toBe(false)
    expect(isPaginationEnabled(undefined, 101, 100)).toBe(true)
  })

  test("undefined stays off for small/empty datasets", () => {
    expect(isPaginationEnabled(undefined, 0, 100)).toBe(false)
    expect(isPaginationEnabled(undefined, 50, 100)).toBe(false)
  })
})

describe("getPaginationWindow — server-paged totals", () => {
  // The window function is the same in both modes; what changes in
  // manual / server-paged mode is which `totalRows` the consumer
  // passes. The grid passes `paginationTotalRows` (the server total)
  // rather than `data.length` (the loaded slice). These tests pin the
  // server-paged ergonomics so the pager renders meaningful pageCount
  // values when only one page is loaded but the server reports 36 k
  // rows.
  test("computes pageCount from server total, not the loaded slice", () => {
    expect(getPaginationWindow(36302, 0, 25)).toMatchObject({
      page: 0,
      pageCount: 1453,
      totalRows: 36302,
      startIndex: 0,
      endIndex: 25,
    })
  })

  test("last server page surfaces an inclusive endIndex equal to total", () => {
    expect(getPaginationWindow(36302, 1452, 25)).toMatchObject({
      page: 1452,
      pageCount: 1453,
      totalRows: 36302,
      startIndex: 36300,
      endIndex: 36302,
    })
  })

  test("clamps past-end pageIndex back to last page (e.g. user navigates after total drops)", () => {
    // Server returns a smaller total after a filter. Page 1452 no longer
    // exists; clamp to the new last page.
    expect(getPaginationWindow(120, 1452, 25)).toMatchObject({
      page: 4,
      pageCount: 5,
      startIndex: 100,
      endIndex: 120,
    })
  })
})

describe("BcGridPagination — server total label", () => {
  // The pager renders "Rows X-Y of Z" — for server-paged mode Z is the
  // server total even when only the current page is loaded. These
  // render-tests pin the formatted output so a regression in
  // toLocaleString or the offset math surfaces here.
  function renderPager(args: {
    page: number
    pageCount: number
    pageSize: number
    totalRows: number
  }): string {
    return renderToStaticMarkup(
      <BcGridPagination
        page={args.page}
        pageCount={args.pageCount}
        pageSize={args.pageSize}
        pageSizeOptions={[25, 50, 100]}
        totalRows={args.totalRows}
        onChange={() => {}}
      />,
    )
  }

  test("first page of a 36 302-row server-paged result", () => {
    const html = renderPager({ page: 0, pageCount: 1453, pageSize: 25, totalRows: 36302 })

    expect(html).toContain("Rows 1-25 of 36,302")
    expect(html).toContain("Page 1 of 1,453")
    // First / Prev disabled at page 0; Next / Last enabled.
    expect(html).toMatch(
      /aria-label="First page"[^>]*disabled|disabled[^>]*aria-label="First page"/,
    )
    expect(html).toMatch(
      /aria-label="Previous page"[^>]*disabled|disabled[^>]*aria-label="Previous page"/,
    )
    expect(html).not.toMatch(
      /aria-label="Next page"[^>]*disabled|disabled[^>]*aria-label="Next page"/,
    )
  })

  test("middle page of a server-paged result reports the absolute row range", () => {
    const html = renderPager({ page: 5, pageCount: 1453, pageSize: 25, totalRows: 36302 })

    expect(html).toContain("Rows 126-150 of 36,302")
    expect(html).toContain("Page 6 of 1,453")
  })

  test("last page surfaces an inclusive end and disables Next / Last", () => {
    const html = renderPager({ page: 1452, pageCount: 1453, pageSize: 25, totalRows: 36302 })

    expect(html).toContain("Rows 36,301-36,302 of 36,302")
    expect(html).toContain("Page 1,453 of 1,453")
    expect(html).toMatch(/aria-label="Next page"[^>]*disabled|disabled[^>]*aria-label="Next page"/)
    expect(html).toMatch(/aria-label="Last page"[^>]*disabled|disabled[^>]*aria-label="Last page"/)
  })

  test("empty server result reports 0-0 of 0 with all controls disabled", () => {
    const html = renderPager({ page: 0, pageCount: 1, pageSize: 25, totalRows: 0 })

    expect(html).toContain("Rows 0-0 of 0")
    expect(html).toContain("Page 1 of 1")
    expect(html).toMatch(
      /aria-label="First page"[^>]*disabled|disabled[^>]*aria-label="First page"/,
    )
    expect(html).toMatch(/aria-label="Last page"[^>]*disabled|disabled[^>]*aria-label="Last page"/)
  })
})

describe("resolvePaginationRowCount", () => {
  // The pager wants the dataset total. In client mode that equals the
  // post-filter row set (`data.length` after filtering / search). In
  // manual mode the consumer passes the server total via
  // `paginationTotalRows`; the grid never knows the rows beyond the
  // current page.
  test("client mode always uses the loaded row count", () => {
    expect(resolvePaginationRowCount("client", 36302, 25)).toBe(25)
    expect(resolvePaginationRowCount("client", undefined, 250)).toBe(250)
    expect(resolvePaginationRowCount("client", null, 0)).toBe(0)
  })

  test("manual mode prefers an explicit server total", () => {
    expect(resolvePaginationRowCount("manual", 36302, 25)).toBe(36302)
    expect(resolvePaginationRowCount("manual", 0, 25)).toBe(0)
  })

  test("manual mode floors fractional totals + clamps to non-negative", () => {
    expect(resolvePaginationRowCount("manual", 36302.7, 25)).toBe(36302)
    expect(resolvePaginationRowCount("manual", -1, 25)).toBe(0)
  })

  test("manual mode falls back to the loaded count when total is missing or non-finite", () => {
    // Graceful degradation: if a consumer set paginationMode="manual"
    // but forgot the total, we render the pager against the loaded
    // slice rather than throwing.
    expect(resolvePaginationRowCount("manual", undefined, 25)).toBe(25)
    expect(resolvePaginationRowCount("manual", null, 25)).toBe(25)
    expect(resolvePaginationRowCount("manual", Number.NaN, 25)).toBe(25)
    expect(resolvePaginationRowCount("manual", Number.POSITIVE_INFINITY, 25)).toBe(25)
  })
})

describe("resolvePaginationEnabled", () => {
  // Manual mode forces the pager on whenever the consumer hasn't
  // explicitly disabled it: a server-paged source is paged by
  // definition, even if the loaded slice is smaller than the threshold
  // (e.g., the last page of a 36 k-row dataset has 2 rows). Client
  // mode delegates to the existing threshold-based default.
  test("manual mode forces on when pagination is undefined or true", () => {
    expect(resolvePaginationEnabled("manual", undefined, 25, 100)).toBe(true)
    expect(resolvePaginationEnabled("manual", true, 25, 100)).toBe(true)
    // Even with rowCount === 0 (empty server result) the pager renders.
    expect(resolvePaginationEnabled("manual", undefined, 0, 100)).toBe(true)
  })

  test("manual mode honours explicit pagination={false}", () => {
    expect(resolvePaginationEnabled("manual", false, 36302, 25)).toBe(false)
  })

  test("client mode keeps the threshold-driven auto behaviour", () => {
    expect(resolvePaginationEnabled("client", undefined, 50, 100)).toBe(false)
    expect(resolvePaginationEnabled("client", undefined, 101, 100)).toBe(true)
    expect(resolvePaginationEnabled("client", true, 5, 100)).toBe(true)
    expect(resolvePaginationEnabled("client", false, 5_000, 100)).toBe(false)
  })
})
