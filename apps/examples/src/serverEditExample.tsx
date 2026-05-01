import { numberEditor, selectEditor, textEditor } from "@bc-grid/editors"
import {
  type BcCellEditor,
  type BcGridColumn,
  type BcGridSort,
  type BcPaginationState,
  type BcServerEditMutationHandler,
  type BcServerEditPatchFactory,
  BcServerGrid,
  type BcServerGridApi,
  type LoadServerPage,
  type RowId,
} from "@bc-grid/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { type CustomerRow, type CustomerStatus, customerRows } from "./examples"
import {
  type CustomerQuerySnapshot,
  type ServerCustomerRow,
  type ServerEditOutcome,
  buildCustomerServerFilter,
  commitCustomerMutation,
  createServerCustomerRows,
  queryServerCustomers,
  shouldInvalidateCustomerViewAfterMutation,
  summarizeCustomerQuery,
  summarizeServerCustomers,
} from "./serverEditExampleData"

type ServerMutationNoticeStatus = "pending" | "saved" | "error" | "conflict"

interface ServerMutationNotice {
  account: string
  columnId: string
  columnLabel: string
  message: string
  mutationId: string
  rowId: RowId
  status: ServerMutationNoticeStatus
}

const serverEditOutcomeOptions = [
  { id: "accept", label: "Accept" },
  { id: "reject", label: "Reject" },
  { id: "conflict", label: "Conflict" },
] as const satisfies readonly { id: ServerEditOutcome; label: string }[]

const serverEditPageSizes = [10, 25, 50] as const

const serverEditRegions = [
  "all",
  "Northeast",
  "Midwest",
  "South",
  "West",
  "International",
] as const satisfies readonly (CustomerRow["region"] | "all")[]

const serverEditStatuses = [
  "all",
  "Open",
  "Credit Hold",
  "Past Due",
  "Disputed",
] as const satisfies readonly (CustomerStatus | "all")[]

const regionOptions = serverEditRegions
  .filter((region): region is CustomerRow["region"] => region !== "all")
  .map((region) => ({ label: region, value: region }))

const termsOptions = ["Net 15", "Net 30", "Net 45", "Net 60"].map((term) => ({
  label: term,
  value: term,
})) as readonly { label: CustomerRow["terms"]; value: CustomerRow["terms"] }[]

const statusOptions = serverEditStatuses
  .filter((status): status is CustomerStatus => status !== "all")
  .map((status) => ({ label: status, value: status }))

const statusLabels: Record<CustomerStatus, string> = {
  Open: "open",
  "Credit Hold": "hold",
  "Past Due": "past-due",
  Disputed: "disputed",
}

const currency = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency",
})

export function ServerEditGridExample() {
  const apiRef = useRef<BcServerGridApi<ServerCustomerRow> | null>(null)
  const sourceRowsRef = useRef(createServerCustomerRows(customerRows, 180))
  const mutationSequenceRef = useRef(0)
  const [datasetVersion, setDatasetVersion] = useState(0)
  const [searchText, setSearchText] = useState("")
  const [region, setRegion] = useState<CustomerRow["region"] | "all">("all")
  const [status, setStatus] = useState<CustomerStatus | "all">("all")
  const [sort, setSort] = useState<readonly BcGridSort[]>([
    { columnId: "legalName", direction: "asc" },
  ])
  const [pagination, setPagination] = useState<BcPaginationState>({ page: 0, pageSize: 25 })
  const [querySnapshot, setQuerySnapshot] = useState<CustomerQuerySnapshot | null>(null)
  const [mutationMode, setMutationMode] = useState<ServerEditOutcome>("accept")
  const [mutationNotices, setMutationNotices] = useState<readonly ServerMutationNotice[]>([])
  const [activeRowId, setActiveRowId] = useState<RowId>(() => sourceRowsRef.current[0]?.id ?? "")
  const [lastAction, setLastAction] = useState("Server cache ready")
  const [pendingInvalidation, setPendingInvalidation] = useState<
    Parameters<BcServerGridApi<ServerCustomerRow>["invalidateServerRows"]>[0] | null
  >(null)

  const filter = useMemo(() => buildCustomerServerFilter({ region, status }), [region, status])
  void datasetVersion
  const summary = summarizeServerCustomers(sourceRowsRef.current)
  const activeRow = sourceRowsRef.current.find((row) => row.id === activeRowId) ?? null
  const pendingCount = mutationNotices.filter((notice) => notice.status === "pending").length
  const pageCount = Math.max(
    1,
    Math.ceil((querySnapshot?.totalRows ?? 0) / Math.max(1, pagination.pageSize)),
  )

  const resetToFirstPage = useCallback(() => {
    setPagination((current) => (current.page === 0 ? current : { ...current, page: 0 }))
  }, [])

  useEffect(() => {
    setPagination((current) => {
      const maxPage = Math.max(0, pageCount - 1)
      return current.page <= maxPage ? current : { ...current, page: maxPage }
    })
  }, [pageCount])

  useEffect(() => {
    if (!pendingInvalidation) return
    apiRef.current?.invalidateServerRows(pendingInvalidation)
    setPendingInvalidation(null)
  }, [pendingInvalidation])

  const loadPage = useCallback<LoadServerPage<ServerCustomerRow>>(async (query, context) => {
    await waitForServerLatency(140, context.signal)
    const result = queryServerCustomers(sourceRowsRef.current, query)
    setQuerySnapshot(summarizeCustomerQuery(query, result))
    return result
  }, [])

  const columns = useMemo<readonly BcGridColumn<ServerCustomerRow>[]>(
    () => [
      {
        cellClassName: "customer-code-cell",
        columnId: "account",
        field: "account",
        filter: { type: "text" },
        format: "code",
        header: "Account",
        pinned: "left",
        width: 132,
      },
      {
        columnId: "legalName",
        field: "legalName",
        filter: { type: "text" },
        header: "Customer",
        rowHeader: true,
        width: 280,
      },
      {
        cellEditor: textEditor as unknown as BcCellEditor<ServerCustomerRow, unknown>,
        columnId: "tradingName",
        editable: true,
        field: "tradingName",
        filter: { type: "text" },
        header: "Trading Name",
        validate: (next) =>
          typeof next === "string" && next.trim()
            ? { valid: true }
            : { error: "Trading name is required.", valid: false },
        valueParser: (input) => input.trim(),
        width: 220,
      },
      {
        cellEditor: selectEditor as unknown as BcCellEditor<ServerCustomerRow, unknown>,
        columnId: "region",
        editable: true,
        field: "region",
        filter: { type: "set" },
        header: "Region",
        options: regionOptions,
        width: 150,
      },
      {
        cellEditor: textEditor as unknown as BcCellEditor<ServerCustomerRow, unknown>,
        columnId: "owner",
        editable: true,
        field: "owner",
        filter: { type: "text" },
        header: "Collector",
        validate: (next) =>
          typeof next === "string" && next.trim()
            ? { valid: true }
            : { error: "Collector is required.", valid: false },
        valueParser: (input) => input.trim(),
        width: 168,
      },
      {
        cellEditor: selectEditor as unknown as BcCellEditor<ServerCustomerRow, unknown>,
        columnId: "terms",
        editable: true,
        field: "terms",
        filter: { type: "set" },
        header: "Terms",
        options: termsOptions,
        width: 118,
      },
      {
        cellEditor: numberEditor as unknown as BcCellEditor<ServerCustomerRow, unknown>,
        columnId: "creditLimit",
        editable: true,
        field: "creditLimit",
        filter: { type: "number" },
        format: { currency: "USD", precision: 0, type: "currency" },
        header: "Credit Limit",
        align: "right",
        validate: (next) => {
          if (typeof next !== "number" || !Number.isFinite(next)) {
            return { error: "Credit limit must be a number.", valid: false }
          }
          if (next < 0) return { error: "Credit limit can't be negative.", valid: false }
          return { valid: true }
        },
        valueParser: (input) => {
          const parsed = Number.parseFloat(input.replace(/[\s,]/g, ""))
          return Number.isFinite(parsed) ? parsed : Number.NaN
        },
        width: 142,
      },
      {
        columnId: "balance",
        field: "balance",
        filter: { type: "number" },
        format: { currency: "USD", precision: 0, type: "currency" },
        header: "Outstanding",
        align: "right",
        width: 144,
      },
      {
        cellEditor: selectEditor as unknown as BcCellEditor<ServerCustomerRow, unknown>,
        cellRenderer(params) {
          return <ServerStatusBadge status={params.row.status} />
        },
        columnId: "status",
        editable: true,
        field: "status",
        filter: { type: "set" },
        header: "Status",
        options: statusOptions,
        width: 138,
      },
      {
        columnId: "revision",
        field: "revision",
        format: "code",
        header: "Revision",
        width: 128,
      },
      {
        columnId: "serverUpdatedAt",
        field: "serverUpdatedAt",
        header: "Server Updated",
        width: 178,
      },
    ],
    [],
  )

  const handleMutation = useCallback<BcServerEditMutationHandler<ServerCustomerRow>>(
    async ({ column, columnId, patch, row }) => {
      const columnLabel = typeof column.header === "string" ? column.header : columnId
      const pendingNotice: ServerMutationNotice = {
        account: row.account,
        columnId,
        columnLabel,
        message: "Saving",
        mutationId: patch.mutationId,
        rowId: patch.rowId,
        status: "pending",
      }
      setMutationNotices((current) => upsertMutationNotice(current, pendingNotice))
      setLastAction(`Saving ${row.account} ${columnLabel}`)

      await waitForServerLatency(650)

      const commit = commitCustomerMutation(sourceRowsRef.current, patch, mutationMode)
      if (commit.result.status !== "rejected") {
        sourceRowsRef.current = [...commit.rows]
        setDatasetVersion((version) => version + 1)
      }

      const nextStatus = noticeStatusForResult(commit.result.status)
      const nextNotice: ServerMutationNotice = {
        ...pendingNotice,
        message: commit.result.reason ?? noticeMessageForStatus(nextStatus),
        status: nextStatus,
      }
      setMutationNotices((current) => upsertMutationNotice(current, nextNotice))
      setLastAction(`${row.account} ${noticeMessageForStatus(nextStatus).toLowerCase()}`)

      if (
        commit.result.status !== "rejected" &&
        shouldInvalidateCustomerViewAfterMutation({
          filter,
          patch,
          searchText,
          sort,
        })
      ) {
        setPendingInvalidation({ scope: "view" })
      }

      return commit.result
    },
    [filter, mutationMode, searchText, sort],
  )

  const handleServerRowPatch = useCallback<BcServerEditPatchFactory<ServerCustomerRow>>(
    (event, patch) => ({
      ...patch,
      baseRevision: event.row.revision,
      mutationId: nextMutationId(mutationSequenceRef),
    }),
    [],
  )

  const handleSearchTextChange = useCallback(
    (next: string) => {
      setSearchText(next)
      resetToFirstPage()
    },
    [resetToFirstPage],
  )

  const handleRegionChange = useCallback(
    (next: CustomerRow["region"] | "all") => {
      setRegion(next)
      resetToFirstPage()
    },
    [resetToFirstPage],
  )

  const handleStatusChange = useCallback(
    (next: CustomerStatus | "all") => {
      setStatus(next)
      resetToFirstPage()
    },
    [resetToFirstPage],
  )

  const handleSortChange = useCallback(
    (next: readonly BcGridSort[]) => {
      setSort(next)
      resetToFirstPage()
      setLastAction(
        next.length ? `Sort ${next[0]?.columnId} ${next[0]?.direction}` : "Sort cleared",
      )
    },
    [resetToFirstPage],
  )

  const handlePaginationChange = useCallback((next: BcPaginationState) => {
    setPagination(next)
    setLastAction(`Page ${next.page + 1}, ${next.pageSize} rows`)
  }, [])

  const handleRefresh = useCallback(() => {
    apiRef.current?.refreshServerRows({ purge: true })
    setLastAction("Purged and reloaded server rows")
  }, [])

  const handleInvalidateActiveRow = useCallback(() => {
    if (!activeRowId) return
    apiRef.current?.invalidateServerRows({ rowIds: [activeRowId], scope: "rows" })
    setLastAction(`Invalidated row ${activeRow?.account ?? activeRowId}`)
  }, [activeRow?.account, activeRowId])

  const handleInvalidateView = useCallback(() => {
    apiRef.current?.invalidateServerRows({ scope: "view" })
    setLastAction("Invalidated current server view")
  }, [])

  const handleResetScenario = useCallback(() => {
    sourceRowsRef.current = createServerCustomerRows(customerRows, 180)
    setDatasetVersion((version) => version + 1)
    setMutationNotices([])
    setActiveRowId(sourceRowsRef.current[0]?.id ?? "")
    apiRef.current?.refreshServerRows({ purge: true })
    setLastAction("Reset server dataset")
  }, [])

  return (
    <section
      id="server-edit-grid"
      className="demo-panel server-edit-panel"
      aria-label="Server-backed editable customer grid"
    >
      <div className="summary-strip server-summary-strip" aria-label="Server customer summary">
        <SummaryTile
          label="Server Customers"
          value={sourceRowsRef.current.length.toLocaleString()}
        />
        <SummaryTile
          label="Visible Query"
          value={(querySnapshot?.totalRows ?? 0).toLocaleString()}
        />
        <SummaryTile label="Outstanding" value={currency.format(summary.totalOutstanding)} />
        <SummaryTile label="Credit Holds" value={summary.creditHolds.toLocaleString()} />
        <SummaryTile label="Pending Saves" value={pendingCount.toLocaleString()} />
      </div>

      <div className="demo-toolbar server-edit-toolbar">
        <div>
          <strong>Server Edit Customers</strong>
          <span>{lastAction}</span>
        </div>

        <div className="demo-controls server-edit-controls">
          <label className="search-control">
            <span>Server search</span>
            <input
              type="search"
              aria-label="Server search"
              value={searchText}
              onChange={(event) => handleSearchTextChange(event.currentTarget.value)}
              placeholder="Account, customer, collector"
            />
          </label>
          <ServerSelectControl
            label="Region"
            value={region}
            values={serverEditRegions}
            onChange={handleRegionChange}
          />
          <ServerSelectControl
            label="Status"
            value={status}
            values={serverEditStatuses}
            onChange={handleStatusChange}
          />
          <SegmentedOutcomeControl value={mutationMode} onChange={setMutationMode} />
          <button type="button" className="primary-action" onClick={handleRefresh}>
            Refresh
          </button>
          <button type="button" className="primary-action" onClick={handleInvalidateActiveRow}>
            Row stale
          </button>
          <button type="button" className="primary-action" onClick={handleInvalidateView}>
            View stale
          </button>
          <button type="button" className="primary-action" onClick={handleResetScenario}>
            Reset
          </button>
        </div>
      </div>

      <BcServerGrid<ServerCustomerRow>
        ariaLabel="Server-backed editable customers"
        apiRef={apiRef}
        columns={columns}
        createServerRowPatch={handleServerRowPatch}
        density="normal"
        filter={filter}
        flashOnEdit
        gridId="server-edit.customers"
        height={520}
        loadPage={loadPage}
        locale="en-US"
        onPaginationChange={handlePaginationChange}
        onRowClick={(row) => setActiveRowId(row.id)}
        onServerRowMutation={handleMutation}
        onSortChange={handleSortChange}
        page={pagination.page}
        pageSize={pagination.pageSize}
        pagination={false}
        rowId={(row) => row.id}
        rowModel="paged"
        searchText={searchText}
        showFilterRow={false}
        sort={sort}
      />

      <ServerEditFooter
        activeRow={activeRow}
        notices={mutationNotices}
        onClearNotices={() => setMutationNotices([])}
        onPaginationChange={handlePaginationChange}
        page={pagination.page}
        pageCount={pageCount}
        pageSize={pagination.pageSize}
        querySnapshot={querySnapshot}
      />
    </section>
  )
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ServerSelectControl<TValue extends string>({
  label,
  onChange,
  value,
  values,
}: {
  label: string
  onChange: (next: TValue) => void
  value: TValue
  values: readonly TValue[]
}) {
  return (
    <label className="server-select-control">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value as TValue)}
      >
        {values.map((entry) => (
          <option key={entry} value={entry}>
            {entry === "all" ? "All" : entry}
          </option>
        ))}
      </select>
    </label>
  )
}

function SegmentedOutcomeControl({
  onChange,
  value,
}: {
  onChange: (next: ServerEditOutcome) => void
  value: ServerEditOutcome
}) {
  return (
    <div className="control-group">
      <span>Save mode</span>
      <div className="segmented" aria-label="Save mode">
        {serverEditOutcomeOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            className={option.id === value ? "selected" : undefined}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function ServerEditFooter({
  activeRow,
  notices,
  onClearNotices,
  onPaginationChange,
  page,
  pageCount,
  pageSize,
  querySnapshot,
}: {
  activeRow: ServerCustomerRow | null
  notices: readonly ServerMutationNotice[]
  onClearNotices: () => void
  onPaginationChange: (next: BcPaginationState) => void
  page: number
  pageCount: number
  pageSize: number
  querySnapshot: CustomerQuerySnapshot | null
}) {
  return (
    <div className="server-edit-footer">
      <div className="server-pager" aria-label="Server pagination">
        <button
          type="button"
          className="primary-action"
          disabled={page <= 0}
          onClick={() => onPaginationChange({ page: Math.max(0, page - 1), pageSize })}
        >
          Previous
        </button>
        <span>
          Page {page + 1} of {pageCount}
        </span>
        <button
          type="button"
          className="primary-action"
          disabled={page >= pageCount - 1}
          onClick={() => onPaginationChange({ page: Math.min(pageCount - 1, page + 1), pageSize })}
        >
          Next
        </button>
        <label className="server-page-size-control">
          <span>Rows</span>
          <select
            aria-label="Server page size"
            value={pageSize}
            onChange={(event) =>
              onPaginationChange({ page: 0, pageSize: Number(event.currentTarget.value) })
            }
          >
            {serverEditPageSizes.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="server-edit-inspector">
        <section aria-label="Active customer">
          <h3>Active Customer</h3>
          {activeRow ? (
            <dl>
              <div>
                <dt>Account</dt>
                <dd>{activeRow.account}</dd>
              </div>
              <div>
                <dt>Revision</dt>
                <dd>{activeRow.revision}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{activeRow.serverUpdatedAt}</dd>
              </div>
            </dl>
          ) : (
            <p>No active row</p>
          )}
        </section>

        <section aria-label="Server request shape">
          <h3>Server Request</h3>
          <dl>
            <div>
              <dt>Search</dt>
              <dd>{querySnapshot?.search || "none"}</dd>
            </div>
            <div>
              <dt>Filter</dt>
              <dd>{querySnapshot?.filter ?? "none"}</dd>
            </div>
            <div>
              <dt>Sort</dt>
              <dd>{querySnapshot?.sort ?? "none"}</dd>
            </div>
            <div>
              <dt>Rows</dt>
              <dd>{querySnapshot?.returnedAccounts.join(", ") || "none"}</dd>
            </div>
          </dl>
        </section>

        <section aria-label="Mutation log">
          <div className="server-log-header">
            <h3>Mutation Log</h3>
            <button type="button" className="primary-action" onClick={onClearNotices}>
              Clear
            </button>
          </div>
          <div className="server-mutation-list">
            {notices.length === 0 ? (
              <p>No mutations</p>
            ) : (
              notices.map((notice) => (
                <article key={notice.mutationId} className="server-mutation-item">
                  <span className={`server-sync-badge server-sync-${notice.status}`}>
                    {notice.status}
                  </span>
                  <div>
                    <strong>
                      {notice.account} {notice.columnLabel}
                    </strong>
                    <small>{notice.message}</small>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function ServerStatusBadge({ status }: { status: CustomerStatus }) {
  return (
    <span className={`bc-grid-status erp-status erp-status-${statusLabels[status]}`}>{status}</span>
  )
}

function upsertMutationNotice(
  current: readonly ServerMutationNotice[],
  notice: ServerMutationNotice,
): readonly ServerMutationNotice[] {
  return [notice, ...current.filter((entry) => entry.mutationId !== notice.mutationId)].slice(0, 6)
}

function noticeStatusForResult(
  status: "accepted" | "rejected" | "conflict",
): ServerMutationNoticeStatus {
  if (status === "accepted") return "saved"
  if (status === "conflict") return "conflict"
  return "error"
}

function noticeMessageForStatus(status: ServerMutationNoticeStatus): string {
  if (status === "saved") return "Saved"
  if (status === "conflict") return "Conflict"
  if (status === "error") return "Rolled back"
  return "Saving"
}

function nextMutationId(sequenceRef: { current: number }): string {
  sequenceRef.current += 1
  return `server-customer-edit-${sequenceRef.current}`
}

function waitForServerLatency(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"))
      return
    }

    const timer = window.setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer)
        reject(new DOMException("aborted", "AbortError"))
      },
      { once: true },
    )
  })
}
