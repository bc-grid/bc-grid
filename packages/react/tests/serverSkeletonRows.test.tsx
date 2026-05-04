import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { BcGrid } from "../src/grid"
import type { BcGridColumn } from "../src/types"

// Worker1 v06 — server skeleton rows. The grid extends rowEntries
// to `expectedRowCount` with synthetic SkeletonRowEntry items when
// `expectedRowCount > data.length` AND `serverLoadingSkeleton !==
// false`. `<BcServerGrid rowModel="infinite">` feeds expectedRowCount
// from the server-reported totalRows so positions beyond loaded
// blocks render placeholder chrome instead of empty space.

interface Row {
  id: string
  name: string
}

const columns: readonly BcGridColumn<Row>[] = [
  { columnId: "name", field: "name", header: "Name", width: 200 },
]

const data: readonly Row[] = [
  { id: "a", name: "Acme" },
  { id: "b", name: "Bravo" },
]

describe("BcGrid server skeleton rows (worker1 v06)", () => {
  test("default state — no expectedRowCount → no skeleton rows render", () => {
    const html = renderToStaticMarkup(
      <BcGrid<Row>
        ariaLabel="Customers"
        columns={columns}
        data={data}
        height={400}
        rowId={(row) => row.id}
      />,
    )
    expect(html).not.toContain('data-bc-grid-row-kind="skeleton"')
  })

  test("expectedRowCount > data.length → skeleton rows render up to expected", () => {
    const html = renderToStaticMarkup(
      <BcGrid<Row>
        ariaLabel="Customers"
        columns={columns}
        data={data}
        expectedRowCount={5}
        height={400}
        rowId={(row) => row.id}
      />,
    )
    // 2 data rows + 3 skeleton rows = 5 total expected.
    const skeletonMatches = Array.from(html.matchAll(/data-bc-grid-row-kind="skeleton"/g))
    expect(skeletonMatches.length).toBe(3)
  })

  test("expectedRowCount === data.length → no skeleton rows", () => {
    const html = renderToStaticMarkup(
      <BcGrid<Row>
        ariaLabel="Customers"
        columns={columns}
        data={data}
        expectedRowCount={2}
        height={400}
        rowId={(row) => row.id}
      />,
    )
    expect(html).not.toContain('data-bc-grid-row-kind="skeleton"')
  })

  test("serverLoadingSkeleton: false → opts out even when expectedRowCount > data.length", () => {
    const html = renderToStaticMarkup(
      <BcGrid<Row>
        ariaLabel="Customers"
        columns={columns}
        data={data}
        expectedRowCount={5}
        serverLoadingSkeleton={false}
        height={400}
        rowId={(row) => row.id}
      />,
    )
    expect(html).not.toContain('data-bc-grid-row-kind="skeleton"')
  })

  test("default variant: lines (no serverLoadingSkeleton prop)", () => {
    const html = renderToStaticMarkup(
      <BcGrid<Row>
        ariaLabel="Customers"
        columns={columns}
        data={data}
        expectedRowCount={3}
        height={400}
        rowId={(row) => row.id}
      />,
    )
    expect(html).toContain('data-bc-grid-skeleton-variant="lines"')
    expect(html).toContain("bc-grid-skeleton-lines")
    expect(html).not.toContain("bc-grid-skeleton-shimmer")
  })

  test("explicit shimmer variant", () => {
    const html = renderToStaticMarkup(
      <BcGrid<Row>
        ariaLabel="Customers"
        columns={columns}
        data={data}
        expectedRowCount={3}
        serverLoadingSkeleton="shimmer"
        height={400}
        rowId={(row) => row.id}
      />,
    )
    expect(html).toContain('data-bc-grid-skeleton-variant="shimmer"')
    expect(html).toContain("bc-grid-skeleton-shimmer")
  })

  test("skeleton rows carry aria-busy='true' for AT", () => {
    const html = renderToStaticMarkup(
      <BcGrid<Row>
        ariaLabel="Customers"
        columns={columns}
        data={data}
        expectedRowCount={3}
        height={400}
        rowId={(row) => row.id}
      />,
    )
    expect(html).toMatch(
      /data-bc-grid-row-kind="skeleton"[^>]*aria-busy="true"|aria-busy="true"[^>]*data-bc-grid-row-kind="skeleton"/,
    )
  })

  test("skeleton row IDs are stable + non-colliding with data rows", () => {
    const html = renderToStaticMarkup(
      <BcGrid<Row>
        ariaLabel="Customers"
        columns={columns}
        data={data}
        expectedRowCount={4}
        height={400}
        rowId={(row) => row.id}
      />,
    )
    // Synthetic IDs follow `__bc-grid-skeleton-${index}` pattern;
    // pin so consumers reading data-row-id off skeleton rows can
    // distinguish them from real rows.
    expect(html).toContain('data-row-id="__bc-grid-skeleton-2"')
    expect(html).toContain('data-row-id="__bc-grid-skeleton-3"')
  })
})
