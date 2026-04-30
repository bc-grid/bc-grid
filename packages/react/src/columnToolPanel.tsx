import type { BcColumnStateEntry, ColumnId } from "@bc-grid/core"
import { type ChangeEvent, type DragEvent, type ReactNode, useMemo, useState } from "react"
import { columnIdFor } from "./gridInternals"
import type { BcReactGridColumn, BcSidebarContext } from "./types"

const COLUMN_DRAG_MIME = "application/x-bc-grid-column"

export interface ColumnToolPanelItem {
  columnId: ColumnId
  groupable: boolean
  hidden: boolean
  hideDisabled: boolean
  label: string
  originalIndex: number
  pinned: "left" | "right" | null
  position: number
}

export function BcColumnsToolPanel<TRow>({
  context,
}: {
  context: BcSidebarContext<TRow>
}): ReactNode {
  const [query, setQuery] = useState("")
  const [dragColumnId, setDragColumnId] = useState<ColumnId | null>(null)
  const [dropTargetColumnId, setDropTargetColumnId] = useState<ColumnId | null>(null)
  const items = useMemo(
    () => buildColumnToolPanelItems(context.columns, context.columnState, context.groupableColumns),
    [context.columnState, context.columns, context.groupableColumns],
  )
  const visibleItems = useMemo(() => filterColumnToolPanelItems(items, query), [items, query])
  const itemsById = useMemo(() => new Map(items.map((item) => [item.columnId, item])), [items])
  const groupableIds = useMemo(
    () => new Set(items.filter((item) => item.groupable).map((item) => item.columnId)),
    [items],
  )
  const ungroupedGroupableItems = items.filter(
    (item) => item.groupable && !context.groupBy.includes(item.columnId),
  )

  const moveColumn = (columnId: ColumnId, offset: -1 | 1) => {
    context.setColumnState(moveColumnInToolPanel(items, context.columnState, columnId, offset))
  }

  const addGroupByColumn = (columnId: ColumnId) => {
    if (!groupableIds.has(columnId) || context.groupBy.includes(columnId)) return
    context.setGroupBy([...context.groupBy, columnId])
  }

  const draggedColumnId = dragColumnId
  const canDropOnGroupZone = draggedColumnId ? groupableIds.has(draggedColumnId) : false

  return (
    <section className="bc-grid-columns-panel">
      <h2 className="bc-grid-sidebar-panel-title">Columns</h2>
      <label className="bc-grid-columns-panel-search">
        <span className="bc-grid-columns-panel-label">Search columns</span>
        <input
          aria-label="Search columns"
          className="bc-grid-columns-panel-search-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <ul className="bc-grid-columns-panel-list" aria-label="Columns">
        {visibleItems.map((item) => {
          const checked = !item.hidden
          const grouped = context.groupBy.includes(item.columnId)
          const itemIndex = items.findIndex((entry) => entry.columnId === item.columnId)
          return (
            <li
              className="bc-grid-columns-panel-item"
              data-drop-target={dropTargetColumnId === item.columnId || undefined}
              draggable
              key={item.columnId}
              onDragEnd={() => {
                setDragColumnId(null)
                setDropTargetColumnId(null)
              }}
              onDragOver={(event) => {
                if (!dragColumnId || dragColumnId === item.columnId) return
                event.preventDefault()
                setDropTargetColumnId(item.columnId)
              }}
              onDragStart={(event) => {
                setDragColumnId(item.columnId)
                event.dataTransfer.setData(COLUMN_DRAG_MIME, item.columnId)
                event.dataTransfer.setData("text/plain", item.columnId)
                event.dataTransfer.effectAllowed = "move"
              }}
              onDrop={(event) => {
                event.preventDefault()
                const sourceColumnId =
                  dragColumnId ||
                  event.dataTransfer.getData(COLUMN_DRAG_MIME) ||
                  event.dataTransfer.getData("text/plain")
                setDragColumnId(null)
                setDropTargetColumnId(null)
                if (!sourceColumnId) return
                context.setColumnState(
                  reorderColumnInToolPanel(
                    items,
                    context.columnState,
                    sourceColumnId,
                    item.columnId,
                  ),
                )
              }}
            >
              <span aria-hidden="true" className="bc-grid-columns-panel-drag-handle">
                ::
              </span>
              <label className="bc-grid-columns-panel-visibility">
                <input
                  checked={checked}
                  disabled={item.hideDisabled}
                  type="checkbox"
                  onChange={(event) => {
                    context.setColumnState(
                      setColumnHidden(
                        context.columnState,
                        item.columnId,
                        !event.currentTarget.checked,
                      ),
                    )
                  }}
                />
                <span className="bc-grid-columns-panel-column-label">{item.label}</span>
              </label>
              <select
                aria-label={`Pin ${item.label}`}
                className="bc-grid-columns-panel-pin"
                value={item.pinned ?? ""}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  context.setColumnState(
                    setColumnPinned(
                      context.columnState,
                      item.columnId,
                      readPinnedValue(event.target.value),
                    ),
                  )
                }}
              >
                <option value="">None</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
              <div className="bc-grid-columns-panel-actions">
                <button
                  aria-label={`Move ${item.label} up`}
                  className="bc-grid-columns-panel-button"
                  disabled={itemIndex <= 0}
                  type="button"
                  onClick={() => moveColumn(item.columnId, -1)}
                >
                  Up
                </button>
                <button
                  aria-label={`Move ${item.label} down`}
                  className="bc-grid-columns-panel-button"
                  disabled={itemIndex < 0 || itemIndex === items.length - 1}
                  type="button"
                  onClick={() => moveColumn(item.columnId, 1)}
                >
                  Down
                </button>
                {item.groupable ? (
                  <button
                    aria-label={`Group by ${item.label}`}
                    className="bc-grid-columns-panel-button"
                    disabled={grouped}
                    type="button"
                    onClick={() => addGroupByColumn(item.columnId)}
                  >
                    Group
                  </button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>

      <section
        className="bc-grid-columns-panel-group-zone"
        data-drop-active={canDropOnGroupZone || undefined}
        aria-label="Group by columns"
        onDragOver={(event: DragEvent<HTMLElement>) => {
          if (!canDropOnGroupZone) return
          event.preventDefault()
        }}
        onDrop={(event: DragEvent<HTMLElement>) => {
          event.preventDefault()
          const sourceColumnId =
            dragColumnId ||
            event.dataTransfer.getData(COLUMN_DRAG_MIME) ||
            event.dataTransfer.getData("text/plain")
          setDragColumnId(null)
          setDropTargetColumnId(null)
          if (sourceColumnId) addGroupByColumn(sourceColumnId)
        }}
      >
        <h3 className="bc-grid-columns-panel-subtitle">Group by</h3>
        <ul className="bc-grid-columns-panel-groups" aria-label="Grouped columns">
          {context.groupBy.length === 0 ? (
            <li className="bc-grid-columns-panel-empty">No groups</li>
          ) : (
            context.groupBy.map((columnId) => {
              const item = itemsById.get(columnId)
              const label = item?.label ?? columnId
              return (
                <li className="bc-grid-columns-panel-group-chip" key={columnId}>
                  <span>{label}</span>
                  <button
                    aria-label={`Remove group ${label}`}
                    className="bc-grid-columns-panel-chip-remove"
                    type="button"
                    onClick={() =>
                      context.setGroupBy(context.groupBy.filter((entry) => entry !== columnId))
                    }
                  >
                    x
                  </button>
                </li>
              )
            })
          )}
        </ul>
        {ungroupedGroupableItems.length > 0 ? (
          <label className="bc-grid-columns-panel-add-group">
            <span className="bc-grid-columns-panel-label">Add group</span>
            <select
              aria-label="Add group by column"
              className="bc-grid-columns-panel-pin"
              value=""
              onChange={(event) => {
                if (event.target.value) addGroupByColumn(event.target.value)
              }}
            >
              <option value="">Choose column</option>
              {ungroupedGroupableItems.map((item) => (
                <option key={item.columnId} value={item.columnId}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </section>
    </section>
  )
}

export function buildColumnToolPanelItems<TRow>(
  columns: readonly BcReactGridColumn<TRow>[],
  columnState: readonly BcColumnStateEntry[],
  groupableColumns: readonly { columnId: ColumnId; header: string }[] = [],
): readonly ColumnToolPanelItem[] {
  const stateById = new Map(columnState.map((entry) => [entry.columnId, entry]))
  const explicitGroupableIds = new Set(groupableColumns.map((entry) => entry.columnId))
  const items = columns.map((column, originalIndex) => {
    const columnId = columnIdFor(column, originalIndex)
    const state = stateById.get(columnId)
    const pinned = state?.pinned === null ? null : (state?.pinned ?? column.pinned ?? null)
    return {
      columnId,
      groupable: explicitGroupableIds.has(columnId) || column.groupable === true,
      hidden: state?.hidden ?? column.hidden ?? false,
      hideDisabled: false,
      label: columnToolPanelLabel(column, columnId, groupableColumns),
      originalIndex,
      pinned,
      position: state?.position ?? originalIndex,
    }
  })
  const sorted = [...items].sort(compareColumnToolPanelItems)
  const visibleCount = sorted.filter((item) => !item.hidden).length
  return sorted.map((item) => ({
    ...item,
    hideDisabled: !item.hidden && visibleCount <= 1,
  }))
}

export function filterColumnToolPanelItems(
  items: readonly ColumnToolPanelItem[],
  query: string,
): readonly ColumnToolPanelItem[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return items
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(normalized) ||
      item.columnId.toLowerCase().includes(normalized),
  )
}

export function setColumnHidden(
  columnState: readonly BcColumnStateEntry[],
  columnId: ColumnId,
  hidden: boolean,
): readonly BcColumnStateEntry[] {
  return upsertColumnState(columnState, columnId, { hidden })
}

export function setColumnPinned(
  columnState: readonly BcColumnStateEntry[],
  columnId: ColumnId,
  pinned: "left" | "right" | null,
): readonly BcColumnStateEntry[] {
  return upsertColumnState(columnState, columnId, { pinned })
}

export function reorderColumnInToolPanel(
  items: readonly ColumnToolPanelItem[],
  columnState: readonly BcColumnStateEntry[],
  sourceColumnId: ColumnId,
  targetColumnId: ColumnId,
): readonly BcColumnStateEntry[] {
  if (sourceColumnId === targetColumnId) return columnState
  const ordered = items.map((item) => item.columnId)
  const sourceIndex = ordered.indexOf(sourceColumnId)
  const targetIndex = ordered.indexOf(targetColumnId)
  if (sourceIndex < 0 || targetIndex < 0) return columnState
  ordered.splice(sourceIndex, 1)
  const targetIndexAfterRemoval = ordered.indexOf(targetColumnId)
  ordered.splice(targetIndexAfterRemoval, 0, sourceColumnId)
  return applyColumnPositions(columnState, ordered)
}

export function moveColumnInToolPanel(
  items: readonly ColumnToolPanelItem[],
  columnState: readonly BcColumnStateEntry[],
  columnId: ColumnId,
  offset: -1 | 1,
): readonly BcColumnStateEntry[] {
  const ordered = items.map((item) => item.columnId)
  const sourceIndex = ordered.indexOf(columnId)
  if (sourceIndex < 0) return columnState
  const targetIndex = sourceIndex + offset
  if (targetIndex < 0 || targetIndex >= ordered.length) return columnState
  ordered.splice(sourceIndex, 1)
  ordered.splice(targetIndex, 0, columnId)
  return applyColumnPositions(columnState, ordered)
}

function applyColumnPositions(
  columnState: readonly BcColumnStateEntry[],
  orderedColumnIds: readonly ColumnId[],
): readonly BcColumnStateEntry[] {
  const stateById = new Map(columnState.map((entry) => [entry.columnId, entry]))
  const orderedSet = new Set(orderedColumnIds)
  const orderedEntries = orderedColumnIds.map((columnId, position) => {
    const existing = stateById.get(columnId)
    return { ...existing, columnId, position }
  })
  const remainingEntries = columnState.filter((entry) => !orderedSet.has(entry.columnId))
  return [...orderedEntries, ...remainingEntries]
}

function upsertColumnState(
  columnState: readonly BcColumnStateEntry[],
  columnId: ColumnId,
  patch: Partial<BcColumnStateEntry>,
): readonly BcColumnStateEntry[] {
  let updated = false
  const next = columnState.map((entry) => {
    if (entry.columnId !== columnId) return entry
    updated = true
    return { ...entry, ...patch, columnId }
  })
  return updated ? next : [...columnState, { ...patch, columnId }]
}

function compareColumnToolPanelItems(
  a: Pick<ColumnToolPanelItem, "originalIndex" | "pinned" | "position">,
  b: Pick<ColumnToolPanelItem, "originalIndex" | "pinned" | "position">,
): number {
  return (
    pinnedOrder(a.pinned) - pinnedOrder(b.pinned) ||
    a.position - b.position ||
    a.originalIndex - b.originalIndex
  )
}

function pinnedOrder(pinned: "left" | "right" | null): number {
  if (pinned === "left") return 0
  if (pinned === "right") return 2
  return 1
}

function columnToolPanelLabel<TRow>(
  column: BcReactGridColumn<TRow>,
  columnId: ColumnId,
  groupableColumns: readonly { columnId: ColumnId; header: string }[],
): string {
  const explicit = groupableColumns.find((entry) => entry.columnId === columnId)
  if (explicit) return explicit.header
  return typeof column.header === "string" ? column.header : columnId
}

function readPinnedValue(value: string): "left" | "right" | null {
  if (value === "left" || value === "right") return value
  return null
}
