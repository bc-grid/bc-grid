# Row Drag and Drop

`<BcGrid onRowDragOver onRowDrop>` enables HTML5 native drag-and-drop on row elements. Doc-management spike (#367) finding #1 + production-estimating spike (#374) finding #5: every consumer with sortable manual ordering, drag-into-folder, or drag-to-reassign-status hand-rolls the same DnD wiring outside the grid. This recipe pulls it inside.

The grid does **not** mutate `data` on its own — the consumer reorders / re-parents / re-ranks in their own state when `onRowDrop` fires. That keeps the contract symmetric with how `<BcServerGrid>` treats the row model: row ordering is consumer-owned.

```tsx
import {
  type BcRowDragOverHandler,
  type BcRowDropHandler,
  BC_GRID_ROW_DRAG_MIME,
  BcGrid,
} from "@bc-grid/react"
```

## Public surface

```ts
type BcRowDropAction = "before" | "after" | "into" | "none"

interface BcRowDragOverEvent<TRow> {
  row: TRow                          // the hovered row
  rowId: RowId
  sourceRowIds: readonly RowId[]     // every dragged row id (multi-row drag)
  event: ReactDragEvent<HTMLElement> // the underlying native event
}

type BcRowDragOverHandler<TRow> = (event: BcRowDragOverEvent<TRow>) => BcRowDropAction

interface BcRowDropEvent<TRow> {
  row: TRow                          // the hovered row at drop time
  rowId: RowId
  sourceRowIds: readonly RowId[]
  position: BcRowDropAction          // last value returned by onRowDragOver
  event: ReactDragEvent<HTMLElement>
}

type BcRowDropHandler<TRow> = (event: BcRowDropEvent<TRow>) => void

interface BcGridProps<TRow> {
  onRowDragOver?: BcRowDragOverHandler<TRow>
  onRowDrop?: BcRowDropHandler<TRow>
  onRowDragStart?: (
    row: TRow,
    sourceRowIds: readonly RowId[],
    event: ReactDragEvent<HTMLElement>,
  ) => void
}
```

When you wire either `onRowDragOver` or `onRowDrop`, the grid:

1. Marks every data row `draggable={true}` (group rows + disabled rows are not draggable).
2. Drags the **whole selection** if the drag origin is inside it — multi-row drag — otherwise drags just the origin row. Mirrors macOS Finder + VS Code.
3. Writes `sourceRowIds` to `dataTransfer` under the `BC_GRID_ROW_DRAG_MIME` MIME (`"application/x-bc-grid-rows"`) so cross-grid drops work; also writes a comma-joined plain-text fallback.
4. Mirrors the live drop position to `data-bc-grid-row-drop="<position>"` on the hovered row so theme CSS can paint indicators (top/bottom border line for before/after; row highlight for into).
5. Auto-scrolls the viewport when the pointer is within ~48px of the top/bottom edge during a drag.

## Pattern 1 — Task list reorder

The classic "drag a row up or down to reorder" pattern. Reject `"into"` because tasks aren't containers; only `"before"` and `"after"` make sense.

```tsx
function TaskList() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)

  const handleDragOver: BcRowDragOverHandler<Task> = ({ rowId, sourceRowIds, event }) => {
    // Reject drop on the dragged row itself (no-op move).
    if (sourceRowIds.includes(rowId)) return "none"
    // Use the geometry-default position the grid computed by reading
    // the rect; for a flat list we want before/after only.
    const rect = event.currentTarget.getBoundingClientRect()
    const offset = event.clientY - rect.top
    return offset < rect.height / 2 ? "before" : "after"
  }

  const handleDrop: BcRowDropHandler<Task> = ({ rowId, sourceRowIds, position }) => {
    setTasks((prev) => reorderRows(prev, sourceRowIds, rowId, position))
  }

  return (
    <BcGrid
      data={tasks}
      columns={taskColumns}
      rowId={(row) => row.id}
      onRowDragOver={handleDragOver}
      onRowDrop={handleDrop}
    />
  )
}

function reorderRows<T extends { id: string }>(
  rows: readonly T[],
  sourceIds: readonly string[],
  targetId: string,
  position: "before" | "after" | "into" | "none",
): T[] {
  if (position === "none" || position === "into") return [...rows]
  const sourceSet = new Set(sourceIds)
  const moving = rows.filter((r) => sourceSet.has(r.id))
  const remaining = rows.filter((r) => !sourceSet.has(r.id))
  const targetIdx = remaining.findIndex((r) => r.id === targetId)
  if (targetIdx === -1) return [...rows]
  const insertAt = position === "before" ? targetIdx : targetIdx + 1
  return [...remaining.slice(0, insertAt), ...moving, ...remaining.slice(insertAt)]
}
```

## Pattern 2 — Drag into folder (tree)

When the row model is a tree, `"into"` means re-parent. Reject before/after across folders if the consumer's data model only supports drop-on-folder.

```tsx
const handleFolderDragOver: BcRowDragOverHandler<TreeRow> = ({ row, sourceRowIds, event }) => {
  if (sourceRowIds.includes(row.id)) return "none"
  // Folders accept "into"; leaves accept before/after only.
  if (row.kind === "folder") {
    return "into"
  }
  const rect = event.currentTarget.getBoundingClientRect()
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after"
}

const handleFolderDrop: BcRowDropHandler<TreeRow> = ({ row, sourceRowIds, position }) => {
  if (position === "into") {
    setTree((prev) => moveIntoFolder(prev, sourceRowIds, row.id))
  } else if (position === "before" || position === "after") {
    setTree((prev) => reorderUnderParent(prev, sourceRowIds, row.id, position))
  }
}
```

## Pattern 3 — Drag to reassign status (cross-grid swimlanes)

Two grids sharing a status board: drag a row from "Todo" to "Done." Use the `BC_GRID_ROW_DRAG_MIME` payload on the second grid's `onRowDrop` to read the source rowIds.

```tsx
const handleDoneGridDrop: BcRowDropHandler<Task> = ({ sourceRowIds }) => {
  // Mark every dragged row as done in the consumer's source-of-truth.
  setTasks((prev) =>
    prev.map((t) => (sourceRowIds.includes(t.id) ? { ...t, status: "done" } : t)),
  )
}
```

For external drop targets outside any bc-grid (e.g. a "delete" trash zone in the page chrome), parse the payload directly:

```tsx
function TrashDropZone({ onDelete }: { onDelete: (rowIds: string[]) => void }) {
  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(BC_GRID_ROW_DRAG_MIME)) {
          e.preventDefault()
          e.dataTransfer.dropEffect = "move"
        }
      }}
      onDrop={(e) => {
        const payload = e.dataTransfer.getData(BC_GRID_ROW_DRAG_MIME)
        const rowIds = payload ? (JSON.parse(payload) as string[]) : []
        if (rowIds.length > 0) onDelete(rowIds)
      }}
    >
      🗑 Drop to delete
    </div>
  )
}
```

## Styling the drop indicator

The grid sets `data-bc-grid-row-drop="<position>"` on the hovered row. Paint indicators in your theme:

```css
.bc-grid-row[data-bc-grid-row-drop="before"] {
  box-shadow: inset 0 2px 0 0 var(--bc-grid-accent);
}
.bc-grid-row[data-bc-grid-row-drop="after"] {
  box-shadow: inset 0 -2px 0 0 var(--bc-grid-accent);
}
.bc-grid-row[data-bc-grid-row-drop="into"] {
  background: color-mix(in srgb, var(--bc-grid-accent) 12%, transparent);
}
```

`@bc-grid/theming` ships defaults; override these selectors to match your design system.

## When NOT to use

- **Sortable columns / column reorder.** That's column-level DnD wired via `<BcGrid columnState>` + the column tool panel (`packages/react/src/columnToolPanel.tsx`). This recipe is for ROW reordering / re-parenting.
- **Server-paged grids.** Row DnD assumes the consumer can locally reorder the visible row set; with paged data, dragging across page boundaries is undefined. Keep DnD scoped to client-rowmodel grids or single-page server views.
- **Touch primary devices.** HTML5 native DnD has poor touch support. For touch-first UX, consider a long-press-and-drag library; the grid's HTML5 wiring is desktop-first.
