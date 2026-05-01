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

  test("clamps detail heights and keeps style free of text-scaling motion", () => {
    const entry = { index: 3, kind: "data", row: rows[0], rowId: "cust-1" } as const

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
    expect(detailRowHeight(36, -10)).toBe(36)
    expect(detailRowHeight(36, 144)).toBe(180)

    const style = detailPanelStyle(36, 144, 480)
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
})
