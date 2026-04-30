import { numberEditor, textEditor } from "@bc-grid/editors"
import {
  type BcCellEditor,
  BcEditGrid,
  type BcGridColumn,
  type BcGridDensity,
  type BcSelection,
  useBcGridApi,
} from "@bc-grid/react"
import { useCallback, useMemo, useState } from "react"
import { type CustomerRow, type CustomerStatus, customerRows, packageRows } from "./examples"

type ThemeMode = "light" | "dark"

const densityModes = [
  { id: "compact", label: "Compact" },
  { id: "normal", label: "Normal" },
  { id: "comfortable", label: "Comfortable" },
] as const satisfies readonly { id: BcGridDensity; label: string }[]

const themeModes = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
] as const satisfies readonly { id: ThemeMode; label: string }[]

const statusLabels: Record<CustomerStatus, string> = {
  Open: "open",
  "Credit Hold": "hold",
  "Past Due": "past-due",
  Disputed: "disputed",
}

export function App() {
  const [theme, setTheme] = useState<ThemeMode>("light")
  const [density, setDensity] = useState<BcGridDensity>("normal")

  return (
    <main className={theme === "dark" ? "app-shell dark" : "app-shell"}>
      <aside className="sidebar" aria-label="Examples">
        <div className="brand">
          <span className="brand-mark">bc</span>
          <div>
            <h1>bc-grid</h1>
            <p>Examples</p>
          </div>
        </div>

        <nav className="example-nav">
          <a className="nav-item nav-item-active" href="#customer-grid">
            <span>AR Customers</span>
            <small>Q1 vertical slice</small>
          </a>
          <a className="nav-item" href="#package-matrix">
            <span>Package Matrix</span>
            <small>Q1 packages</small>
          </a>
        </nav>
      </aside>

      <section className="workspace" aria-labelledby="example-title">
        <header className="toolbar">
          <div>
            <h2 id="example-title">Accounts Receivable Customers</h2>
            <p>{customerRows.length.toLocaleString()} customer ledger rows</p>
          </div>
          <span className="status-pill">Q1 gate</span>
        </header>

        <CustomerGridDemo
          density={density}
          onDensityChange={setDensity}
          onThemeChange={setTheme}
          theme={theme}
        />
        <PackageMatrix />
      </section>
    </main>
  )
}

/**
 * `?checkbox=1` URL flag opts the AR Customers grid into the
 * `selection-checkbox-column` demo. The flag keeps the existing pinned-cols
 * / multi-column-sort / live-regions tests untouched (they don't pass the
 * flag), while the new selection-checkbox-column.pw.ts test sets it.
 */
function checkboxSelectionEnabled(): boolean {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("checkbox") === "1"
}

function urlStatePersistenceEnabled(): boolean {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("urlstate") === "1"
}

function disabledRowsEnabled(): boolean {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("disabled") === "1"
}

/**
 * `?edit=1` URL flag opts the AR Customers grid into the
 * `editor-framework` demo. Selected columns gain `editable: true` so
 * F2 / Enter / typing / double-click activate the default text editor.
 * A `validate` is wired on `tradingName` to demonstrate the validation
 * flow (rejects empty strings).
 */
function editorFrameworkEnabled(): boolean {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("edit") === "1"
}

function paginationEnabled(): boolean {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("pagination") === "1"
}

function aggregationsEnabled(): boolean {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("aggregations") === "1"
}

function CustomerGridDemo({
  density,
  onDensityChange,
  onThemeChange,
  theme,
}: {
  density: BcGridDensity
  onDensityChange: (density: BcGridDensity) => void
  onThemeChange: (theme: ThemeMode) => void
  theme: ThemeMode
}) {
  const apiRef = useBcGridApi<CustomerRow>()
  const [lastAction, setLastAction] = useState("Ready")
  const [searchText, setSearchText] = useState("")
  const [selectedCount, setSelectedCount] = useState(0)
  const [activeCustomer, setActiveCustomer] = useState<CustomerRow | null>(customerRows[0] ?? null)
  const rows = customerRows
  const urlStateEnabled = urlStatePersistenceEnabled()
  const disabledRows = disabledRowsEnabled()
  const paginationDemo = paginationEnabled()
  const aggregationDemo = aggregationsEnabled()

  const ledgerSummary = useMemo(() => summarizeLedger(rows), [rows])
  const urlStatePersistence = useMemo(
    () => (urlStateEnabled ? { searchParam: "grid" } : undefined),
    [urlStateEnabled],
  )
  const rowIsDisabled = useCallback(
    (row: CustomerRow) => disabledRows && row.account === "CUST-00005",
    [disabledRows],
  )

  const columns = useMemo<readonly BcGridColumn<CustomerRow>[]>(
    () => [
      {
        columnId: "account",
        field: "account",
        header: "Account",
        pinned: "left",
        width: 132,
        format: "code",
        cellClassName: "customer-code-cell",
        filter: { type: "text" },
      },
      {
        columnId: "legalName",
        field: "legalName",
        header: "Customer",
        width: 280,
        rowHeader: true,
        filter: { type: "text" },
        tooltip: (row) =>
          `${row.legalName} · ${row.account} · ${currency.format(row.balance)} outstanding`,
      },
      {
        columnId: "tradingName",
        field: "tradingName",
        header: "Trading Name",
        width: 220,
        filter: { type: "text" },
        // ?edit=1: editable + validate (rejects empty). Uses the proper
        // editor-text factory (kind: "text") from @bc-grid/editors with
        // mount-time select-all + theme-aware styling.
        editable: editorFrameworkEnabled(),
        // `textEditor` is exported as `BcCellEditor<unknown, unknown>` for
        // assignability across all row/value shapes. Casting to the column's
        // typed shape is safe here — the editor doesn't read `row` fields.
        ...(editorFrameworkEnabled()
          ? { cellEditor: textEditor as unknown as BcCellEditor<CustomerRow, unknown> }
          : {}),
        // valueParser bridges the editor's string output → typed TValue.
        // For trading names we trim whitespace at commit time — a typical
        // ERP normalization (no leading/trailing spaces in stored codes).
        valueParser: (input: string) => input.trim(),
        validate: (next: unknown) => {
          const stringValue = typeof next === "string" ? next : String(next ?? "")
          return stringValue.length === 0
            ? { valid: false as const, error: "Trading name is required." }
            : { valid: true as const }
        },
      },
      {
        columnId: "region",
        field: "region",
        header: "Region",
        width: 150,
        filter: { type: "text" },
      },
      {
        columnId: "owner",
        field: "owner",
        header: "Collector",
        width: 170,
        filter: { type: "text" },
        tooltip: (row) => `Collector: ${row.owner}`,
      },
      {
        columnId: "terms",
        field: "terms",
        header: "Terms",
        width: 118,
        filter: { type: "text" },
      },
      {
        columnId: "creditHold",
        header: "Credit Hold?",
        align: "center",
        width: 128,
        format: "boolean",
        filter: { type: "boolean" },
        valueGetter(row) {
          return row.status === "Credit Hold"
        },
      },
      {
        columnId: "creditLimit",
        field: "creditLimit",
        header: "Credit Limit",
        align: "right",
        width: 140,
        format: { type: "currency", currency: "USD", precision: 0 },
        filter: { type: "number" },
        ...(aggregationDemo ? { aggregation: { type: "max" as const } } : {}),
        // ?edit=1: editable numeric column. valueParser strips locale
        // thousands separators (commas, spaces) and runs parseFloat.
        // validate enforces a non-negative bound (credit limits can't
        // be negative — realistic ERP constraint).
        editable: editorFrameworkEnabled(),
        ...(editorFrameworkEnabled()
          ? { cellEditor: numberEditor as unknown as BcCellEditor<CustomerRow, unknown> }
          : {}),
        valueParser: (input: string) => {
          const cleaned = input.replace(/[\s,]/g, "")
          const parsed = Number.parseFloat(cleaned)
          return Number.isFinite(parsed) ? parsed : Number.NaN
        },
        validate: (next: unknown) => {
          if (typeof next !== "number" || !Number.isFinite(next))
            return { valid: false as const, error: "Credit limit must be a number." }
          if (next < 0) return { valid: false as const, error: "Credit limit can't be negative." }
          return { valid: true as const }
        },
      },
      {
        columnId: "balance",
        field: "balance",
        header: "Outstanding",
        align: "right",
        width: 144,
        format: { type: "currency", currency: "USD", precision: 0 },
        filter: { type: "number" },
        ...(aggregationDemo ? { aggregation: { type: "sum" as const } } : {}),
      },
      {
        columnId: "current",
        field: "current",
        header: "Current",
        align: "right",
        width: 132,
        format: { type: "currency", currency: "USD", precision: 0 },
      },
      {
        columnId: "days1to30",
        field: "days1to30",
        header: "1-30",
        align: "right",
        width: 118,
        format: { type: "currency", currency: "USD", precision: 0 },
      },
      {
        columnId: "days31to60",
        field: "days31to60",
        header: "31-60",
        align: "right",
        width: 118,
        format: { type: "currency", currency: "USD", precision: 0 },
        cellClassName: (params) => (Number(params.value) > 0 ? "aging-warning-cell" : undefined),
      },
      {
        columnId: "daysOver60",
        field: "daysOver60",
        header: "60+",
        align: "right",
        width: 118,
        format: { type: "currency", currency: "USD", precision: 0 },
        cellClassName: (params) => (Number(params.value) > 0 ? "aging-danger-cell" : undefined),
      },
      {
        columnId: "openInvoices",
        field: "openInvoices",
        header: "Open Inv.",
        align: "right",
        width: 116,
        format: "number",
      },
      {
        columnId: "riskScore",
        field: "riskScore",
        header: "Risk",
        align: "right",
        width: 116,
        cellRenderer(params) {
          return <RiskMeter value={params.row.riskScore} />
        },
      },
      {
        columnId: "status",
        field: "status",
        header: "Status",
        width: 136,
        filter: { type: "text" },
        cellRenderer(params) {
          return <StatusBadge status={params.row.status} />
        },
      },
      {
        columnId: "lastInvoice",
        field: "lastInvoice",
        header: "Last Invoice",
        width: 260,
        format: "date",
        filter: { type: "date" },
      },
      {
        columnId: "lastPayment",
        field: "lastPayment",
        header: "Last Payment",
        width: 260,
        format: "date",
        filter: { type: "date" },
      },
    ],
    [aggregationDemo],
  )

  const handleEdit = useCallback((row: CustomerRow) => {
    setActiveCustomer(row)
    setLastAction(`Open account ${row.account}`)
  }, [])

  const handleStatement = useCallback((row: CustomerRow) => {
    setActiveCustomer(row)
    setLastAction(`Statement queued for ${row.account}`)
  }, [])

  const handleScrollToRow500 = useCallback(() => {
    const target = rows[499]
    if (!target) return
    apiRef.current?.scrollToRow(target.id, { align: "center" })
    setActiveCustomer(target)
    setLastAction(`Scrolled to ${target.account}`)
  }, [apiRef, rows])

  const handleSelectionChange = useCallback((next: BcSelection) => {
    setSelectedCount(selectionCount(next) ?? 0)
  }, [])

  return (
    <section id="customer-grid" className="demo-panel" aria-label="Customer grid demo">
      <div className="summary-strip" aria-label="Accounts receivable summary">
        <SummaryTile label="Outstanding" value={currency.format(ledgerSummary.balance)} />
        <SummaryTile label="Overdue" value={currency.format(ledgerSummary.overdue)} />
        <SummaryTile label="60+ Bucket" value={currency.format(ledgerSummary.daysOver60)} />
        <SummaryTile label="Credit Holds" value={ledgerSummary.creditHolds.toLocaleString()} />
        <SummaryTile label="Selected" value={selectedCount.toLocaleString()} />
      </div>

      <div className="demo-toolbar">
        <div>
          <strong>Accounts Receivable</strong>
          <span>{lastAction}</span>
        </div>

        <div className="demo-controls">
          <label className="search-control">
            <span>Search</span>
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.currentTarget.value)}
              placeholder="Customer, account, collector"
            />
          </label>
          <SegmentedControl
            label="Mode"
            options={themeModes}
            value={theme}
            onChange={onThemeChange}
          />
          <SegmentedControl
            label="Density"
            options={densityModes}
            value={density}
            onChange={onDensityChange}
          />
          <button type="button" className="primary-action" onClick={handleScrollToRow500}>
            Row 500
          </button>
        </div>
      </div>

      <BcEditGrid<CustomerRow>
        ariaLabel="Accounts receivable customer ledger"
        apiRef={apiRef}
        columns={columns}
        checkboxSelection={checkboxSelectionEnabled()}
        data={rows}
        density={density}
        detailPath="/accounts-receivable/customers"
        extraActions={(row: CustomerRow) => [
          { label: "Statement", onSelect: () => handleStatement(row) },
        ]}
        gridId="accounts-receivable.customers"
        height={560}
        linkField="legalName"
        locale="en-US"
        onEdit={handleEdit}
        onRowClick={setActiveCustomer}
        onSelectionChange={handleSelectionChange}
        {...(paginationDemo
          ? { pagination: true, defaultPageSize: 100, pageSizeOptions: [50, 100, 250] }
          : {})}
        rowIsDisabled={rowIsDisabled}
        rowId={(row: CustomerRow) => row.id}
        searchText={searchText}
        {...(urlStatePersistence ? { urlStatePersistence } : {})}
      />

      {activeCustomer ? <CustomerDetail row={activeCustomer} /> : null}
    </section>
  )
}

const currency = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency",
})

function summarizeLedger(rows: readonly CustomerRow[]) {
  return rows.reduce(
    (summary, row) => {
      summary.balance += row.balance
      summary.overdue += row.days1to30 + row.days31to60 + row.daysOver60
      summary.daysOver60 += row.daysOver60
      if (row.status === "Credit Hold") summary.creditHolds += 1
      return summary
    },
    { balance: 0, creditHolds: 0, daysOver60: 0, overdue: 0 },
  )
}

function selectionCount(selection: BcSelection): number | undefined {
  if (selection.mode !== "explicit") return undefined
  return selection.rowIds.size
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function SegmentedControl<TValue extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string
  onChange: (next: TValue) => void
  options: readonly { id: TValue; label: string }[]
  value: TValue
}) {
  return (
    <div className="control-group">
      <span>{label}</span>
      <div className="segmented" aria-label={label}>
        {options.map((option) => (
          <button
            type="button"
            key={option.id}
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

function StatusBadge({ status }: { status: CustomerStatus }) {
  return (
    <span className={`bc-grid-status erp-status erp-status-${statusLabels[status]}`}>{status}</span>
  )
}

function RiskMeter({ value }: { value: number }) {
  const level = value >= 70 ? "high" : value >= 40 ? "medium" : "low"
  return (
    <span className={`risk-meter risk-meter-${level}`} aria-label={`Risk score ${value}`}>
      {value}
    </span>
  )
}

function CustomerDetail({ row }: { row: CustomerRow }) {
  return (
    <aside className="customer-detail" aria-label="Selected customer account">
      <div>
        <span>Selected Account</span>
        <strong>{row.account}</strong>
      </div>
      <div>
        <span>Customer</span>
        <strong>{row.legalName}</strong>
      </div>
      <div>
        <span>Collector</span>
        <strong>{row.owner}</strong>
      </div>
      <div>
        <span>Outstanding</span>
        <strong>{currency.format(row.balance)}</strong>
      </div>
      <div>
        <span>60+ Balance</span>
        <strong>{currency.format(row.daysOver60)}</strong>
      </div>
      <div>
        <span>Risk</span>
        <strong>{row.riskScore}</strong>
      </div>
    </aside>
  )
}

function PackageMatrix() {
  return (
    <section id="package-matrix" className="package-panel" aria-label="Package matrix">
      <header>
        <h3>Package Matrix</h3>
        <span>{packageRows.length} packages</span>
      </header>
      <div className="package-list">
        {packageRows.map((row) => (
          <div key={row.name} className="package-row">
            <code>{row.name}</code>
            <span>{row.role}</span>
            <strong>{row.phase}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}
