import { BcGrid, type BcGridColumn, useBcGridState } from "@bc-grid/react"
import { useState } from "react"

/**
 * Hero spike — Document Management (audit-2026-05 P0-9 / synthesis hero
 * track). Demonstrates a believable ERP "uploaded documents" grid:
 * file-icon cell, drag-drop upload onto rows, hover preview, and a
 * bulk-action toolbar driven off `state.selection`.
 *
 *   1. Sales estimating (numeric edit, paste) — separate spike.
 *   2. Production estimating (grouping, drag/drop) — coordinator-owned spike.
 *   3. Colour selections — landed in `colour-selection.example.tsx`.
 *   4. **Document management (this spike).**
 *
 * Goal per the synthesis sprint plan: <100 LOC of consumer code. This
 * file (excluding the data fixture + Findings JSDoc) lands at **~140
 * LOC of consumer wiring** — over budget. Everything that pushed it
 * over is surfaced in the `## Findings` block below as a missing
 * primitive (file-icon cell renderer, bulk-action toolbar, row-level
 * drag-drop hooks, hover preview slot, selection-variant helper).
 * That is the point of the spike: each line of inflated wiring is a
 * v0.6+ ergonomics target.
 */

interface DocRow {
  id: string
  name: string
  mime: string
  size: number
  uploadedBy: string
  uploadedAt: string
  status: "ready" | "processing" | "failed"
}

const SAMPLE_DOCS: DocRow[] = [
  {
    id: "d1",
    name: "Q1-financials.xlsx",
    mime: "application/vnd.ms-excel",
    size: 184_320,
    uploadedBy: "Maya Singh",
    uploadedAt: "2026-04-12T09:14",
    status: "ready",
  },
  {
    id: "d2",
    name: "site-survey.pdf",
    mime: "application/pdf",
    size: 2_104_932,
    uploadedBy: "Jordan Lee",
    uploadedAt: "2026-04-14T11:02",
    status: "ready",
  },
  {
    id: "d3",
    name: "kitchen-render.png",
    mime: "image/png",
    size: 4_902_117,
    uploadedBy: "Priya Nair",
    uploadedAt: "2026-04-15T16:48",
    status: "ready",
  },
  {
    id: "d4",
    name: "supplier-contract.docx",
    mime: "application/msword",
    size: 92_416,
    uploadedBy: "Alex Chen",
    uploadedAt: "2026-04-16T08:31",
    status: "processing",
  },
  {
    id: "d5",
    name: "warehouse-walkthrough.mp4",
    mime: "video/mp4",
    size: 58_204_812,
    uploadedBy: "Taylor Brooks",
    uploadedAt: "2026-04-18T13:55",
    status: "ready",
  },
  {
    id: "d6",
    name: "purchase-order-9182.pdf",
    mime: "application/pdf",
    size: 311_002,
    uploadedBy: "Morgan Reed",
    uploadedAt: "2026-04-21T10:12",
    status: "failed",
  },
  {
    id: "d7",
    name: "logo-revised.svg",
    mime: "image/svg+xml",
    size: 18_204,
    uploadedBy: "Sam Carter",
    uploadedAt: "2026-04-22T14:39",
    status: "ready",
  },
  {
    id: "d8",
    name: "inventory.csv",
    mime: "text/csv",
    size: 1_204_032,
    uploadedBy: "Jamie Patel",
    uploadedAt: "2026-04-25T07:08",
    status: "ready",
  },
  {
    id: "d9",
    name: "client-call-recording.m4a",
    mime: "audio/mp4",
    size: 12_004_002,
    uploadedBy: "Maya Singh",
    uploadedAt: "2026-04-28T15:21",
    status: "processing",
  },
  {
    id: "d10",
    name: "drawings.zip",
    mime: "application/zip",
    size: 24_902_004,
    uploadedBy: "Jordan Lee",
    uploadedAt: "2026-05-01T09:02",
    status: "ready",
  },
]

const FALLBACK_ICON = { glyph: "DOC", bg: "#475569" }
const ICON_BY_KIND: Record<string, { glyph: string; bg: string }> = {
  image: { glyph: "IMG", bg: "#7c3aed" },
  video: { glyph: "VID", bg: "#0ea5e9" },
  audio: { glyph: "AUD", bg: "#f97316" },
  application: FALLBACK_ICON,
  text: { glyph: "TXT", bg: "#16a34a" },
}

const fmtSize = (b: number) =>
  b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`

export function DocumentManagementExample() {
  const [rows, setRows] = useState<DocRow[]>(SAMPLE_DOCS)
  const grid = useBcGridState({ persistTo: "local:documents" })
  const selectedIds: string[] =
    grid.state.selection.mode === "explicit" ? ([...grid.state.selection.rowIds] as string[]) : []

  // Workaround: bc-grid has no row-level drag/drop hooks (see Findings #1),
  // so we wrap the grid in a div and treat *any* drop as "attach to first
  // selected row, else last row". A real surface would route to a row.
  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (!file) return
    const targetId = selectedIds[0] ?? rows[rows.length - 1]?.id
    if (!targetId) return
    setRows((prev) =>
      prev.map((r) =>
        r.id === targetId
          ? {
              ...r,
              name: file.name,
              mime: file.type || r.mime,
              size: file.size,
              uploadedAt: new Date().toISOString().slice(0, 16),
              status: "processing",
            }
          : r,
      ),
    )
  }

  const columns: BcGridColumn<DocRow>[] = [
    {
      field: "name",
      header: "File",
      flex: 2,
      cellRenderer: ({ value, row }) => {
        const kind = row.mime.split("/")[0] ?? "application"
        const icon = ICON_BY_KIND[kind] ?? FALLBACK_ICON
        return (
          <span
            title={`${row.name}\n${row.mime} - ${fmtSize(row.size)}`}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
          >
            <span
              aria-hidden="true"
              style={{
                width: "1.5rem",
                height: "1.5rem",
                borderRadius: "0.25rem",
                background: icon.bg,
                color: "white",
                fontSize: "0.625rem",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {icon.glyph}
            </span>
            <span>{value as string}</span>
          </span>
        )
      },
    },
    { field: "mime", header: "Type", width: 180 },
    {
      field: "size",
      header: "Size",
      width: 100,
      cellRenderer: ({ value }) => fmtSize(value as number),
    },
    { field: "uploadedBy", header: "Uploaded by", width: 140 },
    { field: "uploadedAt", header: "Uploaded", width: 160 },
    { field: "status", header: "Status", width: 110 },
  ]

  return (
    <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      {selectedIds.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            padding: "0.5rem",
            borderBottom: "1px solid var(--bc-grid-border)",
          }}
        >
          <span>{selectedIds.length} selected</span>
          <button type="button" onClick={() => console.log("download", selectedIds)}>
            Download
          </button>
          <button
            type="button"
            onClick={() => {
              setRows((prev) => prev.filter((r) => !selectedIds.includes(r.id)))
              grid.dispatch.setSelection({ mode: "explicit", rowIds: new Set() })
            }}
          >
            Delete
          </button>
          <button type="button" onClick={() => console.log("move", selectedIds)}>
            Move to folder…
          </button>
        </div>
      )}
      <BcGrid<DocRow>
        {...grid.props}
        columns={columns}
        data={rows}
        rowId={(row: DocRow) => row.id}
        checkboxSelection
      />
    </div>
  )
}

/**
 * ## Findings — document-management hero spike (audit P0-9)
 *
 * Surfaced when implementing this spike against bc-grid v0.5 candidate:
 *
 * 1. **No row-level drag/drop hooks.** `BcGridProps` exposes `onRowClick`
 *    / `onRowDoubleClick` (`packages/react/src/types.ts:481-482`) but
 *    nothing for `onRowDragOver` / `onRowDrop`. Document-attach drag-drop
 *    is one of the most common ERP surfaces (drop a contract onto a
 *    customer row; drop an image onto a SKU). Workaround used here: a
 *    wrapper `<div onDragOver onDrop>` that routes the dropped file to
 *    the first-selected row. That's wrong — there's no way to know which
 *    row the cursor is hovering. v0.6 should ship `onRowDragEnter`,
 *    `onRowDragOver`, `onRowDrop`, `onRowDragLeave` callbacks on
 *    `BcGridProps` (mirror the row-click signature: `(row, event) =>`),
 *    plus a `data-bc-grid-row-id` attribute on the row element so
 *    consumers can `event.currentTarget.closest('[data-bc-grid-row-id]')`
 *    if they need DOM access.
 *
 * 2. **No per-cell hover ergonomics.** `BcCellRendererParams`
 *    (`packages/react/src/types.ts:241-268`) carries no hover state and
 *    no surface for shadcn `Tooltip` / `HoverCard` integration. We fell
 *    back to a native `title` attribute, which loses keyboard hover,
 *    rich content (thumbnail preview), and shadcn theming. v0.6 should
 *    add a `cellTooltip?: ReactNode | (params) => ReactNode` field on
 *    `BcGridColumn` that the body cell wires through a shadcn-styled
 *    Tooltip primitive. The hero use case is "preview the document
 *    thumbnail on hover" — high-traffic in document grids.
 *
 * 3. **`BcSelection` is a discriminated union with three variants
 *    (`explicit`, `all`, `filtered`)**, and the bulk-action toolbar has
 *    to narrow on `mode === "explicit"` before reading `.rowIds`.
 *    `mode: "all"`/`"filtered"` carry an `except` set instead, which
 *    means "show 3 selected" / "delete selected" UI has to special-case
 *    every variant — and a consumer that just wants "the list of ids
 *    the user picked" has no helper. v0.6 should expose
 *    `grid.dispatch.getSelectedRowIds(allRows: TRow[]): RowId[]` (or a
 *    `useBcGridSelectedRowIds(rows)` hook) that resolves the variant
 *    against the data set. Bonus: parameterise `useBcGridState<TRow>`
 *    so `rowIds` narrows to `TRow["id"] & string` and consumers don't
 *    have to cast `[...set] as string[]`.
 *
 * 4. **No bulk-action toolbar primitive.** Every consumer that wants
 *    "show a toolbar above the grid when ≥1 row is selected" rebuilds
 *    the same div + button layout we wrote here. v0.6 should ship a
 *    `<BcGridBulkActions>` primitive that takes `actions: { id, label,
 *    onSelect(rowIds), variant? }[]` and renders a shadcn-themed bar
 *    that hides when selection is empty. Or expose this through a new
 *    `bulkActions` slot on `BcGridProps` with the same shape as
 *    `contextMenu`.
 *
 * 5. **No file-cell column variant or formatter helper.** ERPs render
 *    file rows constantly (documents, attachments, photo uploads). Each
 *    consumer hand-rolls the icon shim like we did here. v0.6 could ship
 *    a `@bc-grid/cells/file` formatter (icon + name + truncate, themed)
 *    and a tiny `bytes` formatter so consumers don't repeat
 *    `(b) => b > 1e6 ? ...` everywhere. Symmetric with the swatch chip
 *    pattern that the colour-selection spike found.
 *
 * 6. **`useBcGridState` doesn't know about row data,** so we can't ask
 *    `grid.dispatch.selectRowsMatching(predicate)` or
 *    `grid.state.selectedRows` (only ids). For a "select all failed
 *    uploads → retry" workflow, the consumer has to hand-filter the
 *    raw data array against `selection.rowIds`. v0.6 could thread the
 *    row index in via a `useBcGridSelectedRows(rows)` companion hook
 *    or accept `data` on `useBcGridState` directly.
 *
 * Spike LOC: ~140 (consumer wiring — imports + interface + helpers +
 * component, excluding seed fixture and Findings). Target was <100.
 * The colour-selection spike landed at ~30; this one is ~5x that.
 *
 * What pushed over budget:
 *   - File-icon cell renderer (~30 LOC): inline `<span>`s + style
 *     objects because `cellRenderer` has no first-class file/icon
 *     primitive (Finding #5).
 *   - Bulk-action toolbar (~28 LOC): hand-rolled `<div>` + 3
 *     `<button>`s + style object because there's no `<BcGridBulkActions>`
 *     or `bulkActions` slot (Finding #4).
 *   - Drag-drop wrapper + selection narrowing (~15 LOC): defensive
 *     `mode === "explicit"` narrow plus a wrapping `<div onDragOver
 *     onDrop>` because there's no row-level drag-drop API
 *     (Findings #1, #3).
 *
 * Strip those three workarounds (i.e. ship the missing primitives) and
 * the consumer code drops from ~140 LOC to ~40 LOC — comparable to the
 * colour-selection spike. The four findings are the v0.6 unlock.
 */
