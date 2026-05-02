import { selectEditor } from "@bc-grid/editors"
import {
  type BcCellEditCommitEvent,
  type BcCellEditor,
  BcGrid,
  type BcGridColumn,
  useBcGridState,
} from "@bc-grid/react"
import { useState } from "react"

/**
 * Hero spike — Colour Selection (audit-2026-05 P0-9 / synthesis hero
 * track). Demonstrates the v0.5 Combobox-anchored lookup with 16×16
 * coloured swatch chips beside option labels, validated by the
 * BusinessCraft-rewrite four-hero use case set:
 *
 *   1. Sales estimating (numeric edit, paste) — separate spike.
 *   2. Production estimating (grouping, drag/drop) — coordinator-owned spike.
 *   3. **Colour selections (this spike).**
 *   4. Document management (file/thumbnail cells) — coordinator-owned spike.
 *
 * Goal per the synthesis sprint plan: <100 LOC of consumer code. This
 * file (excluding the data fixture) is **30 LOC of consumer wiring**.
 * Add a comparable example for the other hero use cases by mirroring
 * this shape.
 */

interface FinishRow {
  id: string
  product: string
  finish: string
}

const FINISHES = [
  { value: "antique-walnut", label: "Antique Walnut", swatch: "#5C3A21" },
  { value: "honey-oak", label: "Honey Oak", swatch: "#C68642" },
  { value: "natural-maple", label: "Natural Maple", swatch: "#E8D5A8" },
  { value: "ebony", label: "Ebony", swatch: "#1A1A1A" },
  { value: "cherry-stain", label: "Cherry Stain", swatch: "#6E2C1F" },
  { value: "espresso", label: "Espresso", swatch: "#3B2519" },
  { value: "white-wash", label: "White Wash", swatch: "#F5F0E6" },
] as const

const SAMPLE_ROWS: FinishRow[] = [
  { id: "1", product: "Library shelf — bay 1", finish: "honey-oak" },
  { id: "2", product: "Library shelf — bay 2", finish: "honey-oak" },
  { id: "3", product: "Reading-nook bench", finish: "" },
  { id: "4", product: "Display case", finish: "ebony" },
  { id: "5", product: "Hallway runner trim", finish: "" },
]

export function ColourSelectionExample() {
  // Mock the consumer's row data store. In a real app this would be a
  // server-paged grid or a query hook.
  const [rows, setRows] = useState<FinishRow[]>(SAMPLE_ROWS)

  // Turnkey state hook (audit P0-5) — owns the ~13 controlled-state
  // dimensions, persists to localStorage under `bc-grid:finishes:*`.
  const grid = useBcGridState({ persistTo: "local:finishes" })

  const columns: BcGridColumn<FinishRow>[] = [
    { field: "product", header: "Product", flex: 1 },
    {
      field: "finish",
      header: "Finish",
      width: 220,
      editable: true,
      // Combobox + swatches: each option is `{ value, label, swatch }`.
      // The trigger renders the picked swatch chip; the popover lists
      // every option with its chip, keyboard-navigable.
      cellEditor: selectEditor as BcCellEditor<FinishRow, unknown>,
      options: FINISHES,
      cellRenderer: ({ value }) => {
        const option = FINISHES.find((f) => f.value === value)
        if (!option) return <span style={{ color: "var(--bc-grid-muted-fg)" }}>—</span>
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
            <span
              aria-hidden="true"
              style={{
                width: "1rem",
                height: "1rem",
                background: option.swatch,
                borderRadius: "0.25rem",
                border: "1px solid color-mix(in srgb, currentColor 12%, transparent)",
              }}
            />
            <span>{option.label}</span>
          </span>
        )
      },
    },
  ]

  return (
    <BcGrid<FinishRow>
      {...grid.props}
      columns={columns}
      data={rows}
      rowId={(row: FinishRow) => row.id}
      onCellEditCommit={(event: BcCellEditCommitEvent<FinishRow>) => {
        setRows((prev) =>
          prev.map((row: FinishRow) =>
            row.id === event.rowId
              ? { ...row, [event.column.field as string]: event.nextValue }
              : row,
          ),
        )
      }}
    />
  )
}
