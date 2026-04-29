import { describe, expect, test } from "bun:test"
import type { BcGridColumn } from "@bc-grid/core"
import { toCsv, toExcel, toPdf } from "../src"

interface InvoiceRow {
  id: string
  customer: string
  note?: string
  amount: number
  taxRate: number
  internalCode?: string
}

const rows: InvoiceRow[] = [
  {
    id: "inv-1",
    customer: "Acme, Inc",
    note: "Line\nbreak",
    amount: 1234.5,
    taxRate: 0.1,
    internalCode: ' A"1 ',
  },
  {
    id: "inv-2",
    customer: "Globex",
    amount: 50,
    taxRate: 0,
    internalCode: "B2",
  },
]

describe("@bc-grid/export toCsv", () => {
  test("serializes field columns with headers and CSV escaping", () => {
    const columns: BcGridColumn<InvoiceRow>[] = [
      { columnId: "customer", header: "Customer", field: "customer" },
      { columnId: "note", header: "Note", field: "note" },
      { columnId: "internalCode", header: "Internal Code", field: "internalCode" },
    ]

    expect(toCsv(rows, columns)).toBe(
      'Customer,Note,Internal Code\n"Acme, Inc","Line\nbreak"," A""1 "\nGlobex,,B2',
    )
  })

  test("excludes hidden columns unless requested", () => {
    const columns: BcGridColumn<InvoiceRow>[] = [
      { columnId: "customer", header: "Customer", field: "customer" },
      { columnId: "internalCode", header: "Internal Code", field: "internalCode", hidden: true },
    ]

    expect(toCsv(rows.slice(0, 1), columns)).toBe('Customer\n"Acme, Inc"')
    expect(toCsv(rows.slice(0, 1), columns, { includeHiddenColumns: true })).toBe(
      'Customer,Internal Code\n"Acme, Inc"," A""1 "',
    )
  })

  test("uses value getters, value formatters, and preset formats", () => {
    const columns: BcGridColumn<InvoiceRow>[] = [
      {
        columnId: "amount",
        header: "Amount",
        field: "amount",
        format: { type: "number", precision: 2, thousands: false },
      },
      {
        columnId: "tax",
        header: "Tax",
        valueGetter: (row) => row.amount * row.taxRate,
        valueFormatter: (value) => `tax:${Number(value).toFixed(2)}`,
      },
      {
        columnId: "paid",
        header: "Paid",
        valueGetter: (row) => row.taxRate > 0,
        format: "boolean",
      },
    ]

    expect(toCsv(rows, columns, { locale: "en-US" })).toBe(
      "Amount,Tax,Paid\n1234.50,tax:123.45,Yes\n50.00,tax:0.00,No",
    )
  })

  test("supports headerless output, custom delimiters, CRLF, and BOM", () => {
    const columns: BcGridColumn<InvoiceRow>[] = [
      { columnId: "customer", header: "Customer", field: "customer" },
      { columnId: "amount", header: "Amount", field: "amount" },
    ]

    expect(
      toCsv(rows.slice(0, 1), columns, {
        includeHeaders: false,
        delimiter: ";",
        lineEnding: "\r\n",
        bom: true,
      }),
    ).toBe("\uFEFFAcme, Inc;1234.5")
  })

  test("rejects an empty delimiter", () => {
    expect(() => toCsv(rows, [], { delimiter: "" })).toThrow(
      "@bc-grid/export.toCsv requires a non-empty delimiter",
    )
  })
})

describe("@bc-grid/export reserved serializers", () => {
  test("keeps XLSX and PDF exports reserved for follow-up tasks", () => {
    expect(() => toExcel()).toThrow(
      "@bc-grid/export.toExcel is reserved for export-xlsx-impl and is not implemented yet",
    )
    expect(() => toPdf()).toThrow(
      "@bc-grid/export.toPdf is reserved for export-pdf-impl and is not implemented yet",
    )
  })
})
