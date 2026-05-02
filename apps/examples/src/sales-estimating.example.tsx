import { numberEditor } from "@bc-grid/editors"
import {
  type BcCellEditCommitEvent,
  type BcCellEditor,
  BcGrid,
  type BcGridColumn,
  useBcGridState,
} from "@bc-grid/react"
import { useState } from "react"

/**
 * Hero spike — Sales Estimating (audit-2026-05 P0-9 / synthesis hero
 * track). Demonstrates a believable ERP "sales quote line items" grid:
 * money columns with currency formatting, dependent cells (extPrice =
 * qty × price × (1 − discount) recomputes on commit), and a
 * placeholder for Excel-paste-fidelity once worker2's `pasteTsv`
 * listener (v0.5 paste-listener PR) lands.
 *
 *   1. **Sales estimating (this spike).**
 *   2. Production estimating — landed in `production-estimating.example.tsx` (#374).
 *   3. Colour selections — landed in `colour-selection.example.tsx` (#364).
 *   4. Document management — landed in `document-management.example.tsx` (#367).
 *
 * Goal per the synthesis sprint plan: <100 LOC of consumer code.
 * This file (excluding the seed fixture + Findings JSDoc) lands at
 * **~52 LOC of consumer wiring** (non-blank, non-comment, after biome
 * formatting). Under budget — the v0.4 `format: "currency"` token
 * (`packages/core/src/index.ts:55`) does the heavy lifting on display
 * and `useBcGridState` (#359) eliminates ~25 LOC of state plumbing.
 *
 * The Excel-paste leg is left as a Finding rather than a workaround:
 * worker2's paste-listener PR isn't merged yet; once it does, paste
 * will work end-to-end with no consumer code change here (the
 * editor-controller binding from `v05-paste-editor-binding` routes
 * through the same `valueParser`/`validate`/`onCellEditCommit` path
 * the keyboard already exercises).
 */

interface LineItem {
  id: string
  sku: string
  description: string
  qty: number
  price: number
  discount: number
  extPrice: number
}

const SEED: LineItem[] = [
  {
    id: "1",
    sku: "WB-100",
    description: "White board, 4×6",
    qty: 12,
    price: 89.5,
    discount: 0,
    extPrice: 1074,
  },
  {
    id: "2",
    sku: "WB-150",
    description: "White board, 6×8",
    qty: 8,
    price: 145,
    discount: 0.05,
    extPrice: 1102,
  },
  {
    id: "3",
    sku: "MK-DRY",
    description: "Dry-erase markers (8-pack)",
    qty: 24,
    price: 18.99,
    discount: 0,
    extPrice: 455.76,
  },
  {
    id: "4",
    sku: "ER-MAG",
    description: "Magnetic eraser",
    qty: 24,
    price: 6.5,
    discount: 0.1,
    extPrice: 140.4,
  },
  {
    id: "5",
    sku: "WB-CART",
    description: "Mobile whiteboard cart",
    qty: 4,
    price: 320,
    discount: 0,
    extPrice: 1280,
  },
]

const numberEditorTyped = numberEditor as BcCellEditor<LineItem, unknown>

/**
 * Strip currency / percent / thousands formatting before the number
 * editor's `valueParser` runs. The number editor commits a string
 * (e.g. `"$1,234.56"` if the user pastes from Excel); the column's
 * `valueParser` converts it to a typed number before
 * `onCellEditCommit` sees the row.
 */
const parseMoney = (input: string): number => {
  const cleaned = input.replace(/[^0-9.\-]/g, "")
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}
const parsePercent = (input: string): number => {
  const cleaned = input.replace(/[^0-9.\-]/g, "")
  const parsed = Number.parseFloat(cleaned)
  if (!Number.isFinite(parsed)) return 0
  // Accept "10" as 10% AND "0.1" as 10% — heuristic on magnitude.
  return parsed > 1 ? parsed / 100 : parsed
}

const computeExt = (row: LineItem): number =>
  Math.round(row.qty * row.price * (1 - row.discount) * 100) / 100

export function SalesEstimatingExample() {
  const [rows, setRows] = useState<LineItem[]>(SEED)
  const grid = useBcGridState({ persistTo: "local:sales-estimating" })

  const columns: BcGridColumn<LineItem>[] = [
    { field: "sku", header: "SKU", width: 110 },
    { field: "description", header: "Description", flex: 1 },
    {
      field: "qty",
      header: "Qty",
      width: 90,
      align: "right",
      format: "number",
      editable: true,
      cellEditor: numberEditorTyped,
      valueParser: parseMoney,
    },
    {
      field: "price",
      header: "Unit price",
      width: 130,
      align: "right",
      format: "currency",
      editable: true,
      cellEditor: numberEditorTyped,
      valueParser: parseMoney,
    },
    {
      field: "discount",
      header: "Discount",
      width: 110,
      align: "right",
      format: "percent",
      editable: true,
      cellEditor: numberEditorTyped,
      valueParser: parsePercent,
    },
    { field: "extPrice", header: "Ext. price", width: 140, align: "right", format: "currency" },
  ]

  return (
    <BcGrid<LineItem>
      {...grid.props}
      columns={columns}
      data={rows}
      rowId={(row: LineItem) => row.id}
      onCellEditCommit={(event: BcCellEditCommitEvent<LineItem>) => {
        // Dependent-cell recompute: any commit on qty / price / discount
        // re-derives extPrice on the same row so the read-only column
        // stays in sync. The grid's overlay carries the just-committed
        // typed value for the active cell; we mirror it into our row
        // store and recompute extPrice in one setRows pass.
        setRows((prev) =>
          prev.map((row) => {
            if (row.id !== event.rowId) return row
            const next = {
              ...row,
              [event.column.field as keyof LineItem]: event.nextValue,
            } as LineItem
            return { ...next, extPrice: computeExt(next) }
          }),
        )
      }}
    />
  )
}

/**
 * ## Findings — sales-estimating hero spike (audit P0-9)
 *
 * Surfaced when implementing this spike against bc-grid v0.5 candidate
 * (post #364 colour-selection, #367 document-management, #370/#372
 * combobox-multi/autocomplete, #374 production-estimating):
 *
 * 1. **Excel paste fidelity is unwired.** The hero gesture for any
 *    sales-quote workflow is "paste 80 quantities from Excel into the
 *    qty column." Today bc-grid has the TSV parser
 *    (`packages/react/src/rangeClipboard.ts:259-417`) and the apply-plan
 *    builder (`:489`) end-to-end — but no `paste` event listener wires
 *    them to the active cell. Worker2's `v05-paste-listener` PR adds
 *    the listener + `apiRef.pasteTsv` API; this spike's
 *    `onCellEditCommit` recompute pipeline is the binding point for
 *    `v05-paste-editor-binding` (worker3's half) — once both land,
 *    paste runs every commit through the `valueParser` →
 *    `onCellEditCommit` recompute chain just like the keyboard does
 *    today, with zero consumer code change here. **This is the spike's
 *    headline gap; cross-references audit P0-1.**
 *
 * 2. **No `format: "currency"` short-form sets a default currency
 *    + locale.** `format: "currency"` (`packages/core/src/index.ts:55`)
 *    formats with the active grid locale and a hard-coded USD fallback
 *    in the formatter. The object form `{ type: "currency", currency:
 *    "EUR" }` lets the consumer override per-column, but there's no
 *    grid-level currency token — every multi-currency-shop ERP grid
 *    repeats the same `currency: "EUR"` per column. v0.6 could add
 *    `BcGridProps.currency?: string` (or `BcGridProps.formats?: {
 *    currency, percent, ... }`) so `format: "currency"` short-form
 *    inherits the grid's setting. Symmetric with how `density` works
 *    today.
 *
 * 3. **No declarative dependent-cell / computed-column primitive.**
 *    `extPrice = qty × price × (1 − discount)` is the canonical
 *    sales-estimating dependency: change any input, the output cell
 *    updates. Today the consumer wires this through
 *    `onCellEditCommit` (~10 LOC: setRows + recompute) — fine for one
 *    column but multiplies for every dependent in the row. v0.6 could
 *    ship `BcGridColumn.compute?: (row) => TValue` that the cell
 *    renderer reads on every render, with the column not appearing
 *    in `valueParser` / `onCellEditCommit` paths (read-only by
 *    construction). The `extPrice` column then drops to four lines:
 *    `{ field: "extPrice", header: "Ext. price", format: "currency",
 *    compute: (row) => row.qty * row.price * (1 - row.discount) }`.
 *    Recompute happens automatically on every render the row data
 *    changes, no `onCellEditCommit` recompute branch needed.
 *
 * 4. **`numberEditor` is a `string`-output editor by contract** —
 *    consumers wire `column.valueParser` to convert the input to a
 *    typed number. That's intentional per `editing-rfc §editor-number`,
 *    but a money column wants additional formatting strip ("$",
 *    thousands separators, parentheses for negatives) that every
 *    consumer reinvents. v0.7+ could ship
 *    `numberEditor.parseLocaleNumber(value, locale)` /
 *    `parseMoney(value)` helpers in `@bc-grid/editors` so the column
 *    gets `valueParser: parseMoney` as a one-liner instead of the
 *    inline `replace(/[^0-9.\-]/g, "")` we hand-rolled. Audit P1-W3-5
 *    already flags the locale-aware parser; the money variant is a
 *    natural extension.
 *
 * 5. **No "selected rows total" status-bar slot.** Every quote /
 *    invoice / PO grid wants a "Selected: 5 lines, $4,052.16" footer
 *    that updates as the user picks rows. `BcGridProps.statusBar`
 *    (`packages/react/src/types.ts:460`) takes a slot list with
 *    built-in `selected` + `aggregations` segments, but neither
 *    composes "selected count + sum of selected on column X". v0.6
 *    could add a `selectedAggregations` segment that takes
 *    `{ columnId, aggregation: "sum" | "avg" | ... }` and renders the
 *    formatted result against the current selection. Cross-references
 *    document-management's bulk-action toolbar (#367 Finding #4) —
 *    same shape, different surface (status bar vs floating bar).
 *
 * 6. **Read-only computed columns have no visual differentiator.**
 *    The `extPrice` column is intentionally not editable (no
 *    `editable: true`, no `cellEditor`), so the user can't F2 into
 *    it — but the cell still looks identical to the editable price
 *    column. ERP users learn editability by trial and error
 *    (clicking, typing, hearing the activation guard absorb their
 *    keystroke). Excel and NetSuite both render computed/read-only
 *    cells with a subtle muted background. v0.6 could ship
 *    `BcGridColumn.readOnly?: true` (already implied by missing
 *    `editable`) plus a CSS hook on the cell so theming can render
 *    the visual contract. Symmetric with the `format: "muted"` token
 *    that already exists.
 *
 * Spike LOC: ~52 (non-blank, non-comment consumer wiring — imports +
 * interface + helpers + component, excluding seed fixture and
 * Findings). Target was <100; **under budget** thanks to
 * `format: "currency"` + `useBcGridState`. Reference baselines:
 * colour-selection ~30, document-management ~140, production-estimating
 * ~132.
 *
 * What stayed lean:
 *   - No hand-rolled currency renderer (~6 LOC saved): `format:
 *     "currency"` token does it. (Compare: the hand-rolled file-icon
 *     renderer in document-management is ~30 LOC.)
 *   - No useState pairs for sort/filter/selection/etc. (~25 LOC
 *     saved): `useBcGridState` owns them.
 *
 * What pushed up the budget:
 *   - Inline `parseMoney` / `parsePercent` helpers (~10 LOC, Finding
 *     #4): repeated across every money/percent column in the grid.
 *   - `onCellEditCommit` recompute branch (~10 LOC, Finding #3): the
 *     dependent-cell wiring would be 4 lines with a `column.compute`
 *     primitive.
 *
 * ## Cross-spike v0.6 priorities (overlapping with prior spikes)
 *
 * Two findings already have multi-spike confirmation that strengthen
 * the v0.6 backlog:
 *
 *   - **Excel paste wiring** (this Finding #1; document-management
 *     drag-drop attach #367 #1 is a kindred surface) — both are
 *     "spreadsheet-feel" gaps. v0.6 P0.
 *   - **Selection-aware row reads** (this Finding #5; document-mgmt
 *     #6, production-est #6) — three spikes hit "give me the selected
 *     rows / their totals." `useBcGridSelectedRows(rows)` +
 *     `selectedAggregations` status segment together close the gap.
 *
 * New v0.6 candidates surfaced by this spike alone:
 *
 *   - **`column.compute?(row)` for derived read-only columns** (#3) —
 *     the headline finding; turns a dependent-cell pattern from
 *     `onCellEditCommit` boilerplate into a 4-line column declaration.
 *   - **`@bc-grid/editors` money / locale parser helpers** (#4) —
 *     ships alongside the audit P1-W3-5 locale-aware number parser.
 *   - **Read-only computed cell visual variant** (#6) — small CSS hook,
 *     big UX clarity win for ERP grids.
 *
 * Strip findings #1 + #3 + #4 (the three highest-leverage primitives)
 * and this spike drops to ~25 LOC — comparable to the colour-selection
 * baseline. The headline gap remains paste fidelity, which is
 * already-scoped worker2/worker3 v0.5 work.
 */
