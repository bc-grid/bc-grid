import { useMemo, useState } from "react"
import { type ExampleDefinition, type InvoiceRow, examples, packageRows } from "./examples"

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

export function App() {
  const [selectedExampleId, setSelectedExampleId] = useState(examples[0]?.id ?? "")
  const selectedExample = useMemo(
    () => examples.find((example) => example.id === selectedExampleId) ?? examples[0],
    [selectedExampleId],
  )

  if (!selectedExample) {
    return null
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Examples">
        <div className="brand">
          <span className="brand-mark">bc</span>
          <div>
            <h1>bc-grid</h1>
            <p>Examples</p>
          </div>
        </div>

        <nav className="example-nav">
          {examples.map((example) => (
            <button
              type="button"
              key={example.id}
              className={
                example.id === selectedExample.id ? "nav-item nav-item-active" : "nav-item"
              }
              onClick={() => setSelectedExampleId(example.id)}
            >
              <span>{example.title}</span>
              <small>{example.packageName}</small>
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace" aria-labelledby="example-title">
        <header className="toolbar">
          <div>
            <h2 id="example-title">{selectedExample.title}</h2>
            <p>{selectedExample.packageName}</p>
          </div>
          <span className="status-pill">{selectedExample.status}</span>
        </header>

        <ExamplePreview example={selectedExample} />
        <PackageMatrix />
      </section>
    </main>
  )
}

function ExamplePreview({ example }: { example: ExampleDefinition }) {
  const gridTemplateColumns = example.columns.map((column) => column.width).join(" ")

  return (
    <section className="preview-panel" aria-label={`${example.title} preview`}>
      <div className="preview-toolbar">
        <div>
          <strong>Accounts Receivable</strong>
          <span>{example.rows.length} rows</span>
        </div>
        <div className="segmented" aria-label="Density">
          <button type="button" className="selected">
            Compact
          </button>
          <button type="button">Comfortable</button>
        </div>
      </div>

      <div className="grid-frame">
        <div className="grid-header" style={{ gridTemplateColumns }}>
          {example.columns.map((column) => (
            <div key={column.key} className={column.align === "right" ? "cell cell-right" : "cell"}>
              {column.label}
            </div>
          ))}
        </div>
        <div className="grid-body">
          {example.rows.map((row) => (
            <GridRow
              key={row.id}
              row={row}
              example={example}
              gridTemplateColumns={gridTemplateColumns}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function GridRow({
  row,
  example,
  gridTemplateColumns,
}: {
  row: InvoiceRow
  example: ExampleDefinition
  gridTemplateColumns: string
}) {
  return (
    <div className="grid-row" style={{ gridTemplateColumns }}>
      {example.columns.map((column) => (
        <div key={column.key} className={column.align === "right" ? "cell cell-right" : "cell"}>
          {renderCell(row, column.key)}
        </div>
      ))}
    </div>
  )
}

function renderCell(row: InvoiceRow, key: string) {
  if (key === "status") {
    return <span className={`status status-${row.status.toLowerCase()}`}>{row.status}</span>
  }

  if (key === "amount") {
    return currencyFormatter.format(row.amount)
  }

  return row[key as keyof InvoiceRow]
}

function PackageMatrix() {
  return (
    <section className="package-panel" aria-label="Package matrix">
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
