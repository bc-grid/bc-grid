import type { BcAggregation, BcPivotState, BcPivotValue, ColumnId } from "@bc-grid/core"
import { type ChangeEvent, type DragEvent, type ReactNode, useMemo, useState } from "react"
import { columnIdFor } from "./gridInternals"
import type { BcReactGridColumn, BcSidebarContext } from "./types"

const PIVOT_DRAG_MIME = "application/x-bc-grid-pivot-column"

export type PivotToolPanelZone = "rowGroups" | "colGroups" | "values"

export interface PivotToolPanelItem {
  assigned: boolean
  columnId: ColumnId
  label: string
  suggestedZone: PivotToolPanelZone
}

interface PivotDragPayload {
  columnId: ColumnId
  sourceIndex?: number
  sourceZone?: PivotToolPanelZone | "available"
}

interface PivotZoneEntry {
  columnId: ColumnId
  key: string
  label: string
  value?: BcPivotValue
}

const PIVOT_ZONES: readonly {
  id: PivotToolPanelZone
  label: string
  emptyLabel: string
}[] = [
  { id: "rowGroups", label: "Row groups", emptyLabel: "No row groups" },
  { id: "colGroups", label: "Column groups", emptyLabel: "No column groups" },
  { id: "values", label: "Values", emptyLabel: "No values" },
]

export function BcPivotToolPanel<TRow>({
  context,
}: {
  context: BcSidebarContext<TRow>
}): ReactNode {
  const pivot = context.pivot
  const state = pivot?.state ?? emptyPivotState()
  const [dragPayload, setDragPayload] = useState<PivotDragPayload | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const items = useMemo(
    () => buildPivotToolPanelItems(context.columns, state),
    [context.columns, state],
  )
  const itemsById = useMemo(() => new Map(items.map((item) => [item.columnId, item])), [items])
  const columnsById = useMemo(
    () =>
      new Map(
        context.columns.map((column, index) => {
          const columnId = columnIdFor(column, index)
          return [columnId, column]
        }),
      ),
    [context.columns],
  )
  const availableItems = items.filter((item) => !item.assigned)

  const setPivotState = (next: BcPivotState) => {
    pivot?.setState(next)
  }

  const addToZone = (columnId: ColumnId, zone: PivotToolPanelZone, targetIndex?: number) => {
    const item = itemsById.get(columnId)
    const column = columnsById.get(columnId)
    if (!item || !column) return
    setPivotState(addPivotColumnToZone(state, zone, item, column, targetIndex))
  }

  const handleDrop = (
    event: DragEvent<HTMLElement>,
    zone: PivotToolPanelZone,
    targetIndex?: number,
  ) => {
    event.preventDefault()
    const payload = readPivotDragPayload(event) ?? dragPayload
    setDropTarget(null)
    setDragPayload(null)
    if (!payload) return
    addToZone(payload.columnId, zone, targetIndex)
  }

  const renderZone = (zone: (typeof PIVOT_ZONES)[number]) => {
    const entries = pivotZoneEntries(state, zone.id, itemsById)
    const availableForZone = availableItems
    const zoneTarget = `zone:${zone.id}`

    return (
      <section
        aria-label={zone.label}
        className="bc-grid-pivot-panel-zone"
        data-drop-active={dropTarget === zoneTarget || undefined}
        key={zone.id}
        onDragLeave={() => setDropTarget(null)}
        onDragOver={(event) => {
          event.preventDefault()
          setDropTarget(zoneTarget)
        }}
        onDrop={(event) => handleDrop(event, zone.id)}
      >
        <div className="bc-grid-pivot-panel-zone-header">
          <h3 className="bc-grid-pivot-panel-subtitle">{zone.label}</h3>
          {availableForZone.length > 0 ? (
            <select
              aria-label={`Add ${zone.label.toLowerCase()}`}
              className="bc-grid-pivot-panel-select"
              value=""
              onChange={(event) => {
                if (event.currentTarget.value) addToZone(event.currentTarget.value, zone.id)
              }}
            >
              <option value="">Add column</option>
              {availableForZone.map((item) => (
                <option key={item.columnId} value={item.columnId}>
                  {item.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <ul className="bc-grid-pivot-panel-zone-list" aria-label={`${zone.label} columns`}>
          {entries.length === 0 ? (
            <li className="bc-grid-pivot-panel-empty">{zone.emptyLabel}</li>
          ) : (
            entries.map((entry, index) => {
              const itemTarget = `item:${zone.id}:${index}`
              return (
                <li
                  className="bc-grid-pivot-panel-chip"
                  data-drop-target={dropTarget === itemTarget || undefined}
                  draggable
                  key={entry.key}
                  onDragEnd={() => {
                    setDragPayload(null)
                    setDropTarget(null)
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDropTarget(itemTarget)
                  }}
                  onDragStart={(event) => {
                    const payload = {
                      columnId: entry.columnId,
                      sourceIndex: index,
                      sourceZone: zone.id,
                    }
                    setDragPayload(payload)
                    writePivotDragPayload(event, payload)
                  }}
                  onDrop={(event) => handleDrop(event, zone.id, index)}
                >
                  <span aria-hidden="true" className="bc-grid-pivot-panel-drag-handle">
                    ::
                  </span>
                  <span className="bc-grid-pivot-panel-chip-label">{entry.label}</span>
                  {zone.id === "values" && entry.value ? (
                    <select
                      aria-label={`Aggregate ${entry.label}`}
                      className="bc-grid-pivot-panel-select"
                      value={aggregationType(entry.value.aggregation)}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                        if (event.currentTarget.value === "custom") return
                        const column = columnsById.get(entry.columnId)
                        setPivotState(
                          setPivotValueAggregation(
                            state,
                            index,
                            event.currentTarget.value as BuiltInAggregationType,
                            column,
                          ),
                        )
                      }}
                    >
                      <option value="sum">Sum</option>
                      <option value="count">Count</option>
                      <option value="avg">Average</option>
                      <option value="min">Minimum</option>
                      <option value="max">Maximum</option>
                      {entry.value.aggregation?.type === "custom" ? (
                        <option disabled value="custom">
                          Custom
                        </option>
                      ) : null}
                    </select>
                  ) : null}
                  <div className="bc-grid-pivot-panel-chip-actions">
                    <button
                      aria-label={`Move ${entry.label} up`}
                      className="bc-grid-pivot-panel-button"
                      disabled={index === 0}
                      type="button"
                      onClick={() => setPivotState(movePivotEntry(state, zone.id, index, -1))}
                    >
                      Up
                    </button>
                    <button
                      aria-label={`Move ${entry.label} down`}
                      className="bc-grid-pivot-panel-button"
                      disabled={index === entries.length - 1}
                      type="button"
                      onClick={() => setPivotState(movePivotEntry(state, zone.id, index, 1))}
                    >
                      Down
                    </button>
                    <button
                      aria-label={`Remove ${entry.label}`}
                      className="bc-grid-pivot-panel-button"
                      type="button"
                      onClick={() => setPivotState(removePivotEntry(state, zone.id, index))}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              )
            })
          )}
        </ul>
      </section>
    )
  }

  return (
    <section className="bc-grid-pivot-panel">
      <h2 className="bc-grid-sidebar-panel-title">Pivot</h2>

      <section className="bc-grid-pivot-panel-available" aria-label="Available columns">
        <h3 className="bc-grid-pivot-panel-subtitle">Available columns</h3>
        <ul className="bc-grid-pivot-panel-available-list" aria-label="Available pivot columns">
          {availableItems.length === 0 ? (
            <li className="bc-grid-pivot-panel-empty">No available columns</li>
          ) : (
            availableItems.map((item) => (
              <li
                className="bc-grid-pivot-panel-available-item"
                draggable
                key={item.columnId}
                onDragEnd={() => {
                  setDragPayload(null)
                  setDropTarget(null)
                }}
                onDragStart={(event) => {
                  const payload = { columnId: item.columnId, sourceZone: "available" as const }
                  setDragPayload(payload)
                  writePivotDragPayload(event, payload)
                }}
              >
                <span aria-hidden="true" className="bc-grid-pivot-panel-drag-handle">
                  ::
                </span>
                <span className="bc-grid-pivot-panel-column-label">{item.label}</span>
                <div className="bc-grid-pivot-panel-available-actions">
                  <button
                    aria-label={`Add ${item.label} to row groups`}
                    className="bc-grid-pivot-panel-button"
                    type="button"
                    onClick={() => addToZone(item.columnId, "rowGroups")}
                  >
                    Row
                  </button>
                  <button
                    aria-label={`Add ${item.label} to column groups`}
                    className="bc-grid-pivot-panel-button"
                    type="button"
                    onClick={() => addToZone(item.columnId, "colGroups")}
                  >
                    Column
                  </button>
                  <button
                    aria-label={`Add ${item.label} to values`}
                    className="bc-grid-pivot-panel-button"
                    type="button"
                    onClick={() => addToZone(item.columnId, "values")}
                  >
                    Value
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      {PIVOT_ZONES.map(renderZone)}
    </section>
  )
}

export function buildPivotToolPanelItems<TRow>(
  columns: readonly BcReactGridColumn<TRow>[],
  state: BcPivotState,
): readonly PivotToolPanelItem[] {
  const assigned = new Set([
    ...state.rowGroups,
    ...state.colGroups,
    ...state.values.map((value) => value.columnId),
  ])
  return columns.map((column, index) => {
    const columnId = columnIdFor(column, index)
    return {
      assigned: assigned.has(columnId),
      columnId,
      label: pivotColumnLabel(column, columnId),
      suggestedZone: suggestedPivotZone(column),
    }
  })
}

export function addPivotColumnToZone<TRow>(
  state: BcPivotState,
  zone: PivotToolPanelZone,
  item: Pick<PivotToolPanelItem, "columnId" | "label">,
  column: BcReactGridColumn<TRow> | undefined,
  targetIndex?: number,
): BcPivotState {
  const existingValue = state.values.find((value) => value.columnId === item.columnId)
  const withoutColumn = removePivotColumnFromAllZones(state, item.columnId)

  if (zone === "rowGroups") {
    return {
      ...withoutColumn,
      rowGroups: insertAt(withoutColumn.rowGroups, item.columnId, targetIndex),
    }
  }
  if (zone === "colGroups") {
    return {
      ...withoutColumn,
      colGroups: insertAt(withoutColumn.colGroups, item.columnId, targetIndex),
    }
  }
  return {
    ...withoutColumn,
    values: insertAt(
      withoutColumn.values,
      existingValue ?? defaultPivotValue(item.columnId, item.label, column),
      targetIndex,
    ),
  }
}

export function removePivotEntry(
  state: BcPivotState,
  zone: PivotToolPanelZone,
  index: number,
): BcPivotState {
  if (zone === "rowGroups") return { ...state, rowGroups: removeAt(state.rowGroups, index) }
  if (zone === "colGroups") return { ...state, colGroups: removeAt(state.colGroups, index) }
  return { ...state, values: removeAt(state.values, index) }
}

export function movePivotEntry(
  state: BcPivotState,
  zone: PivotToolPanelZone,
  index: number,
  offset: -1 | 1,
): BcPivotState {
  const targetIndex = index + offset
  const entries = zone === "values" ? state.values : state[zone]
  if (index < 0 || targetIndex < 0 || targetIndex >= entries.length) return state
  const next = [...entries]
  const [entry] = next.splice(index, 1)
  if (!entry) return state
  next.splice(targetIndex, 0, entry)
  if (zone === "rowGroups") return { ...state, rowGroups: next as readonly ColumnId[] }
  if (zone === "colGroups") return { ...state, colGroups: next as readonly ColumnId[] }
  return { ...state, values: next as readonly BcPivotValue[] }
}

export type BuiltInAggregationType = Exclude<BcAggregation["type"], "custom">

export function setPivotValueAggregation<TRow>(
  state: BcPivotState,
  index: number,
  aggregation: BuiltInAggregationType,
  column?: BcReactGridColumn<TRow>,
): BcPivotState {
  const current = state.values[index]
  if (!current) return state
  const nextAggregation: BcAggregation = { type: aggregation }
  const label = pivotValueLabel(pivotColumnLabel(column, current.columnId), nextAggregation)
  const nextValues = state.values.map((value, valueIndex) =>
    valueIndex === index ? { ...value, aggregation: nextAggregation, label } : value,
  )
  return { ...state, values: nextValues }
}

function pivotZoneEntries(
  state: BcPivotState,
  zone: PivotToolPanelZone,
  itemsById: ReadonlyMap<ColumnId, Pick<PivotToolPanelItem, "columnId" | "label">>,
): readonly PivotZoneEntry[] {
  if (zone === "values") {
    return state.values.map((value, index) => {
      const item = itemsById.get(value.columnId)
      const baseLabel = item?.label ?? value.columnId
      return {
        columnId: value.columnId,
        key: `${value.columnId}-${index}`,
        label: value.label ?? pivotValueLabel(baseLabel, value.aggregation),
        value,
      }
    })
  }

  return state[zone].map((columnId, index) => ({
    columnId,
    key: `${columnId}-${index}`,
    label: itemsById.get(columnId)?.label ?? columnId,
  }))
}

function removePivotColumnFromAllZones(state: BcPivotState, columnId: ColumnId): BcPivotState {
  return {
    ...state,
    colGroups: state.colGroups.filter((entry) => entry !== columnId),
    rowGroups: state.rowGroups.filter((entry) => entry !== columnId),
    values: state.values.filter((entry) => entry.columnId !== columnId),
  }
}

function defaultPivotValue<TRow>(
  columnId: ColumnId,
  label: string,
  column?: BcReactGridColumn<TRow>,
): BcPivotValue {
  const aggregation = column?.aggregation ?? defaultPivotAggregation(column)
  return {
    columnId,
    aggregation,
    label: pivotValueLabel(label, aggregation),
  }
}

function defaultPivotAggregation<TRow>(column?: BcReactGridColumn<TRow>): BcAggregation {
  return { type: isNumericPivotColumn(column) ? "sum" : "count" }
}

function suggestedPivotZone<TRow>(column: BcReactGridColumn<TRow>): PivotToolPanelZone {
  if (isNumericPivotColumn(column)) return "values"
  return "rowGroups"
}

function isNumericPivotColumn<TRow>(column: BcReactGridColumn<TRow> | undefined): boolean {
  if (!column) return false
  if (column.aggregation && column.aggregation.type !== "count") return true
  const format = column.format
  if (typeof format === "string")
    return format === "number" || format === "currency" || format === "percent"
  if (format && typeof format === "object") {
    return format.type === "number" || format.type === "currency" || format.type === "percent"
  }
  return column.align === "right"
}

function pivotColumnLabel<TRow>(
  column: BcReactGridColumn<TRow> | undefined,
  columnId: ColumnId,
): string {
  return column && typeof column.header === "string" ? column.header : columnId
}

function pivotValueLabel(label: string, aggregation: BcAggregation | undefined): string {
  return `${aggregationLabel(aggregation)} of ${label}`
}

function aggregationType(aggregation: BcAggregation | undefined): BcAggregation["type"] {
  return aggregation?.type ?? "count"
}

function aggregationLabel(aggregation: BcAggregation | undefined): string {
  const type = aggregationType(aggregation)
  if (type === "avg") return "Average"
  return type.slice(0, 1).toUpperCase() + type.slice(1)
}

function insertAt<T>(values: readonly T[], value: T, index: number | undefined): readonly T[] {
  const next = [...values]
  const targetIndex =
    typeof index === "number" && Number.isFinite(index)
      ? Math.max(0, Math.min(index, next.length))
      : next.length
  next.splice(targetIndex, 0, value)
  return next
}

function removeAt<T>(values: readonly T[], index: number): readonly T[] {
  if (index < 0 || index >= values.length) return values
  return values.filter((_, entryIndex) => entryIndex !== index)
}

function emptyPivotState(): BcPivotState {
  return {
    colGroups: [],
    rowGroups: [],
    subtotals: { rows: true, cols: true },
    values: [],
  }
}

function writePivotDragPayload(event: DragEvent<HTMLElement>, payload: PivotDragPayload): void {
  event.dataTransfer.setData(PIVOT_DRAG_MIME, JSON.stringify(payload))
  event.dataTransfer.setData("text/plain", payload.columnId)
  event.dataTransfer.effectAllowed = "move"
}

function readPivotDragPayload(event: DragEvent<HTMLElement>): PivotDragPayload | null {
  const raw = event.dataTransfer.getData(PIVOT_DRAG_MIME)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<PivotDragPayload>
      if (typeof parsed.columnId === "string") return parsed as PivotDragPayload
    } catch {
      return null
    }
  }
  const columnId = event.dataTransfer.getData("text/plain")
  return columnId ? { columnId } : null
}
