import { BcEditGrid, type BcGridColumn, type BcGridDensity, useBcGridApi } from "@bc-grid/react"
import { type CSSProperties, useCallback, useMemo, useState } from "react"
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

const themePreviewColumns: readonly {
  key: keyof Pick<CustomerRow, "balance" | "id" | "name" | "status">
  label: string
  align?: "left" | "right"
  width: string
}[] = [
  { key: "id", label: "Customer", width: "8rem" },
  { key: "name", label: "Name", width: "1fr" },
  { key: "status", label: "Status", width: "8rem" },
  { key: "balance", label: "Balance", align: "right", width: "8rem" },
] as const

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
    <main className={`app-shell app-shell-${theme}`}>
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
          <a className="nav-item" href="#theme-preview">
            <span>Theme Preview</span>
            <small>@bc-grid/theming</small>
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
        <ThemeSpikePreview />
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
    <section
      id="customer-grid"
      className={`demo-panel bc-grid-theme-${theme}`}
      aria-label="Customer grid demo"
    >
      <div className="demo-toolbar">
        <div>
          <strong>Accounts Receivable</strong>
          <span>{lastAction}</span>
        </div>

        <div className="demo-controls">
          <SegmentedControl
            label="Theme"
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

function ThemeSpikePreview() {
  const gridTemplateColumns = themePreviewColumns.map((column) => column.width).join(" ")
  const rows = customerRows.slice(0, 3)

  return (
    <section id="theme-preview" className="theme-panel" aria-label="Theme spike preview">
      <header>
        <div>
          <h3>Theme Preview</h3>
          <span>Light and dark tokens across three density modes</span>
        </div>
        <code>@bc-grid/theming/styles.css</code>
      </header>

      <div className="theme-preview-grid">
        {themeModes.flatMap((theme) =>
          densityModes.map((density) => (
            <article key={`${theme.id}-${density.id}`} className="theme-card" data-theme={theme.id}>
              <div className="theme-card-header">
                <span>{theme.label}</span>
                <strong>{density.label}</strong>
              </div>

              <div
                className={`bc-grid bc-grid-theme-${theme.id} bc-grid--${density.id}`}
                style={{ "--bc-grid-columns": gridTemplateColumns } as CSSProperties}
              >
                <div className="bc-grid-header">
                  {themePreviewColumns.map((column) => (
                    <div
                      key={column.key}
                      className={
                        column.align === "right"
                          ? "bc-grid-cell bc-grid-cell-right"
                          : "bc-grid-cell"
                      }
                    >
                      {column.label}
                    </div>
                  ))}
                </div>
                {rows.map((row) => (
                  <div key={row.id} className="bc-grid-row">
                    {themePreviewColumns.map((column) => (
                      <div
                        key={column.key}
                        className={
                          column.align === "right"
                            ? "bc-grid-cell bc-grid-cell-right"
                            : "bc-grid-cell"
                        }
                      >
                        {renderThemedCell(row, column.key)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </article>
          )),
        )}
      </div>
    </section>
  )
}

function StatusBadge({ status }: { status: CustomerStatus }) {
  return (
    <span className={`bc-grid-status erp-status erp-status-${statusLabels[status]}`}>{status}</span>
  )
}

function renderThemedCell(row: CustomerRow, key: string) {
  if (key === "status") {
    return <StatusBadge status={row.status} />
  }

  if (key === "balance") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(row.balance)
  }

  return row[key as keyof CustomerRow]
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
