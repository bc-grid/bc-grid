import type { BcAggregation, BcColumnFormat, BcPivotState, ColumnId } from "@bc-grid/core"
import { type ChangeEvent, type DragEvent, type ReactNode, useMemo, useState } from "react"
import { columnIdFor } from "./gridInternals"
import type { BcReactGridColumn, BcSidebarContext } from "./types"

const PIVOT_DRAG_MIME = "application/x-bc-grid-pivot-field"

const FALLBACK_PIVOT_VALUE_AGGREGATION: BcAggregation = { type: "count" }
const PIVOT_AGGREGATION_CHOICES = ["sum", "count", "avg", "min", "max"] as const

export type PivotToolPanelZone = "rowGroups" | "colGroups" | "values"
export type PivotAggregationChoice = "inherit" | (typeof PIVOT_AGGREGATION_CHOICES)[number]

export interface PivotToolPanelField {
  columnId: ColumnId
  defaultAggregation: BcAggregation | null
  inColumnGroups: boolean
  inRowGroups: boolean
  inValues: boolean
  label: string
  originalIndex: number
}

interface PivotDragPayload {
  columnId: ColumnId
  sourceZone?: PivotToolPanelZone | undefined
}

interface PivotZoneItem {
  aggregation?: PivotAggregationChoice | "custom" | undefined
  columnId: ColumnId
  label: string
}

export function BcPivotToolPanel<TRow>({
  context,
}: {
  context: BcSidebarContext<TRow>
}): ReactNode {
  const [query, setQuery] = useState("")
  const [dragPayload, setDragPayload] = useState<PivotDragPayload | null>(null)
  const fields = useMemo(
    () => buildPivotToolPanelFields(context.columns, context.pivotState),
    [context.columns, context.pivotState],
  )
  const visibleFields = useMemo(() => filterPivotToolPanelFields(fields, query), [fields, query])
  const fieldsById = useMemo(
    () => new Map(fields.map((field) => [field.columnId, field])),
    [fields],
  )

  const applyAddToZone = (zone: PivotToolPanelZone, columnId: ColumnId) => {
    const field = fieldsById.get(columnId)
    context.setPivotState(
      addPivotColumn(
        context.pivotState,
        zone,
        columnId,
        field ? field.defaultAggregation : FALLBACK_PIVOT_VALUE_AGGREGATION,
      ),
    )
  }

  const applyDropToZone = (event: DragEvent<HTMLElement>, zone: PivotToolPanelZone) => {
    event.preventDefault()
    const payload = dragPayload ?? readPivotDragPayload(event)
    setDragPayload(null)
    if (!payload) return

    const field = fieldsById.get(payload.columnId)
    const aggregation = field ? field.defaultAggregation : FALLBACK_PIVOT_VALUE_AGGREGATION
    const next =
      payload.sourceZone && payload.sourceZone !== zone
        ? addPivotColumn(
            removePivotColumn(context.pivotState, payload.sourceZone, payload.columnId),
            zone,
            payload.columnId,
            aggregation,
          )
        : addPivotColumn(context.pivotState, zone, payload.columnId, aggregation)
    context.setPivotState(next)
  }

  return (
    <section className="bc-grid-pivot-panel">
      <div className="bc-grid-sidebar-panel-header">
        <h2 className="bc-grid-sidebar-panel-title">Pivot</h2>
      </div>
      <label className="bc-grid-pivot-panel-search">
        <span className="bc-grid-pivot-panel-label">Search fields</span>
        <input
          aria-label="Search pivot fields"
          className="bc-grid-pivot-panel-search-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <ul className="bc-grid-pivot-panel-field-list" aria-label="Pivot fields">
        {visibleFields.length > 0 ? (
          visibleFields.map((field) => (
            <li
              className="bc-grid-pivot-panel-field"
              draggable
              key={field.columnId}
              onDragEnd={() => setDragPayload(null)}
              onDragStart={(event) => {
                const payload: PivotDragPayload = { columnId: field.columnId }
                setDragPayload(payload)
                writePivotDragPayload(event, payload)
              }}
            >
              <span aria-hidden="true" className="bc-grid-pivot-panel-drag-handle">
                ::
              </span>
              <span className="bc-grid-pivot-panel-field-label">{field.label}</span>
              <div className="bc-grid-pivot-panel-field-actions">
                <button
                  aria-label={`Add ${field.label} to row groups`}
                  className="bc-grid-pivot-panel-button"
                  disabled={field.inRowGroups}
                  type="button"
                  onClick={() => applyAddToZone("rowGroups", field.columnId)}
                >
                  Row
                </button>
                <button
                  aria-label={`Add ${field.label} to column groups`}
                  className="bc-grid-pivot-panel-button"
                  disabled={field.inColumnGroups}
                  type="button"
                  onClick={() => applyAddToZone("colGroups", field.columnId)}
                >
                  Column
                </button>
                <button
                  aria-label={`Add ${field.label} to values`}
                  className="bc-grid-pivot-panel-button"
                  disabled={field.inValues}
                  type="button"
                  onClick={() => applyAddToZone("values", field.columnId)}
                >
                  Value
                </button>
              </div>
            </li>
          ))
        ) : (
          <li className="bc-grid-pivot-panel-empty">No matching fields</li>
        )}
      </ul>

      <div className="bc-grid-pivot-panel-zones">
        <PivotDropZone
          addLabel="Add row group"
          dragPayload={dragPayload}
          emptyLabel="No row groups"
          fields={fields}
          items={pivotZoneItems(context.pivotState, "rowGroups", fieldsById)}
          label="Row groups"
          setDragPayload={setDragPayload}
          zone="rowGroups"
          onAddColumn={applyAddToZone}
          onDrop={applyDropToZone}
          onMoveColumn={(columnId, offset) =>
            context.setPivotState(
              movePivotColumn(context.pivotState, "rowGroups", columnId, offset),
            )
          }
          onRemoveColumn={(columnId) =>
            context.setPivotState(removePivotColumn(context.pivotState, "rowGroups", columnId))
          }
        />
        <PivotDropZone
          addLabel="Add column group"
          dragPayload={dragPayload}
          emptyLabel="No column groups"
          fields={fields}
          items={pivotZoneItems(context.pivotState, "colGroups", fieldsById)}
          label="Column groups"
          setDragPayload={setDragPayload}
          zone="colGroups"
          onAddColumn={applyAddToZone}
          onDrop={applyDropToZone}
          onMoveColumn={(columnId, offset) =>
            context.setPivotState(
              movePivotColumn(context.pivotState, "colGroups", columnId, offset),
            )
          }
          onRemoveColumn={(columnId) =>
            context.setPivotState(removePivotColumn(context.pivotState, "colGroups", columnId))
          }
        />
        <PivotDropZone
          addLabel="Add value"
          dragPayload={dragPayload}
          emptyLabel="No values"
          fields={fields}
          items={pivotZoneItems(context.pivotState, "values", fieldsById)}
          label="Values"
          setDragPayload={setDragPayload}
          zone="values"
          onAddColumn={applyAddToZone}
          onAggregationChange={(columnId, aggregation) =>
            context.setPivotState(
              setPivotValueAggregation(context.pivotState, columnId, aggregation),
            )
          }
          onDrop={applyDropToZone}
          onMoveColumn={(columnId, offset) =>
            context.setPivotState(movePivotColumn(context.pivotState, "values", columnId, offset))
          }
          onRemoveColumn={(columnId) =>
            context.setPivotState(removePivotColumn(context.pivotState, "values", columnId))
          }
        />
      </div>
    </section>
  )
}

function PivotDropZone({
  addLabel,
  dragPayload,
  emptyLabel,
  fields,
  items,
  label,
  setDragPayload,
  zone,
  onAddColumn,
  onAggregationChange,
  onDrop,
  onMoveColumn,
  onRemoveColumn,
}: {
  addLabel: string
  dragPayload: PivotDragPayload | null
  emptyLabel: string
  fields: readonly PivotToolPanelField[]
  items: readonly PivotZoneItem[]
  label: string
  setDragPayload: (payload: PivotDragPayload | null) => void
  zone: PivotToolPanelZone
  onAddColumn: (zone: PivotToolPanelZone, columnId: ColumnId) => void
  onAggregationChange?: (columnId: ColumnId, aggregation: PivotAggregationChoice) => void
  onDrop: (event: DragEvent<HTMLElement>, zone: PivotToolPanelZone) => void
  onMoveColumn: (columnId: ColumnId, offset: -1 | 1) => void
  onRemoveColumn: (columnId: ColumnId) => void
}): ReactNode {
  const availableFields = fields.filter((field) => !fieldInZone(field, zone))
  const dropActive = dragPayload != null

  return (
    <section
      aria-label={label}
      className="bc-grid-pivot-panel-zone"
      data-drop-active={dropActive || undefined}
      onDragOver={(event) => {
        if (!dropActive) return
        event.preventDefault()
      }}
      onDrop={(event) => onDrop(event, zone)}
    >
      <h3 className="bc-grid-pivot-panel-subtitle">{label}</h3>
      <ul className="bc-grid-pivot-panel-chip-list" aria-label={`${label} fields`}>
        {items.length > 0 ? (
          items.map((item, index) => (
            <li
              className="bc-grid-pivot-panel-chip"
              draggable
              key={item.columnId}
              onDragEnd={() => setDragPayload(null)}
              onDragStart={(event) => {
                const payload: PivotDragPayload = { columnId: item.columnId, sourceZone: zone }
                setDragPayload(payload)
                writePivotDragPayload(event, payload)
              }}
            >
              <span aria-hidden="true" className="bc-grid-pivot-panel-drag-handle">
                ::
              </span>
              <span className="bc-grid-pivot-panel-chip-label">{item.label}</span>
              {zone === "values" && onAggregationChange ? (
                <select
                  aria-label={`Aggregate ${item.label}`}
                  className="bc-grid-pivot-panel-select"
                  value={item.aggregation ?? "inherit"}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                    const next = readPivotAggregationChoice(event.target.value)
                    if (next) onAggregationChange(item.columnId, next)
                  }}
                >
                  <option value="inherit">Column default</option>
                  <option value="sum">Sum</option>
                  <option value="count">Count</option>
                  <option value="avg">Average</option>
                  <option value="min">Min</option>
                  <option value="max">Max</option>
                  {item.aggregation === "custom" ? (
                    <option disabled value="custom">
                      Custom
                    </option>
                  ) : null}
                </select>
              ) : null}
              <div className="bc-grid-pivot-panel-chip-actions">
                <button
                  aria-label={`Move ${item.label} up`}
                  className="bc-grid-pivot-panel-icon-button"
                  disabled={index === 0}
                  type="button"
                  onClick={() => onMoveColumn(item.columnId, -1)}
                >
                  Up
                </button>
                <button
                  aria-label={`Move ${item.label} down`}
                  className="bc-grid-pivot-panel-icon-button"
                  disabled={index === items.length - 1}
                  type="button"
                  onClick={() => onMoveColumn(item.columnId, 1)}
                >
                  Down
                </button>
                <button
                  aria-label={`Remove ${item.label}`}
                  className="bc-grid-pivot-panel-icon-button"
                  type="button"
                  onClick={() => onRemoveColumn(item.columnId)}
                >
                  x
                </button>
              </div>
            </li>
          ))
        ) : (
          <li className="bc-grid-pivot-panel-empty">{emptyLabel}</li>
        )}
      </ul>
      {availableFields.length > 0 ? (
        <label className="bc-grid-pivot-panel-add-field">
          <span className="bc-grid-pivot-panel-label">{addLabel}</span>
          <select
            aria-label={addLabel}
            className="bc-grid-pivot-panel-select"
            value=""
            onChange={(event) => {
              if (event.target.value) onAddColumn(zone, event.target.value)
            }}
          >
            <option value="">Choose field</option>
            {availableFields.map((field) => (
              <option key={field.columnId} value={field.columnId}>
                {field.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </section>
  )
}

export function buildPivotToolPanelFields<TRow>(
  columns: readonly BcReactGridColumn<TRow>[],
  pivotState: BcPivotState,
): readonly PivotToolPanelField[] {
  const rowGroups = new Set(pivotState.rowGroups)
  const colGroups = new Set(pivotState.colGroups)
  const values = new Set(pivotState.values.map((value) => value.columnId))

  return columns.map((column, index) => {
    const columnId = columnIdFor(column, index)
    return {
      columnId,
      defaultAggregation: defaultPivotAggregationForColumn(column),
      inColumnGroups: colGroups.has(columnId),
      inRowGroups: rowGroups.has(columnId),
      inValues: values.has(columnId),
      label: pivotToolPanelLabel(column, columnId),
      originalIndex: index,
    }
  })
}

export function filterPivotToolPanelFields(
  fields: readonly PivotToolPanelField[],
  query: string,
): readonly PivotToolPanelField[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return fields
  return fields.filter(
    (field) =>
      field.label.toLocaleLowerCase().includes(normalizedQuery) ||
      field.columnId.toLocaleLowerCase().includes(normalizedQuery),
  )
}

export function addPivotColumn(
  state: BcPivotState,
  zone: PivotToolPanelZone,
  columnId: ColumnId,
  aggregation: BcAggregation | null = { type: "count" },
): BcPivotState {
  if (zone === "values") {
    if (state.values.some((value) => value.columnId === columnId)) return state
    const value = aggregation === null ? { columnId } : { columnId, aggregation }
    return { ...state, values: [...state.values, value] }
  }

  const rowGroups = zone === "rowGroups" ? addUnique(state.rowGroups, columnId) : state.rowGroups
  const colGroups = zone === "colGroups" ? addUnique(state.colGroups, columnId) : state.colGroups
  if (rowGroups === state.rowGroups && colGroups === state.colGroups) return state

  return {
    ...state,
    colGroups:
      zone === "rowGroups" ? state.colGroups.filter((entry) => entry !== columnId) : colGroups,
    rowGroups:
      zone === "colGroups" ? state.rowGroups.filter((entry) => entry !== columnId) : rowGroups,
  }
}

export function removePivotColumn(
  state: BcPivotState,
  zone: PivotToolPanelZone,
  columnId: ColumnId,
): BcPivotState {
  if (zone === "values") {
    const values = state.values.filter((value) => value.columnId !== columnId)
    return values.length === state.values.length ? state : { ...state, values }
  }

  const entries = state[zone].filter((entry) => entry !== columnId)
  return entries.length === state[zone].length ? state : { ...state, [zone]: entries }
}

export function movePivotColumn(
  state: BcPivotState,
  zone: PivotToolPanelZone,
  columnId: ColumnId,
  offset: -1 | 1,
): BcPivotState {
  if (zone === "values") {
    const values = moveEntry(state.values, (value) => value.columnId === columnId, offset)
    return values === state.values ? state : { ...state, values }
  }

  const entries = moveEntry(state[zone], (entry) => entry === columnId, offset)
  return entries === state[zone] ? state : { ...state, [zone]: entries }
}

export function setPivotValueAggregation(
  state: BcPivotState,
  columnId: ColumnId,
  choice: PivotAggregationChoice,
): BcPivotState {
  let changed = false
  const values = state.values.map((value) => {
    if (value.columnId !== columnId) return value
    const aggregation = choice === "inherit" ? undefined : { type: choice }
    if (aggregation?.type === value.aggregation?.type) return value
    if (!aggregation && !value.aggregation) return value
    changed = true
    const { aggregation: _previous, ...rest } = value
    return aggregation ? { ...rest, aggregation } : rest
  })
  return changed ? { ...state, values } : state
}

export function defaultPivotAggregationForColumn<TRow>(
  column: BcReactGridColumn<TRow>,
): BcAggregation | null {
  if (column.aggregation) return null
  return isNumericColumnFormat(column.format) ? { type: "sum" } : { type: "count" }
}

function pivotZoneItems(
  state: BcPivotState,
  zone: PivotToolPanelZone,
  fieldsById: ReadonlyMap<ColumnId, PivotToolPanelField>,
): readonly PivotZoneItem[] {
  if (zone === "values") {
    return state.values.map((value) => ({
      aggregation: pivotAggregationChoiceForValue(value.aggregation),
      columnId: value.columnId,
      label: value.label ?? fieldsById.get(value.columnId)?.label ?? value.columnId,
    }))
  }

  return state[zone].map((columnId) => ({
    columnId,
    label: fieldsById.get(columnId)?.label ?? columnId,
  }))
}

function pivotAggregationChoiceForValue(
  aggregation: BcAggregation | undefined,
): PivotAggregationChoice | "custom" {
  if (!aggregation) return "inherit"
  return isPivotAggregationChoice(aggregation.type) ? aggregation.type : "custom"
}

function readPivotAggregationChoice(value: string): PivotAggregationChoice | null {
  if (value === "inherit") return value
  return isPivotAggregationChoice(value) ? value : null
}

function isPivotAggregationChoice(
  value: string,
): value is (typeof PIVOT_AGGREGATION_CHOICES)[number] {
  return PIVOT_AGGREGATION_CHOICES.includes(value as (typeof PIVOT_AGGREGATION_CHOICES)[number])
}

function fieldInZone(field: PivotToolPanelField, zone: PivotToolPanelZone): boolean {
  if (zone === "rowGroups") return field.inRowGroups
  if (zone === "colGroups") return field.inColumnGroups
  return field.inValues
}

function addUnique(entries: readonly ColumnId[], columnId: ColumnId): readonly ColumnId[] {
  return entries.includes(columnId) ? entries : [...entries, columnId]
}

function moveEntry<T>(
  entries: readonly T[],
  matches: (entry: T) => boolean,
  offset: -1 | 1,
): readonly T[] {
  const index = entries.findIndex(matches)
  const nextIndex = index + offset
  if (index < 0 || nextIndex < 0 || nextIndex >= entries.length) return entries
  const next = [...entries]
  const [entry] = next.splice(index, 1)
  if (entry === undefined) return entries
  next.splice(nextIndex, 0, entry)
  return next
}

function writePivotDragPayload(event: DragEvent<HTMLElement>, payload: PivotDragPayload): void {
  event.dataTransfer.setData(PIVOT_DRAG_MIME, JSON.stringify(payload))
  event.dataTransfer.setData("text/plain", payload.columnId)
  event.dataTransfer.effectAllowed = "move"
}

function readPivotDragPayload(event: DragEvent<HTMLElement>): PivotDragPayload | null {
  const serialized = event.dataTransfer.getData(PIVOT_DRAG_MIME)
  if (serialized) {
    try {
      const payload = JSON.parse(serialized) as Partial<PivotDragPayload>
      if (typeof payload.columnId === "string") {
        return {
          columnId: payload.columnId,
          sourceZone: isPivotToolPanelZone(payload.sourceZone) ? payload.sourceZone : undefined,
        }
      }
    } catch {
      return null
    }
  }

  const columnId = event.dataTransfer.getData("text/plain")
  return columnId ? { columnId } : null
}

function isPivotToolPanelZone(value: unknown): value is PivotToolPanelZone {
  return value === "rowGroups" || value === "colGroups" || value === "values"
}

function pivotToolPanelLabel<TRow>(column: BcReactGridColumn<TRow>, columnId: ColumnId): string {
  return typeof column.header === "string" ? column.header : columnId
}

function isNumericColumnFormat(format: BcColumnFormat | undefined): boolean {
  if (!format) return false
  if (typeof format === "string")
    return format === "number" || format === "currency" || format === "percent"
  return format.type === "number" || format.type === "currency" || format.type === "percent"
}
