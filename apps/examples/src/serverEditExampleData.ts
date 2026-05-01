import type {
  BcGridFilter,
  BcGridSort,
  ColumnId,
  ServerMutationResult,
  ServerPagedQuery,
  ServerPagedResult,
  ServerRowPatch,
} from "@bc-grid/react"
import type { CustomerRow, CustomerStatus } from "./examples"

export type ServerEditOutcome = "accept" | "reject" | "conflict"

export interface ServerCustomerRow extends CustomerRow {
  revision: string
  serverUpdatedAt: string
}

export interface CustomerQuerySnapshot {
  requestId: string
  page: number
  pageSize: number
  totalRows: number
  search: string
  sort: string
  filter: string
  visibleColumns: readonly ColumnId[]
  returnedAccounts: readonly string[]
}

export interface CustomerMutationCommit {
  result: ServerMutationResult<ServerCustomerRow>
  rows: readonly ServerCustomerRow[]
}

type ServerColumnFilter = Extract<BcGridFilter, { kind: "column" }>

const searchableColumns = [
  "account",
  "legalName",
  "tradingName",
  "region",
  "owner",
  "status",
] as const satisfies readonly (keyof ServerCustomerRow)[]

const customerStatuses = ["Open", "Credit Hold", "Past Due", "Disputed"] as const
const customerRegions = ["Northeast", "Midwest", "South", "West", "International"] as const
const customerTerms = ["Net 15", "Net 30", "Net 45", "Net 60"] as const

export function createServerCustomerRows(
  rows: readonly CustomerRow[],
  count = 160,
): ServerCustomerRow[] {
  return rows.slice(0, count).map((row, index) => ({
    ...row,
    revision: `rev-${String(index + 1).padStart(4, "0")}-1`,
    serverUpdatedAt: fixedServerTimestamp(index, 1),
  }))
}

export function buildCustomerServerFilter(params: {
  region: CustomerRow["region"] | "all"
  status: CustomerStatus | "all"
}): BcGridFilter | null {
  const filters: ServerColumnFilter[] = []
  if (params.region !== "all") {
    filters.push({
      columnId: "region",
      kind: "column",
      op: "in",
      type: "set",
      values: [params.region],
    })
  }
  if (params.status !== "all") {
    filters.push({
      columnId: "status",
      kind: "column",
      op: "in",
      type: "set",
      values: [params.status],
    })
  }
  if (filters.length === 0) return null
  if (filters.length === 1) return filters[0] ?? null
  return { filters, kind: "group", op: "and" }
}

export function queryServerCustomers(
  rows: readonly ServerCustomerRow[],
  query: ServerPagedQuery,
): ServerPagedResult<ServerCustomerRow> {
  const searched = query.view.search
    ? rows.filter((row) => rowMatchesSearch(row, query.view.search ?? ""))
    : rows
  const filtered = query.view.filter
    ? searched.filter((row) => rowMatchesFilter(row, query.view.filter as BcGridFilter))
    : searched
  const sorted = sortServerCustomerRows(filtered, query.view.sort)
  const pageSize = Math.max(1, Math.floor(query.pageSize))
  const pageIndex = Math.max(0, Math.floor(query.pageIndex))
  const start = pageIndex * pageSize

  return {
    pageIndex,
    pageSize,
    revision: serverRevisionForRows(rows),
    rows: sorted.slice(start, start + pageSize),
    totalRows: sorted.length,
    ...(query.viewKey ? { viewKey: query.viewKey } : {}),
  }
}

export function summarizeCustomerQuery(
  query: ServerPagedQuery,
  result: ServerPagedResult<ServerCustomerRow>,
): CustomerQuerySnapshot {
  return {
    filter: describeServerFilter(query.view.filter as BcGridFilter | undefined),
    page: query.pageIndex,
    pageSize: query.pageSize,
    requestId: query.requestId,
    returnedAccounts: result.rows.map((row) => row.account),
    search: query.view.search ?? "",
    sort: describeServerSort(query.view.sort),
    totalRows: result.totalRows,
    visibleColumns: query.view.visibleColumns,
  }
}

export function commitCustomerMutation(
  rows: readonly ServerCustomerRow[],
  patch: ServerRowPatch,
  outcome: ServerEditOutcome,
): CustomerMutationCommit {
  const index = rows.findIndex((row) => row.id === patch.rowId)
  if (index === -1) {
    return {
      result: {
        mutationId: patch.mutationId,
        reason: "Customer was not found on the server.",
        status: "rejected",
      },
      rows,
    }
  }

  const current = rows[index] as ServerCustomerRow
  const validationError = validateCustomerPatch(patch)
  if (validationError) {
    return {
      result: {
        mutationId: patch.mutationId,
        reason: validationError,
        status: "rejected",
      },
      rows,
    }
  }

  if (outcome === "reject") {
    return {
      result: {
        mutationId: patch.mutationId,
        reason: "Server validation rejected this save.",
        status: "rejected",
      },
      rows,
    }
  }

  if (outcome === "conflict") {
    const row = createConflictRow(current, patch)
    return {
      result: {
        mutationId: patch.mutationId,
        reason: "Customer changed on the server before this save completed.",
        row,
        rowId: row.id,
        revision: row.revision,
        status: "conflict",
      },
      rows: replaceRow(rows, index, row),
    }
  }

  const row = applyCustomerPatch(current, patch)
  return {
    result: {
      mutationId: patch.mutationId,
      row,
      rowId: row.id,
      revision: row.revision,
      status: "accepted",
    },
    rows: replaceRow(rows, index, row),
  }
}

export function summarizeServerCustomers(rows: readonly ServerCustomerRow[]) {
  return rows.reduce(
    (summary, row) => {
      summary.creditHolds += row.status === "Credit Hold" ? 1 : 0
      summary.highRisk += row.riskScore >= 70 ? 1 : 0
      summary.totalCredit += row.creditLimit
      summary.totalOutstanding += row.balance
      return summary
    },
    { creditHolds: 0, highRisk: 0, totalCredit: 0, totalOutstanding: 0 },
  )
}

export function shouldInvalidateCustomerViewAfterMutation(params: {
  filter: BcGridFilter | null
  patch: ServerRowPatch
  searchText: string
  sort: readonly BcGridSort[]
}): boolean {
  const changedColumns = new Set(Object.keys(params.patch.changes))
  if (params.sort.some((entry) => changedColumns.has(entry.columnId))) return true
  if (params.filter && filterTouchesChangedColumn(params.filter, changedColumns)) return true
  return (
    params.searchText.trim().length > 0 &&
    searchableColumns.some((columnId) => changedColumns.has(columnId))
  )
}

function validateCustomerPatch(patch: ServerRowPatch): string | null {
  const changes = patch.changes
  if ("tradingName" in changes) {
    const value = changes.tradingName
    if (typeof value !== "string" || value.trim().length === 0) {
      return "Trading name is required."
    }
  }
  if ("owner" in changes) {
    const value = changes.owner
    if (typeof value !== "string" || value.trim().length === 0) {
      return "Collector is required."
    }
  }
  if ("creditLimit" in changes) {
    const value = changes.creditLimit
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return "Credit limit must be a non-negative number."
    }
  }
  if ("status" in changes && !isCustomerStatus(changes.status)) {
    return "Status is not valid for customers."
  }
  if ("region" in changes && !isCustomerRegion(changes.region)) {
    return "Region is not valid for customers."
  }
  if ("terms" in changes && !isCustomerTerms(changes.terms)) {
    return "Terms are not valid for customers."
  }
  return null
}

function applyCustomerPatch(row: ServerCustomerRow, patch: ServerRowPatch): ServerCustomerRow {
  const next = applyCustomerChanges(row, patch.changes)
  const version = nextRevisionNumber(row.revision)
  return {
    ...next,
    revision: bumpRevision(row.revision),
    serverUpdatedAt: fixedServerTimestamp(rowSequence(row), version),
  }
}

function createConflictRow(row: ServerCustomerRow, patch: ServerRowPatch): ServerCustomerRow {
  const changes: Record<ColumnId, unknown> = {}
  for (const columnId of Object.keys(patch.changes)) {
    changes[columnId] = conflictValueForColumn(row, columnId)
  }
  const next = applyCustomerChanges(row, changes)
  const version = nextRevisionNumber(row.revision)
  return {
    ...next,
    revision: bumpRevision(row.revision),
    serverUpdatedAt: fixedServerTimestamp(rowSequence(row), version),
  }
}

function applyCustomerChanges(
  row: ServerCustomerRow,
  changes: Record<ColumnId, unknown>,
): ServerCustomerRow {
  const next = { ...row }
  if (typeof changes.tradingName === "string") next.tradingName = changes.tradingName.trim()
  if (typeof changes.owner === "string") next.owner = changes.owner.trim()
  if (isCustomerRegion(changes.region)) next.region = changes.region
  if (isCustomerTerms(changes.terms)) next.terms = changes.terms
  if (typeof changes.creditLimit === "number" && Number.isFinite(changes.creditLimit)) {
    next.creditLimit = Math.max(0, Math.round(changes.creditLimit))
  }
  if (isCustomerStatus(changes.status)) next.status = changes.status
  if (typeof changes.nextScheduledCall === "string")
    next.nextScheduledCall = changes.nextScheduledCall
  return next
}

function conflictValueForColumn(row: ServerCustomerRow, columnId: ColumnId): unknown {
  if (columnId === "tradingName") return `${row.tradingName} Server`
  if (columnId === "owner") return "Maya Singh"
  if (columnId === "region") return row.region === "West" ? "Northeast" : "West"
  if (columnId === "terms") return row.terms === "Net 30" ? "Net 45" : "Net 30"
  if (columnId === "creditLimit") return row.creditLimit + 2500
  if (columnId === "status") return row.status === "Disputed" ? "Open" : "Disputed"
  if (columnId === "nextScheduledCall") return row.nextScheduledCall
  return serverCustomerValue(row, columnId)
}

function replaceRow(
  rows: readonly ServerCustomerRow[],
  index: number,
  row: ServerCustomerRow,
): ServerCustomerRow[] {
  const next = [...rows]
  next[index] = row
  return next
}

function rowMatchesSearch(row: ServerCustomerRow, search: string): boolean {
  const needle = search.trim().toLowerCase()
  if (!needle) return true
  return searchableColumns.some((columnId) =>
    String(serverCustomerValue(row, columnId)).toLowerCase().includes(needle),
  )
}

function rowMatchesFilter(row: ServerCustomerRow, filter: BcGridFilter): boolean {
  if (filter.kind === "group") {
    return filter.op === "and"
      ? filter.filters.every((child) => rowMatchesFilter(row, child as BcGridFilter))
      : filter.filters.some((child) => rowMatchesFilter(row, child as BcGridFilter))
  }

  const value = serverCustomerValue(row, filter.columnId)
  if (filter.type === "set") return matchesSetFilter(value, filter)
  if (filter.type === "boolean") return Boolean(value) === Boolean(filter.value)
  if (filter.type === "number" || filter.type === "number-range") {
    return matchesNumberFilter(value, filter)
  }
  if (filter.type === "date" || filter.type === "date-range")
    return matchesDateFilter(value, filter)
  return matchesTextFilter(value, filter)
}

function matchesTextFilter(value: unknown, filter: ServerColumnFilter): boolean {
  const needleRaw = String(filter.value ?? "")
  if (!needleRaw) return true
  const haystack = String(value ?? "").toLowerCase()
  const needle = needleRaw.toLowerCase()
  if (filter.op === "equals") return haystack === needle
  if (filter.op === "starts-with") return haystack.startsWith(needle)
  if (filter.op === "ends-with") return haystack.endsWith(needle)
  return haystack.includes(needle)
}

function matchesSetFilter(value: unknown, filter: ServerColumnFilter): boolean {
  const values = filter.values ?? (filter.value == null ? [] : [filter.value])
  const valueKey = String(value ?? "")
  const matched = values.some((entry) => String(entry ?? "") === valueKey)
  return filter.op === "not-in" ? !matched : matched
}

function matchesNumberFilter(value: unknown, filter: ServerColumnFilter): boolean {
  const current = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(current)) return false
  const target = Number(filter.value)
  if (filter.op === "between") {
    const values = (filter.values ?? []).map(Number)
    const min = values[0]
    const max = values[1]
    if (min == null || max == null) return false
    return Number.isFinite(min) && Number.isFinite(max) && current >= min && current <= max
  }
  if (!Number.isFinite(target)) return false
  if (filter.op === "gt") return current > target
  if (filter.op === "gte") return current >= target
  if (filter.op === "lt") return current < target
  if (filter.op === "lte") return current <= target
  if (filter.op === "not-equals") return current !== target
  return current === target
}

function matchesDateFilter(value: unknown, filter: ServerColumnFilter): boolean {
  const current = Date.parse(String(value ?? ""))
  if (!Number.isFinite(current)) return false
  if (filter.op === "between") {
    const values = filter.values ?? []
    const minRaw = values[0]
    const maxRaw = values[1]
    if (minRaw == null || maxRaw == null) return false
    const min = Date.parse(String(minRaw ?? ""))
    const max = Date.parse(String(maxRaw ?? ""))
    return Number.isFinite(min) && Number.isFinite(max) && current >= min && current <= max
  }
  const target = Date.parse(String(filter.value ?? ""))
  if (!Number.isFinite(target)) return false
  if (filter.op === "before") return current < target
  if (filter.op === "after") return current > target
  if (filter.op === "not-equals") return current !== target
  return current === target
}

function sortServerCustomerRows(
  rows: readonly ServerCustomerRow[],
  sort: readonly BcGridSort[],
): ServerCustomerRow[] {
  if (sort.length === 0) return [...rows]
  return rows
    .map((row, index) => ({ index, row }))
    .sort((left, right) => {
      for (const entry of sort) {
        const compared = compareServerValues(
          serverCustomerValue(left.row, entry.columnId),
          serverCustomerValue(right.row, entry.columnId),
        )
        if (compared !== 0) return entry.direction === "desc" ? -compared : compared
      }
      return left.index - right.index
    })
    .map((entry) => entry.row)
}

function compareServerValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") return left - right
  return String(left ?? "").localeCompare(String(right ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  })
}

function serverCustomerValue(row: ServerCustomerRow, columnId: ColumnId): unknown {
  return (row as unknown as Record<ColumnId, unknown>)[columnId]
}

function describeServerSort(sort: readonly BcGridSort[]): string {
  if (sort.length === 0) return "none"
  return sort.map((entry) => `${entry.columnId}:${entry.direction}`).join(", ")
}

function describeServerFilter(filter: BcGridFilter | undefined): string {
  if (!filter) return "none"
  if (filter.kind === "group")
    return filter.filters.map((child) => describeServerFilter(child)).join(" and ")
  if (filter.type === "set") {
    return `${filter.columnId} in ${(filter.values ?? []).map(String).join("|")}`
  }
  return `${filter.columnId} ${filter.op} ${String(filter.value ?? "")}`
}

function filterTouchesChangedColumn(
  filter: BcGridFilter,
  changedColumns: ReadonlySet<string>,
): boolean {
  if (filter.kind === "column") return changedColumns.has(filter.columnId)
  return filter.filters.some((child) =>
    filterTouchesChangedColumn(child as BcGridFilter, changedColumns),
  )
}

function serverRevisionForRows(rows: readonly ServerCustomerRow[]): string {
  return rows.reduce((latest, row) => (row.revision > latest ? row.revision : latest), "rev-0000-0")
}

function bumpRevision(revision: string): string {
  const match = /^rev-(\d+)-(\d+)$/.exec(revision)
  if (!match) return `${revision}-next`
  return `rev-${match[1]}-${Number(match[2]) + 1}`
}

function nextRevisionNumber(revision: string): number {
  const match = /^rev-\d+-(\d+)$/.exec(revision)
  return match ? Number(match[1]) + 1 : 2
}

function rowSequence(row: ServerCustomerRow): number {
  const match = /(\d+)$/.exec(row.id)
  return match ? Number(match[1]) : 1
}

function fixedServerTimestamp(rowIndex: number, revision: number): string {
  const day = (rowIndex % 28) + 1
  const hour = 9 + (revision % 8)
  return `2026-05-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00Z`
}

function isCustomerStatus(value: unknown): value is CustomerStatus {
  return customerStatuses.includes(value as CustomerStatus)
}

function isCustomerRegion(value: unknown): value is CustomerRow["region"] {
  return customerRegions.includes(value as CustomerRow["region"])
}

function isCustomerTerms(value: unknown): value is CustomerRow["terms"] {
  return customerTerms.includes(value as CustomerRow["terms"])
}
