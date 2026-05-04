import { describe, expect, test } from "bun:test"
import type {
  BcExportPlan,
  LoadServerPage,
  ServerPagedQuery,
  ServerPagedResult,
  ServerViewState,
} from "@bc-grid/core"
import { csvCell, csvRow, streamServerGridToCsv } from "../src/serverGridCsvExport"

describe("csvCell (worker1 v0.6 CSV export server-page-stream)", () => {
  test("plain string passes through unquoted", () => {
    expect(csvCell("Acme")).toBe("Acme")
  })

  test("comma triggers quoting", () => {
    expect(csvCell("Acme, Inc.")).toBe('"Acme, Inc."')
  })

  test("double-quote escaped + cell quoted (RFC 4180)", () => {
    expect(csvCell('Say "hi"')).toBe('"Say ""hi"""')
  })

  test("newline triggers quoting", () => {
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"')
  })

  test("carriage return triggers quoting", () => {
    expect(csvCell("line1\rline2")).toBe('"line1\rline2"')
  })

  test("empty string passes through unquoted", () => {
    expect(csvCell("")).toBe("")
  })
})

describe("csvRow", () => {
  test("joins cells with commas", () => {
    expect(csvRow(["a", "b", "c"])).toBe("a,b,c")
  })

  test("escapes individual cells per cell rules", () => {
    expect(csvRow(["Acme, Inc.", "active", "1234"])).toBe('"Acme, Inc.",active,1234')
  })

  test("empty row returns empty string", () => {
    expect(csvRow([])).toBe("")
  })

  test("single cell row has no trailing comma", () => {
    expect(csvRow(["only"])).toBe("only")
  })
})

interface Customer {
  id: string
  name: string
  status: string
  balance: number
}

const baseView: ServerViewState = {
  sort: [],
  groupBy: [],
  visibleColumns: ["id", "name", "status", "balance"],
}

const basePlan: BcExportPlan<Customer> = {
  view: baseView,
  visibleColumns: ["id", "name", "status", "balance"],
  columnHeaders: {
    id: "ID",
    name: "Name",
    status: "Status",
    balance: "Balance",
  },
  formatCellValue: (columnId, row) => String(row[columnId as keyof Customer]),
}

const sampleRows: readonly Customer[] = [
  { id: "1", name: "Acme, Inc.", status: "active", balance: 1234.56 },
  { id: "2", name: 'Say "hi"', status: "inactive", balance: 0 },
  { id: "3", name: "Bravo Co", status: "active", balance: 999 },
]

describe("streamServerGridToCsv", () => {
  test("emits header row first, then data rows in pages", async () => {
    const chunks: string[] = []
    const loadPage: LoadServerPage<Customer> = async (
      query: ServerPagedQuery,
    ): Promise<ServerPagedResult<Customer>> => {
      // 3 rows total; page size 2 → page 0 has 2 rows, page 1 has 1.
      const start = query.pageIndex * query.pageSize
      const rows = sampleRows.slice(start, start + query.pageSize) as Customer[]
      return {
        pageIndex: query.pageIndex,
        pageSize: query.pageSize,
        rows,
        totalRows: sampleRows.length,
      }
    }

    const result = await streamServerGridToCsv({
      plan: basePlan,
      loadPage,
      pageSize: 2,
      onChunk: (chunk) => chunks.push(chunk),
    })

    expect(result.totalRows).toBe(3)
    // First chunk is the header.
    expect(chunks[0]).toBe("ID,Name,Status,Balance\n")
    // Subsequent chunks are page-shaped data.
    const body = chunks.slice(1).join("")
    expect(body).toContain('1,"Acme, Inc.",active,1234.56')
    expect(body).toContain('2,"Say ""hi""",inactive,0')
    expect(body).toContain("3,Bravo Co,active,999")
  })

  test("stops when totalRows reached even if next page would have more", async () => {
    let pagesFired = 0
    const loadPage: LoadServerPage<Customer> = async (query) => {
      pagesFired += 1
      return {
        pageIndex: query.pageIndex,
        pageSize: query.pageSize,
        rows: sampleRows.slice(
          query.pageIndex * query.pageSize,
          query.pageIndex * query.pageSize + query.pageSize,
        ) as Customer[],
        totalRows: sampleRows.length, // 3
      }
    }

    const result = await streamServerGridToCsv({
      plan: basePlan,
      loadPage,
      pageSize: 100, // single page covers all 3 rows
      onChunk: () => undefined,
    })
    expect(result.totalRows).toBe(3)
    // 1 page fires: page 0 (data) → totalRowsSeen >= totalRows → stop.
    expect(pagesFired).toBe(1)
  })

  test("fires onProgress per page", async () => {
    const progress: { pageIndex: number; rowsLoaded: number; totalRows: number | undefined }[] = []
    const loadPage: LoadServerPage<Customer> = async (query) => ({
      pageIndex: query.pageIndex,
      pageSize: query.pageSize,
      rows: sampleRows.slice(
        query.pageIndex * query.pageSize,
        query.pageIndex * query.pageSize + query.pageSize,
      ) as Customer[],
      totalRows: sampleRows.length,
    })

    await streamServerGridToCsv({
      plan: basePlan,
      loadPage,
      pageSize: 2,
      onChunk: () => undefined,
      onProgress: (p) => progress.push({ ...p }),
    })

    expect(progress).toEqual([
      { pageIndex: 0, rowsLoaded: 2, totalRows: 3 },
      { pageIndex: 1, rowsLoaded: 3, totalRows: 3 },
    ])
  })

  test("zero-row export still emits header chunk", async () => {
    const chunks: string[] = []
    const loadPage: LoadServerPage<Customer> = async (query) => ({
      pageIndex: query.pageIndex,
      pageSize: query.pageSize,
      rows: [],
      totalRows: 0,
    })

    const result = await streamServerGridToCsv({
      plan: basePlan,
      loadPage,
      onChunk: (chunk) => chunks.push(chunk),
    })

    expect(result.totalRows).toBe(0)
    expect(chunks).toEqual(["ID,Name,Status,Balance\n"])
  })
})
