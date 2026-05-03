import {
  autocompleteEditor,
  dateEditor,
  datetimeEditor,
  multiSelectEditor,
  numberEditor,
  selectEditor,
  textEditor,
  timeEditor,
} from "@bc-grid/editors"
import {
  type BcCellEditor,
  BcEditGrid,
  type BcGridColumn,
  type BcGridDensity,
  type BcSelection,
  type BcSidebarPanel,
  useBcGridApi,
} from "@bc-grid/react"
import { useCallback, useMemo, useState } from "react"
import { ClientTreeExample } from "./client-tree.example"
import {
  type CustomerFlag,
  type CustomerRow,
  type CustomerStatus,
  customerRows,
  packageRows,
} from "./examples"
import { featureDiscoveryRows, featureShortcuts } from "./featureDiscovery"
import { type CustomerContactPanelState, customerContactPanelState } from "./masterDetailExample"
import { ServerModeSwitchExample } from "./server-mode-switch.example"
import { ServerEditGridExample } from "./serverEditExample"

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

const customerGridSidebarPanels = [
  "columns",
  "filters",
  "pivot",
] as const satisfies readonly BcSidebarPanel<CustomerRow>[]

type CustomerGridSidebarPanel = (typeof customerGridSidebarPanels)[number]

const customerGridGroupableColumns = [
  { columnId: "region", header: "Region" },
  { columnId: "owner", header: "Collector" },
  { columnId: "terms", header: "Terms" },
  { columnId: "status", header: "Status" },
] as const

const statusLabels: Record<CustomerStatus, string> = {
  Open: "open",
  "Credit Hold": "hold",
  "Past Due": "past-due",
  Disputed: "disputed",
}

const STATUS_OPTIONS: readonly { value: CustomerStatus; label: string }[] = [
  { value: "Open", label: "Open" },
  { value: "Credit Hold", label: "Credit Hold" },
  { value: "Past Due", label: "Past Due" },
  { value: "Disputed", label: "Disputed" },
]

const FLAG_OPTIONS: readonly { value: CustomerFlag; label: string }[] = [
  { value: "high-volume", label: "High Volume" },
  { value: "international", label: "International" },
  { value: "tax-exempt", label: "Tax Exempt" },
  { value: "manual-review", label: "Manual Review" },
  { value: "vip", label: "VIP" },
]

const FLAG_LABELS: Record<CustomerFlag, string> = {
  "high-volume": "High Volume",
  international: "International",
  "tax-exempt": "Tax Exempt",
  "manual-review": "Manual Review",
  vip: "VIP",
}

/**
 * Master collector roster for the editor-autocomplete demo. The seeded
 * data only uses the first 8 names; this 30-name roster is what the
 * autocomplete fetchOptions resolver searches. A realistic ERP scenario:
 * the existing assignment is one of the active collectors, but the
 * autocomplete lets the AR clerk reassign to anyone in HR.
 */
const COLLECTOR_ROSTER: readonly string[] = [
  "Alex Chen",
  "Maya Singh",
  "Jordan Lee",
  "Priya Nair",
  "Taylor Brooks",
  "Morgan Reed",
  "Sam Carter",
  "Jamie Patel",
  "Avery Thompson",
  "Casey Morgan",
  "Drew Bennett",
  "Elliot Park",
  "Frances Walsh",
  "Harper Singh",
  "Indira Rao",
  "Jules Cabrera",
  "Kai Nakamura",
  "Lena Whitfield",
  "Marcus Okafor",
  "Nora Albright",
  "Owen Vasquez",
  "Pia Lindqvist",
  "Quinn Holloway",
  "Reese McAllister",
  "Sofia Delgado",
  "Tomas Kovac",
  "Una Romero",
  "Victor Hartwell",
  "Wren Beaumont",
  "Yusuf Bashir",
]

async function fetchCollectorOptions(
  query: string,
  signal: AbortSignal,
): Promise<readonly { value: string; label: string }[]> {
  // Simulate a server round-trip — keeps the editor-autocomplete demo
  // honest about debounce + abort semantics. 50ms is small enough not to
  // visibly stall keystrokes.
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 50)
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(new DOMException("aborted", "AbortError"))
    })
  })
  if (signal.aborted) throw new DOMException("aborted", "AbortError")
  const needle = query.trim().toLowerCase()
  const matches = needle
    ? COLLECTOR_ROSTER.filter((name) => name.toLowerCase().includes(needle))
    : COLLECTOR_ROSTER
  return matches.slice(0, 10).map((name) => ({ value: name, label: name }))
}

function isServerModeSwitchOnly(): boolean {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("serverModeSwitch") === "1"
}

function isClientTreeOnly(): boolean {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("clientTree") === "1"
}

export function App() {
  const [theme, setTheme] = useState<ThemeMode>("light")
  const [density, setDensity] = useState<BcGridDensity>("normal")

  // `?serverModeSwitch=1` mounts only the server-mode-switch demo so the
  // Playwright spec at `apps/examples/tests/server-mode-switch.pw.ts` has
  // a deterministic single-grid surface to drive without competing
  // examples on the page.
  if (isServerModeSwitchOnly()) {
    return (
      <main className={theme === "dark" ? "app-shell dark" : "app-shell"}>
        <section className="workspace">
          <ServerModeSwitchExample />
        </section>
      </main>
    )
  }

  // `?clientTree=1` mounts only the client tree row model demo for the
  // `apps/examples/tests/client-tree-rowmodel.pw.ts` Playwright spec.
  // Worker1 v06 headline.
  if (isClientTreeOnly()) {
    return (
      <main className={theme === "dark" ? "app-shell dark" : "app-shell"}>
        <section className="workspace">
          <ClientTreeExample />
        </section>
      </main>
    )
  }

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
          <a className="nav-item" href="#feature-map">
            <span>Feature Map</span>
            <small>flags and entry points</small>
          </a>
          <a className="nav-item" href="#server-edit-grid">
            <span>Server Edit Grid</span>
            <small>customers API pattern</small>
          </a>
          <a className="nav-item" href="#package-matrix">
            <span>Package Matrix</span>
            <small>Q1 packages</small>
          </a>
        </nav>

        <nav className="feature-shortcuts" aria-label="Feature shortcuts">
          <span>Try features</span>
          {featureShortcuts.map((shortcut) => (
            <a key={shortcut.id} className="shortcut-link" href={shortcut.href}>
              <strong>{shortcut.label}</strong>
              <small>{shortcut.description}</small>
            </a>
          ))}
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
        <ServerEditGridExample />
        <FeatureDiscoveryMap />
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

function autoHeightEnabled(): boolean {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("autoHeight") === "1"
}

function aggregationsEnabled(): boolean {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("aggregations") === "1"
}

function masterDetailEnabled(): boolean {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("masterDetail") === "1"
}

function columnGroupsEnabled(): boolean {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("columnGroups") === "1"
}

/**
 * `?filterPopup=1` URL flag opts every filterable column into the
 * `filter-popup-variant` demo: the inline filter row collapses entirely
 * and each column header gains a funnel icon → floating filter popover.
 * Demo-critical for the bsncraft funding demo (week 2 sprint).
 */
function filterPopupEnabled(): boolean {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("filterPopup") === "1"
}

function applyPopupFilterVariant<TRow>(
  columns: readonly BcGridColumn<TRow>[],
): readonly BcGridColumn<TRow>[] {
  if (!filterPopupEnabled()) return columns
  return columns.map((column) => {
    if (column.children && column.children.length > 0) {
      return { ...column, children: applyPopupFilterVariant(column.children) }
    }
    if (!column.filter) return column
    return { ...column, filter: { ...column.filter, variant: "popup" as const } }
  })
}

function applyGroupedHeaderDemo(
  columns: readonly BcGridColumn<CustomerRow>[],
): readonly BcGridColumn<CustomerRow>[] {
  if (!columnGroupsEnabled()) return columns
  const agingColumnIds = new Set(["current", "days1to30", "days31to60", "daysOver60"])
  const agingChildren = columns.filter((column) => {
    const columnId = column.columnId ?? column.field
    return columnId ? agingColumnIds.has(columnId) : false
  })
  return columns.flatMap((column) => {
    const columnId = column.columnId ?? column.field
    if (columnId === "current") {
      return [
        {
          columnId: "agingBuckets",
          header: "Aging Buckets",
          children: agingChildren,
        } satisfies BcGridColumn<CustomerRow>,
      ]
    }
    return columnId && agingColumnIds.has(columnId) ? [] : [column]
  })
}

function initialToolPanel(): CustomerGridSidebarPanel | null {
  if (typeof window === "undefined") return null
  const panel = new URLSearchParams(window.location.search).get("toolPanel")
  return isCustomerGridSidebarPanel(panel) ? panel : null
}

function isCustomerGridSidebarPanel(value: string | null): value is CustomerGridSidebarPanel {
  return value === "columns" || value === "filters" || value === "pivot"
}

/**
 * `?groupBy=region,status` URL flag seeds the AR Customers demo with
 * an initial group-by stack. Surfaces the `defaultGroupBy` +
 * `groupsExpandedByDefault` pair from `docs/api.md` §3.1 / §5.3 so a
 * user can land on a grouped view without first opening the Columns
 * tool panel.
 *
 * Pair with `?toolPanel=columns` to land on the Columns tool panel
 * with the "Group by" zone visible — that's the third built-in entry
 * point for adding / removing groups on the fly.
 *
 * Accepts a comma-separated column-id list. Unknown ids are silently
 * filtered against the curated `customerGridGroupableColumns` set so
 * a stale share link never crashes the demo. An empty / missing flag
 * leaves grouping off (the default).
 */
function initialGroupBy(): readonly string[] {
  if (typeof window === "undefined") return []
  const raw = new URLSearchParams(window.location.search).get("groupBy")
  if (!raw) return []
  const allowed = new Set<string>(customerGridGroupableColumns.map((column) => column.columnId))
  return raw
    .split(",")
    .map((token) => token.trim())
    .filter((token): token is string => token.length > 0 && allowed.has(token))
}

function groupsExpandedByDefaultEnabled(): boolean {
  if (typeof window === "undefined") return false
  // Default: when `?groupBy=` is supplied, expand the buckets so the
  // demo reads as an organisational view immediately;
  // `?groupBy=…&groupsCollapsed=1` opts back into the collapsed
  // default for hosts that prefer manual drill-down.
  if (new URLSearchParams(window.location.search).get("groupsCollapsed") === "1") return false
  return initialGroupBy().length > 0
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
  const [toolPanel, setToolPanel] = useState<CustomerGridSidebarPanel | null>(initialToolPanel)
  const [activeCustomer, setActiveCustomer] = useState<CustomerRow | null>(customerRows[0] ?? null)
  const rows = customerRows
  const urlStateEnabled = urlStatePersistenceEnabled()
  const disabledRows = disabledRowsEnabled()
  const paginationDemo = paginationEnabled()
  const aggregationDemo = aggregationsEnabled()
  const masterDetailDemo = masterDetailEnabled()
  const gridHeight = autoHeightEnabled() ? "auto" : 560
  const initialGroupByColumns = useMemo(() => initialGroupBy(), [])
  const groupsExpandedDefault = groupsExpandedByDefaultEnabled()

  const ledgerSummary = useMemo(() => summarizeLedger(rows), [rows])
  const urlStatePersistence = useMemo(
    () => (urlStateEnabled ? { searchParam: "grid" } : undefined),
    [urlStateEnabled],
  )
  const rowIsDisabled = useCallback(
    (row: CustomerRow) => disabledRows && row.account === "CUST-00005",
    [disabledRows],
  )

  const baseColumns = useMemo<readonly BcGridColumn<CustomerRow>[]>(
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
        // ?edit=1: editable free-form name with autocomplete suggestions
        // sourced from a 30-name roster via async fetchOptions. AbortSignal
        // races superseded keystrokes — keeps the network honest under
        // fast typing. This editor commits a string, so valueParser owns
        // normalization and validate owns the final domain rule.
        editable: editorFrameworkEnabled(),
        ...(editorFrameworkEnabled()
          ? { cellEditor: autocompleteEditor as unknown as BcCellEditor<CustomerRow, unknown> }
          : {}),
        fetchOptions: fetchCollectorOptions,
        valueParser: (input: string) => input.trim(),
        validate: (next: unknown) => {
          const stringValue = typeof next === "string" ? next : String(next ?? "")
          return stringValue.length === 0
            ? { valid: false as const, error: "Collector is required." }
            : { valid: true as const }
        },
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
        // ?edit=1: editable enum field. Native <select> dropdown via
        // editor-select; options enumerate every CustomerStatus value.
        // The selected option value is committed directly, so valueParser
        // is intentionally not used for this typed enum column.
        editable: editorFrameworkEnabled(),
        ...(editorFrameworkEnabled()
          ? { cellEditor: selectEditor as unknown as BcCellEditor<CustomerRow, unknown> }
          : {}),
        options: STATUS_OPTIONS,
      },
      {
        columnId: "lastInvoice",
        field: "lastInvoice",
        header: "Last Invoice",
        width: 260,
        format: "date",
        filter: { type: "date" },
        // ?edit=1: editable date field. Native <input type="date"> emits
        // YYYY-MM-DD; valueParser keeps that as-is. validate enforces the
        // realistic ERP constraint that an invoice can't be dated in the future.
        editable: editorFrameworkEnabled(),
        ...(editorFrameworkEnabled()
          ? { cellEditor: dateEditor as unknown as BcCellEditor<CustomerRow, unknown> }
          : {}),
        valueParser: (input: string) => input,
        validate: (next: unknown) => {
          if (typeof next !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(next)) {
            return { valid: false as const, error: "Date must be YYYY-MM-DD." }
          }
          const date = new Date(next)
          if (Number.isNaN(date.valueOf())) {
            return { valid: false as const, error: "Invalid date." }
          }
          if (date.valueOf() > Date.now()) {
            return { valid: false as const, error: "Invoice date can't be in the future." }
          }
          return { valid: true as const }
        },
      },
      {
        columnId: "lastPayment",
        field: "lastPayment",
        header: "Last Payment",
        width: 260,
        format: "date",
        filter: { type: "date" },
      },
      {
        columnId: "cutoffTime",
        field: "cutoffTime",
        header: "Cutoff",
        width: 110,
        align: "right",
        // ?edit=1: editable time field. The native `<input type="time">`
        // emits `HH:mm`; an identity valueParser keeps the value as-is.
        // validate enforces a working-hours bound (08:00–22:00).
        editable: editorFrameworkEnabled(),
        ...(editorFrameworkEnabled()
          ? { cellEditor: timeEditor as unknown as BcCellEditor<CustomerRow, unknown> }
          : {}),
        valueParser: (input: string) => input,
        validate: (next: unknown) => {
          if (typeof next !== "string" || !/^\d{2}:\d{2}$/.test(next)) {
            return { valid: false as const, error: "Time must be HH:mm." }
          }
          const [hh, mm] = next.split(":").map(Number)
          if (hh == null || mm == null) {
            return { valid: false as const, error: "Time must be HH:mm." }
          }
          const minutes = hh * 60 + mm
          if (minutes < 8 * 60 || minutes > 22 * 60) {
            return { valid: false as const, error: "Cutoff must be between 08:00 and 22:00." }
          }
          return { valid: true as const }
        },
      },
      {
        columnId: "nextScheduledCall",
        field: "nextScheduledCall",
        header: "Next Call",
        width: 180,
        // ?edit=1: editable datetime field. Native <input type="datetime-local">
        // emits YYYY-MM-DDTHH:mm; valueParser keeps the value as-is. validate
        // enforces a future-only constraint — scheduled follow-ups should be
        // dated forward.
        editable: editorFrameworkEnabled(),
        ...(editorFrameworkEnabled()
          ? { cellEditor: datetimeEditor as unknown as BcCellEditor<CustomerRow, unknown> }
          : {}),
        valueParser: (input: string) => input,
        validate: (next: unknown) => {
          if (typeof next !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(next)) {
            return { valid: false as const, error: "Datetime must be YYYY-MM-DDTHH:mm." }
          }
          const date = new Date(next)
          if (Number.isNaN(date.valueOf())) {
            return { valid: false as const, error: "Invalid datetime." }
          }
          return { valid: true as const }
        },
      },
      {
        columnId: "flags",
        field: "flags",
        header: "Flags",
        width: 220,
        // Render reads `params.value` (overlayed when committed) — not
        // `params.row.flags` — so a committed edit reflects in the cell
        // immediately. Empty rows render an em-dash so the cell isn't
        // ambiguous with a loading state.
        cellRenderer(params) {
          const flags = (Array.isArray(params.value) ? params.value : []) as readonly CustomerFlag[]
          if (flags.length === 0) return <span style={{ opacity: 0.5 }}>—</span>
          return flags.map((flag) => FLAG_LABELS[flag]).join(", ")
        },
        // ?edit=1: editable many-of-many field. Native <select multiple>
        // via editor-multi-select; options enumerate every CustomerFlag.
        // The typed option-value array is committed directly; validation
        // handles business rules instead of parsing display labels.
        // validate enforces the realistic ERP rule that VIP and Manual
        // Review can't both be set on the same customer (treat one as a
        // contradiction of the other).
        editable: editorFrameworkEnabled(),
        ...(editorFrameworkEnabled()
          ? { cellEditor: multiSelectEditor as unknown as BcCellEditor<CustomerRow, unknown> }
          : {}),
        options: FLAG_OPTIONS,
        validate: (next: unknown) => {
          if (!Array.isArray(next)) {
            return { valid: false as const, error: "Flags must be an array." }
          }
          if (next.includes("vip") && next.includes("manual-review")) {
            return {
              valid: false as const,
              error: "VIP and Manual Review can't both be set.",
            }
          }
          return { valid: true as const }
        },
      },
    ],
    [aggregationDemo],
  )

  // `?filterPopup=1` flips every filterable column into popup-variant per
  // `filter-popup-variant`. The inline filter row collapses entirely when
  // every filter is popup-mode, surfacing the AG-Grid-style funnel UX.
  const columns = useMemo(
    () => applyPopupFilterVariant(applyGroupedHeaderDemo(baseColumns)),
    [baseColumns],
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

  const toggleToolPanel = useCallback((panel: CustomerGridSidebarPanel) => {
    setToolPanel((current) => (current === panel ? null : panel))
  }, [])

  const handleToolPanelChange = useCallback((next: string | null) => {
    setToolPanel(isCustomerGridSidebarPanel(next) ? next : null)
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
            <span>Global search</span>
            <input
              type="search"
              aria-label="Global search"
              value={searchText}
              onChange={(event) => setSearchText(event.currentTarget.value)}
              placeholder="Search all customer rows"
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
          <div className="tool-panel-control" aria-label="Tool panels">
            <span>Tool panels</span>
            <div className="tool-panel-buttons">
              <button
                type="button"
                aria-pressed={toolPanel === "columns"}
                onClick={() => toggleToolPanel("columns")}
              >
                Columns
              </button>
              <button
                type="button"
                aria-pressed={toolPanel === "filters"}
                onClick={() => toggleToolPanel("filters")}
              >
                Filters
              </button>
              <button
                type="button"
                aria-pressed={toolPanel === "pivot"}
                onClick={() => toggleToolPanel("pivot")}
              >
                Pivot
              </button>
            </div>
          </div>
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
        flashOnEdit={editorFrameworkEnabled()}
        detailPath="/accounts-receivable/customers"
        extraActions={(row: CustomerRow) => [
          { label: "Statement", onSelect: () => handleStatement(row) },
        ]}
        gridId="accounts-receivable.customers"
        groupableColumns={customerGridGroupableColumns}
        {...(initialGroupByColumns.length > 0
          ? {
              defaultGroupBy: initialGroupByColumns,
              groupsExpandedByDefault: groupsExpandedDefault,
            }
          : {})}
        height={gridHeight}
        linkField="legalName"
        locale="en-US"
        {...(masterDetailDemo
          ? {
              detailPanelHeight: 188,
              renderDetailPanel: ({ row }: { row: CustomerRow }) => (
                <CustomerMasterDetail row={row} />
              ),
            }
          : {})}
        onEdit={handleEdit}
        onRowClick={setActiveCustomer}
        onSelectionChange={handleSelectionChange}
        {...(paginationDemo
          ? { pagination: true, defaultPageSize: 100, pageSizeOptions: [50, 100, 250] }
          : { pagination: false })}
        rowIsDisabled={rowIsDisabled}
        rowId={(row: CustomerRow) => row.id}
        searchText={searchText}
        sidebar={customerGridSidebarPanels}
        sidebarPanel={toolPanel}
        sidebarWidth={320}
        onSidebarPanelChange={handleToolPanelChange}
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

function CustomerMasterDetail({ row }: { row: CustomerRow }) {
  const contactState = customerContactPanelState(row)
  const contactsHeadingId = `customer-contacts-${row.id}`

  return (
    <div className="customer-master-detail">
      <section className="bc-grid-detail-section customer-master-detail-summary">
        <div className="customer-detail-stat">
          <span>Follow-up</span>
          <strong>{formatDateTime(row.nextScheduledCall)}</strong>
        </div>
        <div className="customer-detail-stat">
          <span>Aging Mix</span>
          <strong>
            {currency.format(row.current)} current / {currency.format(row.daysOver60)} 60+
          </strong>
        </div>
        <div className="customer-detail-stat">
          <span>Invoice Cutoff</span>
          <strong>{row.cutoffTime}</strong>
        </div>
        <div className="customer-detail-stat">
          <span>Terms</span>
          <strong>{row.terms}</strong>
        </div>
      </section>
      <section className="bc-grid-detail-section customer-master-detail-notes">
        <span className="bc-grid-detail-kicker">Collector Notes</span>
        <p>
          {row.owner} owns {row.region.toLowerCase()} collections for {row.terms.toLowerCase()}.
          Current exposure is {currency.format(row.balance)} across {row.openInvoices} open
          invoices.
        </p>
      </section>
      <section
        className="bc-grid-detail-section customer-contact-panel"
        aria-labelledby={contactsHeadingId}
      >
        <div className="bc-grid-detail-section-header customer-contact-panel-header">
          <span id={contactsHeadingId} className="bc-grid-detail-kicker">
            Customer Contacts
          </span>
          <strong>{customerContactPanelCountLabel(contactState)}</strong>
        </div>
        {contactState.kind === "ready" ? (
          <table
            aria-labelledby={contactsHeadingId}
            className="bc-grid-detail-nested-grid customer-contact-grid"
          >
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Role</th>
                <th scope="col">Channel</th>
              </tr>
            </thead>
            <tbody>
              {contactState.contacts.map((contact) => (
                <tr key={contact.id}>
                  <td className="customer-contact-name">
                    <strong>{contact.name}</strong>
                    <small>{contact.note}</small>
                  </td>
                  <td>{contact.role}</td>
                  <td>{contact.channel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <CustomerContactStateMessage state={contactState} />
        )}
      </section>
    </div>
  )
}

function customerContactPanelCountLabel(state: CustomerContactPanelState): string {
  if (state.kind === "ready") return `${state.contacts.length} contacts`
  if (state.kind === "loading") return "Loading"
  if (state.kind === "error") return "Needs attention"
  return "Empty"
}

function CustomerContactStateMessage({
  state,
}: {
  state: Exclude<CustomerContactPanelState, { kind: "ready" }>
}) {
  if (state.kind === "loading") {
    return (
      // biome-ignore lint/a11y/useSemanticElements: detail-panel loading text should be an explicit live status region for host-owned async child data.
      <div className="bc-grid-detail-loading" role="status" aria-live="polite">
        <span className="bc-grid-detail-state-title">{state.title}</span>
        <span className="bc-grid-detail-state-description">{state.description}</span>
      </div>
    )
  }

  if (state.kind === "error") {
    return (
      <div className="bc-grid-detail-error" role="alert">
        <span className="bc-grid-detail-state-title">{state.title}</span>
        <span className="bc-grid-detail-state-description">{state.description}</span>
      </div>
    )
  }

  return (
    <div className="bc-grid-detail-empty">
      <span className="bc-grid-detail-state-title">{state.title}</span>
      <span className="bc-grid-detail-state-description">{state.description}</span>
    </div>
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

function FeatureDiscoveryMap() {
  const availableCount = featureDiscoveryRows.filter((row) => row.status === "Available").length

  return (
    <section
      id="feature-map"
      className="package-panel feature-map-panel"
      aria-labelledby="feature-map-title"
    >
      <header>
        <div>
          <h3 id="feature-map-title">Feature Discovery Map</h3>
          <p>Controls and URL flags leave the main demo closed by default.</p>
        </div>
        <span>
          {availableCount} available / {featureDiscoveryRows.length - availableCount} planned
        </span>
      </header>
      <div className="feature-map-scroll">
        <table className="feature-map-table">
          <thead>
            <tr>
              <th scope="col">Feature</th>
              <th scope="col">Status</th>
              <th scope="col">Enable or find it</th>
              <th scope="col">API entry point</th>
            </tr>
          </thead>
          <tbody>
            {featureDiscoveryRows.map((row) => (
              <tr key={row.feature}>
                <th scope="row">{row.feature}</th>
                <td>
                  <span className={`feature-status feature-status-${row.status.toLowerCase()}`}>
                    {row.status}
                  </span>
                </td>
                <td>
                  <DiscoveryValue href={row.shortcutHref} value={row.entry} />
                </td>
                <td>
                  <DiscoveryValue value={row.api} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function DiscoveryValue({ href, value }: { href?: string | undefined; value: string }) {
  const content =
    value.includes("?") || value.includes("=") || value.includes("{") ? (
      <code>{value}</code>
    ) : (
      <span>{value}</span>
    )
  return href ? (
    <a className="feature-entry-link" href={href}>
      {content}
    </a>
  ) : (
    content
  )
}

function formatDateTime(value: string): string {
  const [date, time] = value.split("T")
  return `${date ?? value} ${time ?? ""}`.trim()
}
