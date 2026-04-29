import { BcEditGrid, type BcGridColumn, type BcGridDensity, useBcGridApi } from "@bc-grid/react"
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
  Active: "active",
  "On Hold": "hold",
  "Past Due": "past-due",
  Prospect: "prospect",
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
            <span>Customer Grid</span>
            <small>@bc-grid/react</small>
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
            <h2 id="example-title">ERP Customer Grid</h2>
            <p>{customerRows.length.toLocaleString()} generated customer accounts</p>
          </div>
          <span className="status-pill">React v0</span>
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
  const rows = customerRows

  const columns = useMemo<readonly BcGridColumn<CustomerRow>[]>(
    () => [
      {
        columnId: "id",
        field: "id",
        header: "ID",
        pinned: "left",
        width: 118,
        format: "code",
        cellClassName: "customer-code-cell",
      },
      {
        columnId: "name",
        field: "name",
        header: "Customer",
        width: 240,
        rowHeader: true,
      },
      {
        columnId: "email",
        field: "email",
        header: "Email",
        width: 280,
      },
      {
        columnId: "company",
        field: "company",
        header: "Company",
        width: 240,
      },
      {
        columnId: "tier",
        field: "tier",
        header: "Tier",
        width: 136,
      },
      {
        columnId: "region",
        field: "region",
        header: "Region",
        width: 150,
      },
      {
        columnId: "owner",
        field: "owner",
        header: "Owner",
        width: 160,
      },
      {
        columnId: "balance",
        field: "balance",
        header: "Balance",
        align: "right",
        width: 136,
        format: { type: "currency", currency: "USD", precision: 0 },
      },
      {
        columnId: "status",
        field: "status",
        header: "Status",
        width: 130,
        cellRenderer(params) {
          return <StatusBadge status={params.row.status} />
        },
      },
      {
        columnId: "created",
        field: "created",
        header: "Created",
        width: 140,
        format: "date",
      },
    ],
    [],
  )

  const handleEdit = useCallback((row: CustomerRow) => {
    setLastAction(`Edit ${row.id}`)
  }, [])

  const handleEmail = useCallback((row: CustomerRow) => {
    setLastAction(`Email ${row.email}`)
  }, [])

  const handleScrollToRow500 = useCallback(() => {
    const target = rows[499]
    if (!target) return
    apiRef.current?.scrollToRow(target.id, { align: "center" })
    setLastAction(`Scrolled to ${target.id}`)
  }, [apiRef, rows])

  return (
    <section id="customer-grid" className="demo-panel" aria-label="Customer grid demo">
      <div className="demo-toolbar">
        <div>
          <strong>Accounts Receivable</strong>
          <span>{lastAction}</span>
        </div>

        <div className="demo-controls">
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
            Scroll to row 500
          </button>
        </div>
      </div>

      <BcEditGrid
        ariaLabel="Customer accounts"
        apiRef={apiRef}
        columns={columns}
        data={rows}
        density={density}
        detailPath="/customers"
        extraActions={(row) => [{ label: "Email", onSelect: () => handleEmail(row) }]}
        height={560}
        linkField="name"
        locale="en-US"
        onEdit={handleEdit}
        rowId={(row) => row.id}
      />
    </section>
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
