import { describe, expect, test } from "bun:test"
import type { ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  BcDetailPanelSlot,
  DETAIL_TOGGLE_COLUMN_ID,
  createDetailToggleColumn,
  detailPanelDomId,
  detailPanelLabel,
  detailPanelStyle,
  detailRowHeight,
  normalizeDetailPanelHeight,
  resolveDetailPanelHeight,
  stopDetailToggleGridKeyboardNav,
  toggleDetailExpansion,
} from "../src/detailColumn"

type RowId = string

interface Row {
  id: RowId
  name: string
}

const rows: readonly Row[] = [
  { id: "cust-1", name: "Acme" },
  { id: "cust-2", name: "Globex" },
]

describe("master detail helpers", () => {
  test("toggles expansion immutably", () => {
    const initial = new Set<RowId>(["cust-1"])
    const collapsed = toggleDetailExpansion(initial, "cust-1")
    const expanded = toggleDetailExpansion(collapsed, "cust-2")

    expect([...initial]).toEqual(["cust-1"])
    expect([...collapsed]).toEqual([])
    expect([...expanded]).toEqual(["cust-2"])
  })

  test("uses stable detail panel ids and labels from row identity", () => {
    expect(detailPanelDomId("bc-grid-customers", "customer:42")).toBe(
      "bc-grid-customers-detail-panel-customer_42",
    )
    expect(detailPanelLabel("customer:42")).toBe("Details for row customer:42")
  })

  test("detail toggle button exposes relationships and keeps grid key handling sane", () => {
    const updates: ReadonlySet<RowId>[] = []
    const column = createDetailToggleColumn<Row>({
      domBaseId: "bc-grid-customers",
      expansionState: new Set<RowId>(["cust-1"]),
      setExpansionState: (next) => updates.push(next),
    })

    const rendered = column.cellRenderer?.({
      column,
      editing: false,
      formattedValue: "",
      isDirty: false,
      pending: false,
      row: rows[0],
      rowId: "cust-1",
      rowState: { rowId: "cust-1", index: 0, expanded: true },
      searchText: "",
      value: undefined,
    } as never) as ReactElement<Record<string, unknown>>

    expect(column.columnId).toBe(DETAIL_TOGGLE_COLUMN_ID)
    expect(rendered.props["aria-controls"]).toBe("bc-grid-customers-detail-panel-cust-1")
    expect(rendered.props["aria-expanded"]).toBe(true)
    expect(rendered.props["aria-label"]).toBe("Collapse details for row cust-1")

    let clickStopped = false
    const onClick = rendered.props.onClick as (event: { stopPropagation: () => void }) => void
    onClick({
      stopPropagation: () => {
        clickStopped = true
      },
    })

    expect(clickStopped).toBe(true)
    expect([...updates[0]]).toEqual([])

    let enterStopped = false
    stopDetailToggleGridKeyboardNav({
      key: "Enter",
      stopPropagation: () => {
        enterStopped = true
      },
    })
    expect(enterStopped).toBe(true)

    let spaceStopped = false
    stopDetailToggleGridKeyboardNav({
      key: " ",
      stopPropagation: () => {
        spaceStopped = true
      },
    })
    expect(spaceStopped).toBe(true)

    let arrowStopped = false
    stopDetailToggleGridKeyboardNav({
      key: "ArrowDown",
      stopPropagation: () => {
        arrowStopped = true
      },
    })
    expect(arrowStopped).toBe(false)
  })

  test("normalizes detail heights and keeps style free of text-scaling motion", () => {
    const entry = { index: 3, kind: "data", row: rows[0], rowId: "cust-1" } as const

    expect(normalizeDetailPanelHeight(-12)).toBe(0)
    expect(normalizeDetailPanelHeight(Number.NaN)).toBe(0)
    expect(normalizeDetailPanelHeight(Number.POSITIVE_INFINITY)).toBe(0)
    expect(normalizeDetailPanelHeight(188)).toBe(188)
    expect(
      resolveDetailPanelHeight({
        defaultHeight: 144,
        detailPanelHeight: ({ row }) => (row.id === "cust-1" ? -20 : 200),
        entry,
        hasDetail: true,
      }),
    ).toBe(0)
    expect(
      resolveDetailPanelHeight({
        defaultHeight: 144,
        detailPanelHeight: undefined,
        entry,
        hasDetail: true,
      }),
    ).toBe(144)
    expect(
      resolveDetailPanelHeight({
        defaultHeight: 144,
        detailPanelHeight: Number.NaN,
        entry,
        hasDetail: true,
      }),
    ).toBe(0)
    expect(detailRowHeight(36, -10)).toBe(36)
    expect(detailRowHeight(Number.NaN, 144)).toBe(144)
    expect(detailRowHeight(36, 144)).toBe(180)

    const style = detailPanelStyle(Number.NaN, Number.POSITIVE_INFINITY, Number.NaN)
    expect(style).toMatchObject({ height: 0, top: 0, width: 1 })
    expect(style).not.toHaveProperty("transform")
    expect(style).not.toHaveProperty("transition")
  })
})

describe("master detail panel slot", () => {
  test("renders expanded detail as a labelled region inside a full-width gridcell", () => {
    const html = renderToStaticMarkup(
      <BcDetailPanelSlot<Row>
        colSpan={2}
        domBaseId="bc-grid-master-detail-test"
        height={120}
        renderDetailPanel={({ row }) => <section>Contacts for {row.name}</section>}
        row={rows[0]}
        rowId="cust-1"
        rowIndex={0}
        top={36}
        width={640}
      />,
    )

    expect(html).toContain('id="bc-grid-master-detail-test-detail-panel-cust-1"')
    expect(html).toContain("<section")
    expect(html).toContain('aria-label="Details for row cust-1"')
    expect(html).toContain('role="gridcell"')
    expect(html).toContain('aria-colspan="2"')
    expect(html).toContain("Contacts for Acme")
  })

  test("does not emit text-scaling / height-morph styles on the detail panel slot", () => {
    // Regression net for the master/detail motion contract: the panel
    // wrapper sets only `height` / `top` / `width` / layout props as
    // inline styles; never `transform` (would risk text scaling on
    // rotation / zoom), never `transition` (would risk a height-morph
    // motion). Both properties are confirmed absent from
    // `detailPanelStyle()` above; this guards the rendered markup too.
    const html = renderToStaticMarkup(
      <BcDetailPanelSlot<Row>
        colSpan={1}
        domBaseId="bc-grid-master-detail-test"
        height={120}
        renderDetailPanel={({ row }) => <span>{row.name}</span>}
        row={rows[0]}
        rowId="cust-1"
        rowIndex={0}
        top={36}
        width={320}
      />,
    )
    expect(html).not.toMatch(/style="[^"]*transform/)
    expect(html).not.toMatch(/style="[^"]*transition/)
    expect(html).not.toMatch(/style="[^"]*scale\(/)
    expect(html).not.toMatch(/style="[^"]*max-height/)
    expect(html).not.toMatch(/style="[^"]*animation/)
  })
})

describe("master detail toggle disclosure affordance", () => {
  // Brief: "Replace crude text chevrons with a compact disclosure
  // affordance using existing internal icon/primitives style; keep it
  // accessible with correct labels and aria-expanded."

  function renderDetailToggle(expanded: boolean): string {
    const column = createDetailToggleColumn<Row>({
      domBaseId: "bc-grid-customers",
      expansionState: expanded ? new Set<RowId>(["cust-1"]) : new Set<RowId>(),
      setExpansionState: () => {},
    })
    return renderToStaticMarkup(
      column.cellRenderer?.({
        column,
        editing: false,
        formattedValue: "",
        isDirty: false,
        pending: false,
        row: rows[0],
        rowId: "cust-1",
        rowState: { rowId: "cust-1", index: 0, expanded },
        searchText: "",
        value: undefined,
      } as never) as ReactElement<Record<string, unknown>>,
    )
  }

  test("renders a vector chevron (SVG), never a `&gt;` text glyph", () => {
    // The pre-cleanup affordance was a literal `&gt;` text node that
    // got rotated via CSS transform — exactly the "rotate text glyph"
    // anti-pattern the brief calls out. Pin the SVG markup so the
    // anti-pattern can't sneak back.
    const closed = renderDetailToggle(false)
    const open = renderDetailToggle(true)

    // SVG present, with the disclosure chevron path.
    expect(closed).toContain("<svg")
    expect(closed).toMatch(/aria-hidden="true"[^>]*class="bc-grid-detail-toggle-icon"/)
    expect(closed).toContain('viewBox="0 0 12 12"')
    // No `&gt;` text content that could be rotated as a glyph.
    expect(closed).not.toContain(">&gt;<")
    expect(open).not.toContain(">&gt;<")
  })

  test("aria-expanded toggles with the expansion state and labels match the action", () => {
    const closed = renderDetailToggle(false)
    const open = renderDetailToggle(true)

    expect(closed).toMatch(/aria-expanded="false"/)
    expect(open).toMatch(/aria-expanded="true"/)
    expect(closed).toContain('aria-label="Expand details for row cust-1"')
    expect(open).toContain('aria-label="Collapse details for row cust-1"')
  })

  test("button keeps `aria-controls` linkage to the matching detail panel id", () => {
    const html = renderDetailToggle(false)
    expect(html).toContain('aria-controls="bc-grid-customers-detail-panel-cust-1"')
  })

  test("rendered toggle uses the shared bc-grid-detail-toggle class hooks (CSS surface)", () => {
    // Pin the surface CSS hooks so the theming-test invariants
    // (`transition` only on `transform`, no scale, no max-height)
    // continue to apply on every theme override.
    const html = renderDetailToggle(false)
    expect(html).toContain('class="bc-grid-detail-toggle"')
    expect(html).toMatch(/class="bc-grid-detail-toggle-icon"/)
  })
})
