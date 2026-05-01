import { describe, expect, test } from "bun:test"
import type { ServerPagedQuery, ServerRowPatch } from "@bc-grid/react"
import { customerRows } from "../src/examples"
import {
  buildCustomerServerFilter,
  commitCustomerMutation,
  createServerCustomerRows,
  queryServerCustomers,
  shouldInvalidateCustomerViewAfterMutation,
} from "../src/serverEditExampleData"

type ServerViewState = ServerPagedQuery["view"]

function pageQuery(overrides: Partial<ServerPagedQuery> = {}): ServerPagedQuery {
  return {
    mode: "paged",
    pageIndex: 0,
    pageSize: 10,
    requestId: "request-1",
    view: {
      groupBy: [],
      sort: [],
      visibleColumns: ["account", "legalName", "status"],
    },
    ...overrides,
  }
}

function firstRow(rows: ReturnType<typeof createServerCustomerRows>) {
  const row = rows[0]
  if (!row) throw new Error("expected a seeded customer row")
  return row
}

describe("server edit example helpers", () => {
  test("applies controlled search, filter, sort, and page shape", () => {
    const rows = createServerCustomerRows(customerRows, 40)
    const filter = buildCustomerServerFilter({ region: "West", status: "all" })
    const view: ServerViewState = {
      groupBy: [],
      search: "customer",
      sort: [{ columnId: "creditLimit", direction: "desc" }],
      visibleColumns: ["account", "legalName", "creditLimit"],
      ...(filter ? { filter } : {}),
    }
    const result = queryServerCustomers(
      rows,
      pageQuery({
        pageIndex: 0,
        pageSize: 5,
        view,
      }),
    )

    expect(result.rows).toHaveLength(Math.min(5, result.totalRows))
    expect(result.rows.every((row) => row.region === "West")).toBe(true)
    expect(result.rows.map((row) => row.creditLimit)).toEqual(
      [...result.rows].map((row) => row.creditLimit).sort((left, right) => right - left),
    )
  })

  test("accepted mutations update the canonical row and revision", () => {
    const rows = createServerCustomerRows(customerRows, 2)
    const first = firstRow(rows)
    const patch: ServerRowPatch = {
      changes: { creditLimit: first.creditLimit + 1000 },
      mutationId: "mutation-1",
      rowId: first.id,
    }
    const commit = commitCustomerMutation(rows, patch, "accept")

    expect(commit.result.status).toBe("accepted")
    expect(commit.rows[0]?.creditLimit).toBe(first.creditLimit + 1000)
    expect(commit.rows[0]?.revision).not.toBe(first.revision)
  })

  test("rejected mutations leave canonical rows untouched", () => {
    const rows = createServerCustomerRows(customerRows, 2)
    const first = firstRow(rows)
    const patch: ServerRowPatch = {
      changes: { tradingName: "Rejected Trading" },
      mutationId: "mutation-2",
      rowId: first.id,
    }
    const commit = commitCustomerMutation(rows, patch, "reject")

    expect(commit.result.status).toBe("rejected")
    expect(commit.rows[0]).toEqual(first)
  })

  test("conflict mutations return a canonical server row", () => {
    const rows = createServerCustomerRows(customerRows, 2)
    const first = firstRow(rows)
    const patch: ServerRowPatch = {
      changes: { status: "Credit Hold" },
      mutationId: "mutation-3",
      rowId: first.id,
    }
    const commit = commitCustomerMutation(rows, patch, "conflict")

    expect(commit.result.status).toBe("conflict")
    expect(commit.result.row?.id).toBe(first.id)
    expect(commit.rows[0]?.status).toBe(commit.result.row?.status)
  })

  test("invalidates the view when a mutation touches active sort, filter, or search fields", () => {
    const filter = buildCustomerServerFilter({ region: "all", status: "Open" })
    expect(
      shouldInvalidateCustomerViewAfterMutation({
        filter,
        patch: {
          changes: { status: "Credit Hold" },
          mutationId: "mutation-4",
          rowId: "AR-00001",
        },
        searchText: "",
        sort: [],
      }),
    ).toBe(true)

    expect(
      shouldInvalidateCustomerViewAfterMutation({
        filter: null,
        patch: {
          changes: { creditLimit: 120000 },
          mutationId: "mutation-5",
          rowId: "AR-00001",
        },
        searchText: "",
        sort: [{ columnId: "creditLimit", direction: "asc" }],
      }),
    ).toBe(true)
  })
})
