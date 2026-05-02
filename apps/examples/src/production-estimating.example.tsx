import { dateEditor } from "@bc-grid/editors"
import {
  type BcCellEditCommitEvent,
  type BcCellEditor,
  BcGrid,
  type BcGridColumn,
  useBcGridApi,
  useBcGridState,
} from "@bc-grid/react"
import { useMemo, useState } from "react"

/**
 * Hero spike — Production Estimating (audit-2026-05 P0-9 / synthesis
 * hero track). Demonstrates a believable ERP "purchase orders +
 * scheduling" grid: parent PO rows containing 2-6 child line items,
 * outline-style indent rendering, and a multi-row "shift schedule"
 * toolbar driven by `apiRef.startEdit` / `commitEdit` (#361).
 *
 *   1. Sales estimating (numeric edit, paste) — separate spike.
 *   2. **Production estimating (this spike).**
 *   3. Colour selections — landed in `colour-selection.example.tsx` (#364).
 *   4. Document management — landed in `document-management.example.tsx` (#367).
 *
 * Goal per the synthesis sprint plan: <100 LOC of consumer code.
 * This file (excluding the data fixture + Findings JSDoc) lands at
 * **~132 LOC of consumer wiring** (non-blank, non-comment, after
 * biome formatting) — over the 100-LOC budget but **on par with
 * document-management's 132**. Three findings drive the inflation;
 * each is a concrete v0.6 ergonomics target. Drag-to-reorder with
 * hierarchy constraints was scoped out per the task brief because
 * the absent row-level drag/drop hooks (also flagged by
 * document-management — Finding #1 there) would blow the budget
 * further. That overlap is a strong v0.6 signal.
 */

interface Row {
  id: string
  parentId?: string
  poNumber: string
  vendor: string
  status: "draft" | "sent" | "confirmed"
  scheduled: string
  qtyNeeded: number
  expectedReceipt: string
  notes: string
}

const SEED: Row[] = [
  {
    id: "po1",
    poNumber: "PO-1042",
    vendor: "Northwood Lumber",
    status: "confirmed",
    scheduled: "2026-05-04",
    qtyNeeded: 0,
    expectedReceipt: "2026-05-11",
    notes: "Maple stock for shop floor",
  },
  {
    id: "po1-l1",
    parentId: "po1",
    poNumber: "L-001",
    vendor: "Northwood Lumber",
    status: "confirmed",
    scheduled: "2026-05-04",
    qtyNeeded: 240,
    expectedReceipt: "2026-05-11",
    notes: "4/4 hard maple, S2S",
  },
  {
    id: "po1-l2",
    parentId: "po1",
    poNumber: "L-002",
    vendor: "Northwood Lumber",
    status: "confirmed",
    scheduled: "2026-05-04",
    qtyNeeded: 80,
    expectedReceipt: "2026-05-11",
    notes: "5/4 hard maple, RGH",
  },
  {
    id: "po2",
    poNumber: "PO-1043",
    vendor: "Apex Hardware",
    status: "sent",
    scheduled: "2026-05-06",
    qtyNeeded: 0,
    expectedReceipt: "2026-05-13",
    notes: "Drawer slides + pulls",
  },
  {
    id: "po2-l1",
    parentId: "po2",
    poNumber: "L-001",
    vendor: "Apex Hardware",
    status: "sent",
    scheduled: "2026-05-06",
    qtyNeeded: 120,
    expectedReceipt: "2026-05-13",
    notes: "Blum Movento 21 in.",
  },
  {
    id: "po2-l2",
    parentId: "po2",
    poNumber: "L-002",
    vendor: "Apex Hardware",
    status: "sent",
    scheduled: "2026-05-06",
    qtyNeeded: 240,
    expectedReceipt: "2026-05-13",
    notes: "Brushed nickel pulls",
  },
  {
    id: "po2-l3",
    parentId: "po2",
    poNumber: "L-003",
    vendor: "Apex Hardware",
    status: "sent",
    scheduled: "2026-05-06",
    qtyNeeded: 60,
    expectedReceipt: "2026-05-13",
    notes: "Soft-close hinges",
  },
  {
    id: "po3",
    poNumber: "PO-1044",
    vendor: "Cascade Finishes",
    status: "draft",
    scheduled: "2026-05-08",
    qtyNeeded: 0,
    expectedReceipt: "2026-05-19",
    notes: "Conversion varnish + sealer",
  },
  {
    id: "po3-l1",
    parentId: "po3",
    poNumber: "L-001",
    vendor: "Cascade Finishes",
    status: "draft",
    scheduled: "2026-05-08",
    qtyNeeded: 12,
    expectedReceipt: "2026-05-19",
    notes: "Pre-cat lacquer, gallon",
  },
  {
    id: "po3-l2",
    parentId: "po3",
    poNumber: "L-002",
    vendor: "Cascade Finishes",
    status: "draft",
    scheduled: "2026-05-08",
    qtyNeeded: 6,
    expectedReceipt: "2026-05-19",
    notes: "Vinyl sealer, gallon",
  },
  {
    id: "po4",
    poNumber: "PO-1045",
    vendor: "Heartland Veneers",
    status: "confirmed",
    scheduled: "2026-05-11",
    qtyNeeded: 0,
    expectedReceipt: "2026-05-22",
    notes: "White oak veneer sheets",
  },
  {
    id: "po4-l1",
    parentId: "po4",
    poNumber: "L-001",
    vendor: "Heartland Veneers",
    status: "confirmed",
    scheduled: "2026-05-11",
    qtyNeeded: 48,
    expectedReceipt: "2026-05-22",
    notes: "Rift-cut, 4x8",
  },
  {
    id: "po4-l2",
    parentId: "po4",
    poNumber: "L-002",
    vendor: "Heartland Veneers",
    status: "confirmed",
    scheduled: "2026-05-11",
    qtyNeeded: 12,
    expectedReceipt: "2026-05-22",
    notes: "Quartersawn, 4x8",
  },
  {
    id: "po5",
    poNumber: "PO-1046",
    vendor: "Sierra Steel",
    status: "sent",
    scheduled: "2026-05-13",
    qtyNeeded: 0,
    expectedReceipt: "2026-05-24",
    notes: "Brackets + fasteners",
  },
  {
    id: "po5-l1",
    parentId: "po5",
    poNumber: "L-001",
    vendor: "Sierra Steel",
    status: "sent",
    scheduled: "2026-05-13",
    qtyNeeded: 200,
    expectedReceipt: "2026-05-24",
    notes: "L-brackets, blackened",
  },
  {
    id: "po5-l2",
    parentId: "po5",
    poNumber: "L-002",
    vendor: "Sierra Steel",
    status: "sent",
    scheduled: "2026-05-13",
    qtyNeeded: 1000,
    expectedReceipt: "2026-05-24",
    notes: "#10 wood screws, 2 in.",
  },
  {
    id: "po6",
    poNumber: "PO-1047",
    vendor: "Northwood Lumber",
    status: "draft",
    scheduled: "2026-05-15",
    qtyNeeded: 0,
    expectedReceipt: "2026-05-26",
    notes: "Walnut for executive run",
  },
  {
    id: "po6-l1",
    parentId: "po6",
    poNumber: "L-001",
    vendor: "Northwood Lumber",
    status: "draft",
    scheduled: "2026-05-15",
    qtyNeeded: 60,
    expectedReceipt: "2026-05-26",
    notes: "8/4 walnut, RGH",
  },
  {
    id: "po6-l2",
    parentId: "po6",
    poNumber: "L-002",
    vendor: "Northwood Lumber",
    status: "draft",
    scheduled: "2026-05-15",
    qtyNeeded: 120,
    expectedReceipt: "2026-05-26",
    notes: "4/4 walnut, S2S",
  },
]

const shiftDate = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const DEFAULT_EXPANSION = new Set(SEED.filter((r) => !r.parentId).map((r) => r.id))

export function ProductionEstimatingExample() {
  const [rows, setRows] = useState<Row[]>(SEED)
  const grid = useBcGridState({
    persistTo: "local:production-estimating",
    defaults: { expansion: DEFAULT_EXPANSION },
  })
  const apiRef = useBcGridApi<Row>()
  const [shiftDays, setShiftDays] = useState(1)
  const selectedIds =
    grid.state.selection.mode === "explicit" ? [...grid.state.selection.rowIds] : []

  // Workaround for Findings #1+#3: no client tree row model, so we
  // hand-filter against `state.expansion` (parent expanded = id in set).
  const visibleRows = useMemo(
    () => rows.filter((r) => !r.parentId || grid.state.expansion.has(r.parentId)),
    [rows, grid.state.expansion],
  )

  const columns: BcGridColumn<Row>[] = [
    {
      field: "poNumber",
      header: "PO #",
      width: 200,
      cellRenderer: ({ value, row }) => {
        if (row.parentId) return <span style={{ paddingLeft: "1.5rem" }}>{value as string}</span>
        const expanded = grid.state.expansion.has(row.id)
        return (
          <button
            type="button"
            onClick={() => {
              const next = new Set(grid.state.expansion)
              if (expanded) next.delete(row.id)
              else next.add(row.id)
              grid.dispatch.setExpansion(next)
            }}
            style={{ background: "transparent", border: 0, cursor: "pointer", fontWeight: 600 }}
          >
            {expanded ? "▾" : "▸"} {value as string}
          </button>
        )
      },
    },
    { field: "vendor", header: "Vendor", flex: 1 },
    { field: "status", header: "Status", width: 110 },
    {
      field: "expectedReceipt",
      header: "Expected receipt",
      width: 160,
      editable: true,
      cellEditor: dateEditor as BcCellEditor<Row, unknown>,
    },
    { field: "scheduled", header: "Scheduled", width: 140 },
    { field: "qtyNeeded", header: "Qty needed", width: 110, align: "right" },
    { field: "notes", header: "Notes", flex: 2 },
  ]

  // Multi-row shift. Workaround for Finding #4: `commitEdit({ value })`
  // only commits the active edit on one cell, so we exercise the api on
  // the first row and patch the rest directly. A `applyRowPatches` api
  // would unify both branches into a single typed-commit call.
  const applyShift = () => {
    const [first, ...rest] = selectedIds as string[]
    if (first) {
      apiRef.current?.startEdit(first, "expectedReceipt")
      apiRef.current?.commitEdit({
        value: shiftDate(rows.find((r) => r.id === first)?.expectedReceipt ?? "", shiftDays),
      })
    }
    setRows((prev) =>
      prev.map((r) =>
        rest.includes(r.id)
          ? { ...r, expectedReceipt: shiftDate(r.expectedReceipt, shiftDays) }
          : r,
      ),
    )
  }

  return (
    <div>
      {selectedIds.length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", padding: "0.5rem" }}>
          <span>{selectedIds.length} selected</span>
          <label>
            Shift by{" "}
            <input
              type="number"
              value={shiftDays}
              onChange={(e) => setShiftDays(Number.parseInt(e.currentTarget.value, 10) || 0)}
              style={{ width: "4rem" }}
            />{" "}
            days
          </label>
          <button type="button" onClick={applyShift}>
            Apply
          </button>
        </div>
      )}
      <BcGrid<Row>
        {...grid.props}
        apiRef={apiRef}
        columns={columns}
        data={visibleRows}
        rowId={(row: Row) => row.id}
        checkboxSelection
        onCellEditCommit={(event: BcCellEditCommitEvent<Row>) => {
          setRows((prev) =>
            prev.map((r) =>
              r.id === event.rowId ? { ...r, [event.column.field as string]: event.nextValue } : r,
            ),
          )
        }}
      />
    </div>
  )
}

/**
 * ## Findings — production-estimating hero spike (audit P0-9)
 *
 * Surfaced when implementing this spike against bc-grid v0.5 candidate
 * (post #364 colour-selection, #367 document-management):
 *
 * 1. **No client-side tree / parent-child row model.** The only tree
 *    surface is `BcServerTreeProps` (`packages/react/src/types.ts:651`)
 *    — server-side, with `loadChildren` / `loadRoots` callbacks. Every
 *    production-estimating ERP grid is parent (PO) + child (lines)
 *    + child-of-child (revisions) — that's the dominant shape. The
 *    spike works around the gap by carrying `parentId?` on the row
 *    type, hand-filtering visible rows against `state.expansion`, and
 *    indenting via a `cellRenderer` (~22 LOC of workaround). v0.6
 *    should ship a client tree row model: `treeData?: true`,
 *    `getRowParentId?: (row) => RowId | undefined` (or
 *    `getDataPath?: (row) => string[]`), and an outline column
 *    renderer that handles the chevron + indent + level. Mirror the
 *    existing `groupBy` plumbing — same `expansion` state, same
 *    `expandAll` / `collapseAll` apis.
 *
 * 2. **Row grouping doesn't fit production-estimating's shape.**
 *    `buildGroupedRowModel` (`packages/react/src/grouping.ts:30`)
 *    groups by *field value* and synthesises group-header rows from
 *    that bucket — but a PO is a *real row* with its own status,
 *    vendor, scheduled date, and notes that needs to render and edit
 *    like any other row. The synthetic `kind: "group"` row carries
 *    no row data, only an aggregate label. Trying to use grouping
 *    for parent/child here would force the consumer to invent a
 *    sentinel "PO header" data row in the grouped value column,
 *    which collides with the children's own column values. Tree row
 *    model (Finding #1) is the right primitive; row-grouping is for
 *    "show me totals by region", not "show me POs and their lines".
 *
 * 3. **No outline / indent column variant.** Even with a row tree
 *    model, the consumer would still need an "outline column" — the
 *    one column that owns the chevron, the indent, and the row-kind
 *    badge. Today there's no such formatter; we hand-rolled it in
 *    the `poNumber` `cellRenderer` (~18 LOC). v0.6 could ship
 *    `BcGridColumn.outline?: true` (or `format: "outline"`) on the
 *    column, and the grid renders the chevron + indent + row-kind
 *    indicator from `rowState` automatically. Symmetric with the
 *    swatch (#364) and file-icon (#367) cell variants.
 *
 * 4. **`apiRef.commitEdit({ value })` only commits one cell at a
 *    time, and the grid must already be editing.** For a multi-row
 *    "shift +N days" workflow we have to either (a) loop start/commit
 *    one-row-at-a-time and wait between — async, racy, painful —
 *    or (b) bypass the editor api and patch the row data directly
 *    (what the spike does for rows 2..N). The api works as a
 *    one-shot programmatic editor activator, not a bulk update
 *    primitive. v0.6 should ship `apiRef.applyRowPatches(patches:
 *    Array<{ rowId, columnId, value }>): Promise<void>` that runs
 *    each patch through `valueParser` + `validate` + the overlay
 *    update pipeline without mounting the editor portal — same
 *    semantics as a typed commit, but vectorised. This is the
 *    primitive every "fill down", "shift dates", "set status to
 *    confirmed" toolbar wants. Cross-references with
 *    document-management's "select all failed → retry" use case
 *    (#367 Finding #6).
 *
 * 5. **No row-level drag/drop hooks** (overlap with #367 Finding #1
 *    — strong v0.6 signal). The task brief asked for drag-to-reorder
 *    with hierarchy constraints (children stay inside their parent;
 *    parents can't drop into another parent). Today the consumer
 *    would need to (a) add their own `data-row-id` attribute scrape,
 *    (b) wire HTML5 DnD events on the grid root, (c) compute the
 *    drop target from `event.clientY` against measured row rects,
 *    and (d) reject invalid drops in JS — easily 60+ LOC of
 *    workaround for a single grid. We scoped it out of this spike
 *    to hold the LOC budget. v0.6 should ship `onRowDragStart` /
 *    `onRowDragOver` / `onRowDrop` callbacks on `BcGridProps`, plus
 *    a `data-bc-grid-row-id` attribute on the row element. Two
 *    independent ERP hero use cases (document attach, PO line
 *    reorder) flagged the same gap — promote to v0.6 P0.
 *
 * 6. **`BcSelection` discriminated-union narrowing** (overlap with
 *    #367 Finding #3). Same `mode === "explicit"` defensive narrow
 *    here as in document-management. The bulk-action toolbar above
 *    the grid runs identical logic. Cross-spike repetition is the
 *    smoking gun: ship `useBcGridSelectedRowIds(rows)` (or expose it
 *    on the dispatch) and every consumer that reads selection in a
 *    toolbar drops two lines.
 *
 * Spike LOC: ~132 (non-blank, non-comment consumer wiring — imports
 * + interface + helpers + component, excluding seed fixture and
 * Findings). Target was <100; document-management baseline 132;
 * colour-selection baseline 30.
 *
 * What pushed over the 100 budget:
 *   - Outline cell renderer (~17 LOC, Finding #3): chevron toggle +
 *     indent + bold label, hand-rolled because there's no outline
 *     column variant.
 *   - Manual visible-row filtering (~5 LOC, Finding #1): `useMemo`
 *     filter against `state.expansion` because there's no client
 *     tree row model.
 *   - Multi-row date-shift toolbar (~25 LOC, Finding #4 + #6): the
 *     same pattern document-management used for bulk delete.
 *
 * What was scoped out to hold the budget:
 *   - Drag-to-reorder with hierarchy constraints (~60 LOC, Finding
 *     #5). The brief expected this to surface the missing primitive,
 *     not actually ship it. Documented as the highest-impact v0.6
 *     gap because it overlaps with document-management's drop-attach
 *     workflow.
 *
 * ## Cross-spike v0.6 priorities (overlapping findings)
 *
 * Three findings now have two-spike confirmation:
 *
 *   - **Row-level drag/drop hooks** (#367 #1, this #5) — drop attach
 *     and tree reorder both need it. Strong P0.
 *   - **`BcSelection` ergonomic narrowing** (#367 #3, this #6) —
 *     every bulk-action toolbar repeats the same defensive cast.
 *     Trivial helper, big consumer-LOC win.
 *   - **Bulk patch / fill primitive** (#367 #6 implied, this #4
 *     explicit) — document-mgmt wanted "select failed → retry";
 *     production-est wants "select rows → shift dates". Same shape:
 *     a vectorised typed-commit api. P0.
 *
 * Strip those three and the next consumer-grid hero spike (sales
 * estimating, the fourth track) should land at ~30 LOC like
 * colour-selection, not ~100.
 */
