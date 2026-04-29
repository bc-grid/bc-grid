import { describe, expect, test } from "bun:test"
import { Buffer } from "node:buffer"
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
  test("keeps PDF export reserved for its follow-up task", () => {
    expect(() => toPdf()).toThrow(
      "@bc-grid/export.toPdf is reserved for export-pdf-impl and is not implemented yet",
    )
  })
})

describe("@bc-grid/export toExcel", () => {
  test("serializes an XLSX workbook with headers, typed cells, and format metadata", async () => {
    const columns: BcGridColumn<InvoiceRow>[] = [
      { columnId: "customer", header: "Customer", field: "customer" },
      {
        columnId: "amount",
        header: "Amount",
        field: "amount",
        format: { type: "number", precision: 2, thousands: true },
      },
      {
        columnId: "taxRate",
        header: "Tax Rate",
        field: "taxRate",
        format: { type: "percent", precision: 1 },
      },
      {
        columnId: "tax",
        header: "Tax",
        valueGetter: (row) => row.amount * row.taxRate,
        valueFormatter: (value) => `tax:${Number(value).toFixed(2)}`,
      },
    ]

    const result = await toExcel(rows.slice(0, 1), columns, {
      sheetName: "Invoices:?*[]",
    })
    const workbook = await loadWorkbook(result.content)
    const worksheet = workbook.getWorksheet("Invoices")

    expect(result.mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    expect(result.extension).toBe("xlsx")
    expect(worksheet?.getCell("A1").value).toBe("Customer")
    expect(worksheet?.getCell("A2").value).toBe("Acme, Inc")
    expect(worksheet?.getCell("B2").value).toBe(1234.5)
    expect(worksheet?.getCell("B2").numFmt).toBe("#,##0.00")
    expect(worksheet?.getCell("C2").value).toBe(0.1)
    expect(worksheet?.getCell("C2").numFmt).toBe("0.0%")
    expect(worksheet?.getCell("D2").value).toBe("tax:123.45")
    expect(worksheet?.views[0]?.state).toBe("frozen")
    expect(worksheet?.views[0]?.ySplit).toBe(1)
  })

  test("supports headerless output and hidden-column opt-in", async () => {
    const columns: BcGridColumn<InvoiceRow>[] = [
      { columnId: "customer", header: "Customer", field: "customer" },
      { columnId: "internalCode", header: "Internal Code", field: "internalCode", hidden: true },
    ]

    const result = await toExcel(rows.slice(0, 1), columns, {
      includeHeaders: false,
      includeHiddenColumns: true,
    })
    const workbook = await loadWorkbook(result.content)
    const worksheet = workbook.getWorksheet("bc-grid")

    expect(worksheet?.getCell("A1").value).toBe("Acme, Inc")
    expect(worksheet?.getCell("B1").value).toBe(' A"1 ')
  })
})

async function loadWorkbook(content: string | Uint8Array) {
  if (typeof content === "string") {
    throw new Error("Expected binary XLSX content")
  }

  const ExcelJS = await import("exceljs")
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(Buffer.from(content))
  return workbook
}
