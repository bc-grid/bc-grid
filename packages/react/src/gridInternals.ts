import {
  AnimationBudget,
  type FlipRect,
  type FlipTarget,
  calculateFlipDelta,
  flip,
  readFlipRect,
  slide,
} from "@bc-grid/animations"
import type {
  BcCellPosition,
  BcColumnStateEntry,
  BcGridFilter,
  BcGridSort,
  BcSelection,
  ColumnId,
  RowId,
} from "@bc-grid/core"
import type { Virtualizer } from "@bc-grid/virtualizer"
import {
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { type ColumnResizeSession, computeResizedWidth } from "./columnResize"
import type { BcGridDensity, BcGridMessages, BcGridProps, BcReactGridColumn } from "./types"

// ---------------------------------------------------------------------------
// Defaults shared across the React layer.
// ---------------------------------------------------------------------------

export const DEFAULT_COL_WIDTH = 120
export const DEFAULT_VIEWPORT_WIDTH = 800
export const DEFAULT_BODY_HEIGHT = 360

export const densityRowHeights: Record<BcGridDensity, number> = {
  compact: 28,
  normal: 36,
  comfortable: 44,
}

export const densityHeaderHeights: Record<BcGridDensity, number> = {
  compact: 34,
  normal: 40,
  comfortable: 48,
}

export const defaultMessages: BcGridMessages = {
  noRowsLabel: "No rows",
  loadingLabel: "Loading",
  actionColumnLabel: "Actions",
  editLabel: "Edit",
  deleteLabel: "Delete",
  statusBarLabel: "Grid status",
  filterPlaceholder: "Filter",
  filterAriaLabel: ({ columnLabel }) => `Filter ${columnLabel}`,
  filterMinPlaceholder: "Min",
  filterMaxPlaceholder: "Max",
  sortAnnounce: ({ columnLabel, direction }) =>
    `Sorted by ${columnLabel} ${direction === "asc" ? "ascending" : "descending"}.`,
  sortClearedAnnounce: () => "Sorting cleared.",
  filterAnnounce: ({ visibleRows, totalRows }) =>
    `Filter applied. ${visibleRows} of ${totalRows} rows shown.`,
  filterClearedAnnounce: ({ totalRows }) => `Filter cleared. ${totalRows} rows shown.`,
  selectionAnnounce: ({ count }) => (count === 1 ? "1 row selected." : `${count} rows selected.`),
  selectionClearedAnnounce: () => "Selection cleared.",
  editCommittedAnnounce: ({ columnLabel, rowLabel, formattedValue }) =>
    `Updated ${columnLabel} for ${rowLabel} to ${formattedValue}.`,
  editValidationErrorAnnounce: ({ columnLabel, error }) =>
    `${columnLabel} was not updated. ${error}`,
  editServerErrorAnnounce: ({ columnLabel, error }) =>
    `${columnLabel} update failed. ${error} Reverted.`,
}

// ---------------------------------------------------------------------------
// Internal types shared by the rendering layer.
// ---------------------------------------------------------------------------

export interface DataRowEntry<TRow> {
  kind: "data"
  row: TRow
  rowId: RowId
  index: number
  level?: number
}

export interface GroupRowEntry {
  kind: "group"
  rowId: RowId
  index: number
  level: number
  label: string
  childCount: number
  childRowIds: readonly RowId[]
  expanded: boolean
}

export type RowEntry<TRow> = DataRowEntry<TRow> | GroupRowEntry

export function isDataRowEntry<TRow>(entry: RowEntry<TRow>): entry is DataRowEntry<TRow> {
  return entry.kind === "data"
}

export interface ResolvedColumn<TRow> {
  source: BcReactGridColumn<TRow, unknown>
  columnId: ColumnId
  left: number
  width: number
  align: "left" | "right" | "center"
  pinned: "left" | "right" | null
  position: number
}

export interface FlattenedColumnDefinition<TRow> {
  column: BcReactGridColumn<TRow, unknown>
  columnId: ColumnId
  groupPath: readonly ColumnGroupPathEntry<TRow>[]
  originalIndex: number
}

export interface FlattenColumnDefinitionsOptions {
  includeHidden?: boolean
}

export interface ColumnGroupPathEntry<TRow> {
  groupId: ColumnId
  header: ReactNode
  source: BcReactGridColumn<TRow, unknown>
}

export interface ColumnGroupHeaderCell<TRow> {
  groupId: ColumnId
  header: ReactNode
  source: BcReactGridColumn<TRow, unknown>
  depth: number
  ariaColIndex: number
  ariaColSpan: number
  left: number
  width: number
  pinned: "left" | "right" | null
  pinnedEdge: "left" | "right" | null
  leafColumnIds: readonly ColumnId[]
}

export interface ViewportSize {
  height: number
  width: number
}

// ---------------------------------------------------------------------------
// Column resolution.
// ---------------------------------------------------------------------------

export function resolveColumns<TRow>(
  columns: readonly BcReactGridColumn<TRow>[],
  columnState: readonly BcColumnStateEntry[],
): ResolvedColumn<TRow>[] {
  const stateById = new Map(columnState.map((entry) => [entry.columnId, entry]))
  const resolved = flattenColumnDefinitions(columns).flatMap(
    ({ column, columnId, originalIndex }) => {
      const state = stateById.get(columnId)
      if (state?.hidden ?? column.hidden) return []

      const pinned = state?.pinned === null ? null : (state?.pinned ?? column.pinned ?? null)
      const requestedWidth = state?.width ?? column.width ?? DEFAULT_COL_WIDTH
      const minWidth = column.minWidth ?? 48
      const maxWidth = column.maxWidth ?? Number.POSITIVE_INFINITY
      const width = clamp(requestedWidth, minWidth, maxWidth)
      return [
        {
          align: column.align ?? "left",
          columnId,
          left: 0,
          pinned,
          position: state?.position ?? originalIndex,
          source: column,
          width,
        } satisfies ResolvedColumn<TRow>,
      ]
    },
  )

  const byPosition = (a: ResolvedColumn<TRow>, b: ResolvedColumn<TRow>) => a.position - b.position
  const ordered = [
    ...resolved.filter((column) => column.pinned === "left").sort(byPosition),
    ...resolved.filter((column) => column.pinned === null).sort(byPosition),
    ...resolved.filter((column) => column.pinned === "right").sort(byPosition),
  ]

  let left = 0
  return ordered.map((column) => {
    const next = { ...column, left }
    left += column.width
    return next
  })
}

export function flattenColumnDefinitions<TRow>(
  columns: readonly BcReactGridColumn<TRow>[],
  options: FlattenColumnDefinitionsOptions = {},
): FlattenedColumnDefinition<TRow>[] {
  const leaves: FlattenedColumnDefinition<TRow>[] = []
  const includeHidden = options.includeHidden === true

  const visit = (
    candidates: readonly BcReactGridColumn<TRow>[],
    groupPath: readonly ColumnGroupPathEntry<TRow>[],
    indexPath: readonly number[],
  ) => {
    candidates.forEach((column, index) => {
      if (column.hidden && !includeHidden) return
      const children = column.children?.filter((child) => includeHidden || !child.hidden) ?? []
      if (children.length > 0) {
        const groupId = columnGroupIdFor(column, [...indexPath, index])
        visit(
          children,
          [
            ...groupPath,
            {
              groupId,
              header: column.header,
              source: column as BcReactGridColumn<TRow, unknown>,
            },
          ],
          [...indexPath, index],
        )
        return
      }

      const originalIndex = leaves.length
      leaves.push({
        column: column as BcReactGridColumn<TRow, unknown>,
        columnId: columnIdFor(column, originalIndex),
        groupPath,
        originalIndex,
      })
    })
  }

  visit(columns, [], [])
  return leaves
}

export function deriveColumnGroupHeaderRows<TRow>(
  columns: readonly BcReactGridColumn<TRow>[],
  resolvedColumns: readonly ResolvedColumn<TRow>[],
): ColumnGroupHeaderCell<TRow>[][] {
  const flattened = flattenColumnDefinitions(columns)
  const groupPathByColumnId = new Map(flattened.map((leaf) => [leaf.columnId, leaf.groupPath]))
  const maxDepth = flattened.reduce((depth, leaf) => Math.max(depth, leaf.groupPath.length), 0)
  if (maxDepth === 0 || resolvedColumns.length === 0) return []

  const rows: ColumnGroupHeaderCell<TRow>[][] = []

  for (let depth = 0; depth < maxDepth; depth++) {
    const row: ColumnGroupHeaderCell<TRow>[] = []
    let active: {
      group: ColumnGroupPathEntry<TRow>
      startIndex: number
      endIndex: number
      pinned: "left" | "right" | null
      leafColumnIds: ColumnId[]
      width: number
    } | null = null

    const flush = () => {
      if (!active) return
      const firstColumn = resolvedColumns[active.startIndex]
      if (!firstColumn) {
        active = null
        return
      }
      row.push({
        ariaColIndex: active.startIndex + 1,
        ariaColSpan: active.leafColumnIds.length,
        depth,
        groupId: active.group.groupId,
        header: active.group.header,
        leafColumnIds: active.leafColumnIds,
        left: firstColumn.left,
        pinned: active.pinned,
        pinnedEdge: pinnedEdgeForGroupSpan(resolvedColumns, active.startIndex, active.endIndex),
        source: active.group.source,
        width: active.width,
      })
      active = null
    }

    resolvedColumns.forEach((column, index) => {
      const group = groupPathByColumnId.get(column.columnId)?.[depth]
      if (!group) {
        flush()
        return
      }

      if (active && active.group.groupId === group.groupId && active.pinned === column.pinned) {
        active.endIndex = index
        active.leafColumnIds.push(column.columnId)
        active.width += column.width
        return
      }

      flush()
      active = {
        endIndex: index,
        group,
        leafColumnIds: [column.columnId],
        pinned: column.pinned,
        startIndex: index,
        width: column.width,
      }
    })

    flush()
    rows.push(row)
  }

  return rows.filter((row) => row.length > 0)
}

export function columnIdFor<TRow>(
  column: BcReactGridColumn<TRow>,
  originalIndex: number,
): ColumnId {
  return column.columnId ?? column.field ?? `column-${originalIndex}`
}

function columnGroupIdFor<TRow>(
  column: BcReactGridColumn<TRow>,
  indexPath: readonly number[],
): ColumnId {
  return column.columnId ?? column.field ?? `group-${indexPath.join("-")}`
}

function pinnedEdgeForGroupSpan<TRow>(
  columns: readonly ResolvedColumn<TRow>[],
  startIndex: number,
  endIndex: number,
): "left" | "right" | null {
  const first = columns[startIndex]
  const last = columns[endIndex]
  if (!first || !last || first.pinned !== last.pinned) return null
  if (last.pinned === "left" && columns[endIndex + 1]?.pinned !== "left") return "left"
  if (first.pinned === "right" && columns[startIndex - 1]?.pinned !== "right") return "right"
  return null
}

/**
 * Decide whether the inline filter row should render. The
 * `showFilterRow` prop on `BcGridProps` overrides the column-driven
 * default so host apps can wire a filter-toggle button without
 * touching column definitions.
 *
 * - `undefined` (default) — row renders iff at least one column has
 *   an inline-variant filter configured.
 * - `true` — force visible.
 * - `false` — force hidden. Active filter state (`columnFilterText` /
 *   `BcGridFilter`) is independent of this flag and is preserved.
 */
export function resolveFilterRowVisibility<TRow>(
  showFilterRow: boolean | undefined,
  resolvedColumns: readonly ResolvedColumn<TRow>[],
): boolean {
  if (showFilterRow === false) return false
  if (showFilterRow === true) return true
  return resolvedColumns.some((column) => {
    const filter = column.source.filter
    if (filter === false || filter == null) return false
    return filter.variant !== "popup"
  })
}

export function deriveColumnState<TRow>(
  resolvedColumns: readonly ResolvedColumn<TRow>[],
  columnState: readonly BcColumnStateEntry[],
): BcColumnStateEntry[] {
  if (columnState.length > 0) return [...columnState]
  return resolvedColumns.map((column, position) => ({
    columnId: column.columnId,
    pinned: column.pinned,
    position,
    width: column.width,
  }))
}

export function buildLayoutColumnState<TRow>(
  columns: readonly BcReactGridColumn<TRow>[],
  columnState: readonly BcColumnStateEntry[],
): BcColumnStateEntry[] {
  const stateById = new Map(columnState.map((entry) => [entry.columnId, entry]))
  return flattenColumnDefinitions(columns, { includeHidden: true }).map(
    ({ column, columnId, originalIndex }) => {
      const state = stateById.get(columnId)
      const entry: BcColumnStateEntry = {
        columnId,
        hidden: state?.hidden ?? column.hidden ?? false,
        pinned: hasOwnColumnStateValue(state, "pinned")
          ? (state.pinned ?? null)
          : (column.pinned ?? null),
        position: state?.position ?? originalIndex,
        width: state?.width ?? column.width ?? DEFAULT_COL_WIDTH,
      }

      const flex = state?.flex ?? column.flex
      if (typeof flex === "number" && Number.isFinite(flex) && flex > 0) entry.flex = flex
      if (hasOwnColumnStateValue(state, "sortDirection")) {
        entry.sortDirection = state.sortDirection ?? null
      }
      if (hasOwnColumnStateValue(state, "sortIndex")) {
        entry.sortIndex = state.sortIndex ?? null
      }

      return entry
    },
  )
}

export function mergeLayoutColumnState<TRow>(
  columns: readonly BcReactGridColumn<TRow>[],
  currentColumnState: readonly BcColumnStateEntry[],
  layoutColumnState: readonly BcColumnStateEntry[],
): BcColumnStateEntry[] {
  const base = buildLayoutColumnState(columns, currentColumnState)
  const knownIds = new Set(base.map((entry) => entry.columnId))
  const layoutById = new Map<ColumnId, BcColumnStateEntry>()
  for (const entry of layoutColumnState) {
    if (knownIds.has(entry.columnId)) layoutById.set(entry.columnId, entry)
  }

  return base.map((baseEntry) => {
    const layoutEntry = layoutById.get(baseEntry.columnId)
    if (!layoutEntry) return baseEntry

    const next: BcColumnStateEntry = { columnId: baseEntry.columnId }
    next.hidden = hasOwnColumnStateValue(layoutEntry, "hidden")
      ? layoutEntry.hidden === true
      : (baseEntry.hidden ?? false)
    next.pinned = hasOwnColumnStateValue(layoutEntry, "pinned")
      ? normalizePinned(layoutEntry.pinned, baseEntry.pinned ?? null)
      : (baseEntry.pinned ?? null)

    const position = normalizeStateNumber(layoutEntry.position, baseEntry.position)
    if (position !== undefined) next.position = position
    const width = normalizeStateNumber(layoutEntry.width, baseEntry.width)
    if (width !== undefined) next.width = width
    const flex = normalizeStateNumber(layoutEntry.flex, baseEntry.flex)
    if (flex !== undefined && flex > 0) next.flex = flex
    if (hasOwnColumnStateValue(layoutEntry, "sortDirection")) {
      next.sortDirection =
        layoutEntry.sortDirection === "asc" || layoutEntry.sortDirection === "desc"
          ? layoutEntry.sortDirection
          : null
    } else if (hasOwnColumnStateValue(baseEntry, "sortDirection")) {
      next.sortDirection = baseEntry.sortDirection ?? null
    }
    if (hasOwnColumnStateValue(layoutEntry, "sortIndex")) {
      next.sortIndex =
        typeof layoutEntry.sortIndex === "number" && Number.isFinite(layoutEntry.sortIndex)
          ? Math.max(0, Math.floor(layoutEntry.sortIndex))
          : null
    } else if (hasOwnColumnStateValue(baseEntry, "sortIndex")) {
      next.sortIndex = baseEntry.sortIndex ?? null
    }

    return next
  })
}

export function pruneLayoutSortForColumns(
  sort: readonly BcGridSort[] | undefined,
  columnIds: ReadonlySet<ColumnId>,
): readonly BcGridSort[] | undefined {
  if (sort === undefined) return undefined
  return sort.filter(
    (entry) =>
      columnIds.has(entry.columnId) && (entry.direction === "asc" || entry.direction === "desc"),
  )
}

export function pruneLayoutGroupByForColumns(
  groupBy: readonly ColumnId[] | undefined,
  columnIds: ReadonlySet<ColumnId>,
): readonly ColumnId[] | undefined {
  if (groupBy === undefined) return undefined
  return groupBy.filter((columnId) => columnIds.has(columnId))
}

export function pruneLayoutFilterForColumns(
  filter: BcGridFilter | null | undefined,
  columnIds: ReadonlySet<ColumnId>,
): BcGridFilter | null | undefined {
  if (filter === undefined) return undefined
  if (filter === null) return null
  if (filter.kind === "column") return columnIds.has(filter.columnId) ? filter : null

  const filters = filter.filters.flatMap((child) => {
    const next = pruneLayoutFilterForColumns(child, columnIds)
    return next ? [next] : []
  })
  if (filters.length === 0) return null
  return { ...filter, filters }
}

function hasOwnColumnStateValue<K extends keyof BcColumnStateEntry>(
  entry: BcColumnStateEntry | undefined,
  key: K,
): entry is BcColumnStateEntry & Required<Pick<BcColumnStateEntry, K>> {
  return entry != null && Object.prototype.hasOwnProperty.call(entry, key)
}

function normalizeStateNumber(
  value: number | undefined,
  fallback: number | undefined,
): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  return typeof fallback === "number" && Number.isFinite(fallback) ? fallback : undefined
}

function normalizePinned(
  value: BcColumnStateEntry["pinned"] | undefined,
  fallback: "left" | "right" | null,
): "left" | "right" | null {
  if (value === "left" || value === "right" || value === null) return value
  return fallback
}

// ---------------------------------------------------------------------------
// Style helpers.
// ---------------------------------------------------------------------------

export interface CellStyleParams {
  align: "left" | "right" | "center"
  height: number
  left: number
  pinned: "left" | "right" | null
  scrollLeft: number
  totalWidth: number
  viewportWidth: number
  width: number
  zIndex?: number
}

export function cellStyle({
  align,
  height,
  left,
  pinned,
  scrollLeft,
  totalWidth,
  viewportWidth,
  width,
  zIndex,
}: CellStyleParams): CSSProperties {
  return {
    alignItems: "center",
    display: "flex",
    height,
    justifyContent: alignToJustify(align),
    left,
    minWidth: 0,
    overflow: "hidden",
    paddingInline: "var(--bc-grid-cell-padding-x, 12px)",
    position: "absolute",
    textAlign: align,
    textOverflow: "ellipsis",
    top: 0,
    transform: pinnedTransformValue(pinned, scrollLeft, totalWidth, viewportWidth),
    whiteSpace: "nowrap",
    width,
    zIndex: zIndex ?? (pinned ? 2 : 1),
  }
}

export function rootStyle(height: number | "auto" | undefined): CSSProperties {
  if (height === "auto") {
    // Page-flow mode: the grid grows to fit its rendered content and
    // the page scrolls naturally. No fixed root height; min-height: 0
    // keeps it shrinkable inside flex parents.
    return {
      display: "flex",
      flexDirection: "column",
      minHeight: 0,
      outline: "none",
      position: "relative",
    }
  }
  return {
    display: "flex",
    flexDirection: "column",
    height,
    minHeight: height ? undefined : 0,
    outline: "none",
    position: "relative",
  }
}

export const headerViewportStyle: CSSProperties = {
  flex: "0 0 auto",
  overflow: "hidden",
  position: "relative",
  zIndex: 3,
}

export const autoHeightHeaderViewportStyle: CSSProperties = {
  ...headerViewportStyle,
  position: "sticky",
  top: 0,
  zIndex: 4,
}

export function headerRowStyle(width: number, height: number, scrollLeft: number): CSSProperties {
  return {
    height,
    minWidth: "100%",
    position: "relative",
    transform: `translate3d(${-scrollLeft}px, 0, 0)`,
    width: Math.max(width, 1),
  }
}

export function scrollerStyle(bodyHeight: number | undefined, pageFlow = false): CSSProperties {
  if (pageFlow) {
    // Auto-height mode: the scroller does not own vertical scrolling —
    // it grows to match its canvas content height and the page scrolls
    // through it. It still owns horizontal scrolling so header/body
    // scrollLeft synchronization continues to use the same element.
    return {
      flex: "0 0 auto",
      overflowX: "auto",
      overflowY: "hidden",
      position: "relative",
    }
  }
  return {
    flex: bodyHeight == null ? "1 1 auto" : "0 0 auto",
    height: bodyHeight,
    minHeight: bodyHeight == null ? 0 : undefined,
    overflow: "auto",
    position: "relative",
  }
}

export function canvasStyle(height: number, width: number): CSSProperties {
  return {
    height: Math.max(height, 1),
    minWidth: "100%",
    position: "relative",
    width: Math.max(width, 1),
  }
}

export function rowStyle(top: number, height: number, width: number): CSSProperties {
  return {
    height,
    minWidth: "100%",
    position: "absolute",
    top,
    width: Math.max(width, 1),
  }
}

export const overlayStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  inset: 0,
  justifyContent: "center",
  pointerEvents: "none",
  position: "absolute",
}

/**
 * Visually-hidden style for live-region elements. Off-screen but
 * positioned (not display:none) so screen readers can read updates.
 * Standard "sr-only" pattern.
 */
export const visuallyHiddenStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
}

export function alignToJustify(
  align: "left" | "right" | "center",
): CSSProperties["justifyContent"] {
  if (align === "right") return "flex-end"
  if (align === "center") return "center"
  return "flex-start"
}

export function pinnedTransformValue(
  pinned: "left" | "right" | null,
  scrollLeft: number,
  totalWidth: number,
  viewportWidth: number,
): string | undefined {
  if (pinned === "left") return `translate3d(${scrollLeft}px, 0, 0)`
  if (pinned === "right") {
    return `translate3d(${scrollLeft + viewportWidth - totalWidth}px, 0, 0)`
  }
  return undefined
}

// ---------------------------------------------------------------------------
// DOM utilities.
// ---------------------------------------------------------------------------

export function classNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ")
}

export function pinnedClassName(pinned: "left" | "right" | null): string | undefined {
  if (pinned === "left") return "bc-grid-cell-pinned-left"
  if (pinned === "right") return "bc-grid-cell-pinned-right"
  return undefined
}

export function pinnedEdgeFor(
  columns: readonly { pinned: "left" | "right" | null }[],
  index: number,
): "left" | "right" | null {
  const column = columns[index]
  if (!column?.pinned) return null
  if (column.pinned === "left" && columns[index + 1]?.pinned !== "left") return "left"
  if (column.pinned === "right" && columns[index - 1]?.pinned !== "right") return "right"
  return null
}

export function pinnedEdgeClassName(edge: "left" | "right" | null): string | undefined {
  if (edge === "left") return "bc-grid-cell-pinned-left-edge"
  if (edge === "right") return "bc-grid-cell-pinned-right-edge"
  return undefined
}

export function hasProp(object: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key)
}

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}

export function domToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_")
}

export function headerDomId(baseId: string, columnId: ColumnId): string {
  return `${baseId}-header-${domToken(columnId)}`
}

export function cellDomId(baseId: string, rowId: RowId, columnId: ColumnId): string {
  return `${baseId}-cell-${domToken(rowId)}-${domToken(columnId)}`
}

export function visibleBodyRows(scroller: HTMLElement): HTMLElement[] {
  const viewport = scroller.getBoundingClientRect()
  return Array.from(scroller.querySelectorAll<HTMLElement>(".bc-grid-row[data-row-id]")).filter(
    (row) => {
      const rect = row.getBoundingClientRect()
      return rect.bottom > viewport.top && rect.top < viewport.bottom
    },
  )
}

export function applyScroll(
  scroller: HTMLDivElement | null,
  virtualizer: Virtualizer,
  top: number | undefined,
  left: number | undefined,
  setScrollOffset: (next: { top: number; left: number }) => void,
): void {
  if (!scroller) return
  if (top != null) scroller.scrollTop = top
  if (left != null) scroller.scrollLeft = left
  virtualizer.setScrollTop(scroller.scrollTop)
  virtualizer.setScrollLeft(scroller.scrollLeft)
  setScrollOffset({ top: scroller.scrollTop, left: scroller.scrollLeft })
}

export function createEmptySelection(): BcSelection {
  return { mode: "explicit", rowIds: new Set<RowId>() }
}

export function assignRef<T>(ref: RefObject<T | null> | undefined, value: T): () => void {
  if (!ref) return () => {}
  ref.current = value
  return () => {
    if (ref.current === value) ref.current = null
  }
}

// ---------------------------------------------------------------------------
// Controlled-state utilities.
// ---------------------------------------------------------------------------

export function useControlledState<T>(
  controlled: boolean,
  controlledValue: T,
  defaultValue: T,
  onChange: ((next: T, prev: T) => void) | undefined,
): [T, (next: T) => void] {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue)
  const value = controlled ? controlledValue : uncontrolledValue
  const setValue = useCallback(
    (next: T) => {
      const prev = controlled ? controlledValue : uncontrolledValue
      if (Object.is(prev, next)) return
      if (!controlled) setUncontrolledValue(next)
      onChange?.(next, prev)
    },
    [controlled, controlledValue, onChange, uncontrolledValue],
  )
  return [value, setValue]
}

export function assertNoMixedControlledProps<TRow>(props: BcGridProps<TRow>): void {
  const pairs: Array<[keyof BcGridProps<TRow>, keyof BcGridProps<TRow>]> = [
    ["sort", "defaultSort"],
    ["searchText", "defaultSearchText"],
    ["filter", "defaultFilter"],
    ["selection", "defaultSelection"],
    ["rangeSelection", "defaultRangeSelection"],
    ["expansion", "defaultExpansion"],
    ["groupBy", "defaultGroupBy"],
    ["pivotState", "defaultPivotState"],
    ["columnState", "defaultColumnState"],
    ["activeCell", "defaultActiveCell"],
    ["page", "defaultPage"],
    ["pageSize", "defaultPageSize"],
    ["sidebarPanel", "defaultSidebarPanel"],
  ]

  for (const [controlled, uncontrolled] of pairs) {
    if (hasProp(props, controlled) && hasProp(props, uncontrolled)) {
      throw new Error(
        `BcGrid received both ${String(controlled)} and ${String(
          uncontrolled,
        )}. Use either controlled or uncontrolled state for a pair, not both.`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Live-region announcements (sort / filter / selection).
// ---------------------------------------------------------------------------

/**
 * Find the sort key that was added or whose direction changed between
 * `prev` and `next`. Returns `null` for pure-removal transitions (handled
 * separately as "Sorting cleared." when nothing remains, otherwise silent
 * — the visual update is sufficient).
 */
export function pickChangedSort(
  prev: readonly BcGridSort[],
  next: readonly BcGridSort[],
): BcGridSort | null {
  const prevById = new Map(prev.map((entry) => [entry.columnId, entry.direction]))
  for (const entry of next) {
    const prevDirection = prevById.get(entry.columnId)
    if (prevDirection !== entry.direction) return entry
  }
  return null
}

export interface UseLiveRegionAnnouncementsParams<TRow> {
  sortState: readonly BcGridSort[]
  resolvedColumns: readonly ResolvedColumn<TRow>[]
  activeFilter: BcGridFilter | null
  rowEntries: readonly RowEntry<TRow>[]
  data: readonly TRow[]
  selectionState: BcSelection
  messages: BcGridMessages
}

export function useLiveRegionAnnouncements<TRow>({
  sortState,
  resolvedColumns,
  activeFilter,
  rowEntries,
  data,
  selectionState,
  messages,
}: UseLiveRegionAnnouncementsParams<TRow>): {
  politeMessage: string
  assertiveMessage: string
  announcePolite: (message: string) => void
  announceAssertive: (message: string) => void
} {
  const [politeMessage, setPoliteMessage] = useState("")
  const [assertiveMessage, setAssertiveMessage] = useState("")
  const selectionAnnounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Selection changes are low-priority; a click that selects a row and
  // immediately starts/commits edit mode should not overwrite the edit
  // commit announcement that follows.
  const suppressSelectionAnnouncementsUntilRef = useRef(0)
  // Polite-region debounce per `editing-rfc §Live Region announcements`:
  // Tab-through-10-cells emits 10 commits in rapid succession; without a
  // tail debounce the AT queue would announce all of them and lag behind
  // the user. 250ms tail; the latest message wins. Assertive announcements
  // are deliberately not debounced — errors are individually important.
  const politeAnnounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const schedulePolite = useCallback((message: string) => {
    if (politeAnnounceTimerRef.current) clearTimeout(politeAnnounceTimerRef.current)
    politeAnnounceTimerRef.current = setTimeout(() => {
      setPoliteMessage(message)
      politeAnnounceTimerRef.current = null
    }, 250)
  }, [])
  const announcePolite = useCallback(
    (message: string) => {
      suppressSelectionAnnouncementsUntilRef.current = performance.now() + 500
      if (selectionAnnounceTimerRef.current) {
        clearTimeout(selectionAnnounceTimerRef.current)
        selectionAnnounceTimerRef.current = null
      }
      schedulePolite(message)
    },
    [schedulePolite],
  )
  const announceAssertive = useCallback((message: string) => {
    setAssertiveMessage(message)
  }, [])
  useEffect(() => {
    return () => {
      if (politeAnnounceTimerRef.current) clearTimeout(politeAnnounceTimerRef.current)
    }
  }, [])

  // Announce sort changes. Compares to a ref of the previous sort state so
  // we only announce when it actually changes, not on initial mount. With
  // multi-column sort, announce whichever key was just added or whose
  // direction changed (not always sortState[0] — Shift+click appends to
  // the tail, leaving the head untouched).
  const prevSortStateRef = useRef<readonly BcGridSort[]>(sortState)
  useEffect(() => {
    const prev = prevSortStateRef.current
    prevSortStateRef.current = sortState
    if (prev === sortState) return
    if (sortState.length === 0 && prev.length > 0) {
      announcePolite(messages.sortClearedAnnounce())
      return
    }
    const changed = pickChangedSort(prev, sortState)
    if (!changed) return
    const column = resolvedColumns.find((c) => c.columnId === changed.columnId)
    const columnLabel =
      typeof column?.source.header === "string" ? column.source.header : changed.columnId
    announcePolite(messages.sortAnnounce({ columnLabel, direction: changed.direction }))
  }, [sortState, resolvedColumns, messages, announcePolite])

  // Announce filter changes. Includes visible / total row counts so users
  // know how aggressively the filter narrowed the dataset.
  const prevFilterRef = useRef<BcGridFilter | null>(null)
  useEffect(() => {
    const prev = prevFilterRef.current
    prevFilterRef.current = activeFilter
    if (prev === activeFilter) return
    if (!activeFilter && prev) {
      announcePolite(messages.filterClearedAnnounce({ totalRows: data.length }))
      return
    }
    if (activeFilter) {
      announcePolite(
        messages.filterAnnounce({ visibleRows: rowEntries.length, totalRows: data.length }),
      )
    }
  }, [activeFilter, rowEntries.length, data.length, messages, announcePolite])

  // Debounced selection announcement so rapid Shift-click range selection
  // doesn't queue a message per row.
  const prevSelectionSizeRef = useRef<number>(0)
  useEffect(() => {
    const size = selectionState.mode === "explicit" ? selectionState.rowIds.size : -1
    const prev = prevSelectionSizeRef.current
    prevSelectionSizeRef.current = size
    if (size === prev) return
    if (selectionAnnounceTimerRef.current) clearTimeout(selectionAnnounceTimerRef.current)
    selectionAnnounceTimerRef.current = setTimeout(() => {
      selectionAnnounceTimerRef.current = null
      if (performance.now() < suppressSelectionAnnouncementsUntilRef.current) return
      if (size === 0) schedulePolite(messages.selectionClearedAnnounce())
      else if (size > 0) schedulePolite(messages.selectionAnnounce({ count: size }))
      // size < 0 means "all" / "filtered" mode — count is consumer-specific;
      // skip the announce until the consumer wires their own.
    }, 200)
    return () => {
      if (selectionAnnounceTimerRef.current) clearTimeout(selectionAnnounceTimerRef.current)
    }
  }, [selectionState, messages, schedulePolite])

  return { politeMessage, assertiveMessage, announcePolite, announceAssertive }
}

// ---------------------------------------------------------------------------
// Viewport sync via ResizeObserver, coalesced to one render per RAF.
// ---------------------------------------------------------------------------

export interface UseViewportSyncParams {
  scrollerRef: RefObject<HTMLDivElement | null>
  virtualizer: Virtualizer
  fallbackBodyHeight: number
  requestRender: () => void
}

export function useViewportSync({
  scrollerRef,
  virtualizer,
  fallbackBodyHeight,
  requestRender,
}: UseViewportSyncParams): {
  viewport: ViewportSize
  setViewport: (next: ViewportSize) => void
} {
  const [viewport, setViewport] = useState<ViewportSize>({
    height: fallbackBodyHeight,
    width: DEFAULT_VIEWPORT_WIDTH,
  })

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    let frame = 0
    const syncViewport = () => {
      frame = 0
      const nextViewport = {
        height: scroller.clientHeight || fallbackBodyHeight,
        width: scroller.clientWidth || DEFAULT_VIEWPORT_WIDTH,
      }
      virtualizer.setViewport(nextViewport.height, nextViewport.width)
      setViewport(nextViewport)
      requestRender()
    }

    syncViewport()

    if (typeof ResizeObserver === "undefined") return undefined

    const resizeObserver = new ResizeObserver(() => {
      if (frame !== 0) return
      frame = requestAnimationFrame(syncViewport)
    })
    resizeObserver.observe(scroller)

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      resizeObserver.disconnect()
    }
  }, [fallbackBodyHeight, requestRender, scrollerRef, virtualizer])

  return { viewport, setViewport }
}

// ---------------------------------------------------------------------------
// Column resize gesture.
// ---------------------------------------------------------------------------

export interface UseColumnResizeParams {
  columnState: readonly BcColumnStateEntry[]
  setColumnState: (next: readonly BcColumnStateEntry[]) => void
}

export function useColumnResize<TRow>({ columnState, setColumnState }: UseColumnResizeParams): {
  handleResizePointerDown: (
    column: ResolvedColumn<TRow>,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void
  handleResizePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void
  endResize: (event: ReactPointerEvent<HTMLDivElement>) => void
} {
  // Held in a ref so pointer-move callbacks don't trigger re-renders just to
  // read the session; actual width updates flow through setColumnState.
  const resizeSessionRef = useRef<ColumnResizeSession | null>(null)

  const commitColumnWidth = useCallback(
    (columnId: ColumnId, width: number) => {
      const next = columnState.some((entry) => entry.columnId === columnId)
        ? columnState.map((entry) => (entry.columnId === columnId ? { ...entry, width } : entry))
        : [...columnState, { columnId, width }]
      setColumnState(next)
    },
    [columnState, setColumnState],
  )

  const handleResizePointerDown = useCallback(
    (column: ResolvedColumn<TRow>, event: ReactPointerEvent<HTMLDivElement>) => {
      if (column.source.resizable === false) return
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      const handle = event.currentTarget
      handle.setPointerCapture(event.pointerId)
      resizeSessionRef.current = {
        columnId: column.columnId,
        startClientX: event.clientX,
        startWidth: column.width,
        minWidth: column.source.minWidth ?? 48,
        maxWidth: column.source.maxWidth ?? Number.POSITIVE_INFINITY,
      }
    },
    [],
  )

  const handleResizePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const session = resizeSessionRef.current
      if (!session) return
      const next = computeResizedWidth(session, event.clientX)
      commitColumnWidth(session.columnId, next)
    },
    [commitColumnWidth],
  )

  const endResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const handle = event.currentTarget
    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId)
    }
    resizeSessionRef.current = null
  }, [])

  return { handleResizePointerDown, handleResizePointerMove, endResize }
}

// ---------------------------------------------------------------------------
// Column reorder gesture.
// ---------------------------------------------------------------------------

export interface ColumnReorderPreview {
  sourceColumnId: ColumnId
  targetColumnId: ColumnId
  placement: "before" | "after"
  indicatorLeft: number
}

interface ColumnReorderSession {
  sourceColumnId: ColumnId
  sourcePinned: "left" | "right" | null
  pointerId: number
  startClientX: number
  startClientY: number
  dragging: boolean
}

export interface UseColumnReorderParams<TRow> {
  rootRef: RefObject<HTMLDivElement | null>
  columns: readonly ResolvedColumn<TRow>[]
  layoutColumns: readonly ResolvedColumn<TRow>[]
  columnState: readonly BcColumnStateEntry[]
  scrollLeft: number
  totalWidth: number
  viewportWidth: number
  setColumnState: (next: readonly BcColumnStateEntry[]) => void
}

export function useColumnReorder<TRow>({
  rootRef,
  columns,
  layoutColumns,
  columnState,
  scrollLeft,
  totalWidth,
  viewportWidth,
  setColumnState,
}: UseColumnReorderParams<TRow>): {
  columnReorderPreview: ColumnReorderPreview | null
  consumeColumnReorderClickSuppression: () => boolean
  handleReorderPointerDown: (
    column: ResolvedColumn<TRow>,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void
  handleReorderPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void
  endReorder: (event: ReactPointerEvent<HTMLDivElement>) => void
} {
  const reorderSessionRef = useRef<ColumnReorderSession | null>(null)
  const previewRef = useRef<ColumnReorderPreview | null>(null)
  const suppressNextHeaderClickRef = useRef(false)
  const [columnReorderPreview, setColumnReorderPreview] = useState<ColumnReorderPreview | null>(
    null,
  )

  const updatePreview = useCallback((next: ColumnReorderPreview | null) => {
    previewRef.current = next
    setColumnReorderPreview(next)
  }, [])

  const consumeColumnReorderClickSuppression = useCallback(() => {
    if (!suppressNextHeaderClickRef.current) return false
    suppressNextHeaderClickRef.current = false
    return true
  }, [])

  const handleReorderPointerDown = useCallback(
    (column: ResolvedColumn<TRow>, event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      if (!columns.some((entry) => entry.columnId === column.columnId)) return
      reorderSessionRef.current = {
        sourceColumnId: column.columnId,
        sourcePinned: column.pinned,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        dragging: false,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [columns],
  )

  const handleReorderPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const session = reorderSessionRef.current
      if (!session || session.pointerId !== event.pointerId) return

      const deltaX = Math.abs(event.clientX - session.startClientX)
      const deltaY = Math.abs(event.clientY - session.startClientY)
      if (!session.dragging && Math.max(deltaX, deltaY) < 6) return

      session.dragging = true
      suppressNextHeaderClickRef.current = true
      event.preventDefault()

      const target = findColumnReorderTarget({
        clientX: event.clientX,
        columns,
        layoutColumns,
        root: rootRef.current,
        scrollLeft,
        sourceColumnId: session.sourceColumnId,
        sourcePinned: session.sourcePinned,
        totalWidth,
        viewportWidth,
      })
      updatePreview(target)
    },
    [columns, layoutColumns, rootRef, scrollLeft, totalWidth, updatePreview, viewportWidth],
  )

  const endReorder = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const session = reorderSessionRef.current
      if (!session || session.pointerId !== event.pointerId) return
      reorderSessionRef.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      const preview = previewRef.current
      updatePreview(null)
      if (event.type === "pointercancel") return
      if (!session.dragging || !preview) return
      event.preventDefault()
      const next = reorderColumnState({
        columns,
        columnState,
        placement: preview.placement,
        sourceColumnId: session.sourceColumnId,
        targetColumnId: preview.targetColumnId,
      })
      if (next !== columnState) setColumnState(next)
    },
    [columnState, columns, setColumnState, updatePreview],
  )

  return {
    columnReorderPreview,
    consumeColumnReorderClickSuppression,
    handleReorderPointerDown,
    handleReorderPointerMove,
    endReorder,
  }
}

interface FindColumnReorderTargetParams<TRow> {
  clientX: number
  columns: readonly ResolvedColumn<TRow>[]
  layoutColumns: readonly ResolvedColumn<TRow>[]
  root: HTMLDivElement | null
  scrollLeft: number
  sourceColumnId: ColumnId
  sourcePinned: "left" | "right" | null
  totalWidth: number
  viewportWidth: number
}

function findColumnReorderTarget<TRow>({
  clientX,
  columns,
  layoutColumns,
  root,
  scrollLeft,
  sourceColumnId,
  sourcePinned,
  totalWidth,
  viewportWidth,
}: FindColumnReorderTargetParams<TRow>): ColumnReorderPreview | null {
  if (!root) return null
  const viewportLeft = root.getBoundingClientRect().left
  let lastTarget: { columnId: ColumnId; right: number } | null = null

  for (const column of layoutColumns) {
    if (
      column.columnId === sourceColumnId ||
      column.pinned !== sourcePinned ||
      !columns.some((entry) => entry.columnId === column.columnId)
    ) {
      continue
    }

    const left =
      column.pinned === "left"
        ? column.left
        : column.pinned === "right"
          ? column.left + viewportWidth - totalWidth
          : column.left - scrollLeft
    const right = left + column.width
    lastTarget = { columnId: column.columnId, right }
    const midpoint = viewportLeft + left + column.width / 2
    if (clientX < midpoint) {
      return {
        sourceColumnId,
        targetColumnId: column.columnId,
        placement: "before",
        indicatorLeft: clamp(left, 0, viewportWidth),
      }
    }
  }

  if (!lastTarget) return null
  return {
    sourceColumnId,
    targetColumnId: lastTarget.columnId,
    placement: "after",
    indicatorLeft: clamp(lastTarget.right, 0, viewportWidth),
  }
}

interface ReorderColumnStateParams<TRow> {
  columns: readonly ResolvedColumn<TRow>[]
  columnState: readonly BcColumnStateEntry[]
  sourceColumnId: ColumnId
  targetColumnId: ColumnId
  placement: "before" | "after"
}

function reorderColumnState<TRow>({
  columns,
  columnState,
  sourceColumnId,
  targetColumnId,
  placement,
}: ReorderColumnStateParams<TRow>): readonly BcColumnStateEntry[] {
  if (sourceColumnId === targetColumnId) return columnState
  const source = columns.find((column) => column.columnId === sourceColumnId)
  const target = columns.find((column) => column.columnId === targetColumnId)
  if (!source || !target || source.pinned !== target.pinned) return columnState

  const samePinnedIds = columns
    .filter((column) => column.pinned === source.pinned)
    .map((column) => column.columnId)
  const currentSourceIndex = samePinnedIds.indexOf(sourceColumnId)
  const currentTargetIndex = samePinnedIds.indexOf(targetColumnId)
  if (currentSourceIndex < 0 || currentTargetIndex < 0) return columnState

  const nextGroup = samePinnedIds.filter((columnId) => columnId !== sourceColumnId)
  const targetIndexAfterRemoval = nextGroup.indexOf(targetColumnId)
  const insertIndex = placement === "before" ? targetIndexAfterRemoval : targetIndexAfterRemoval + 1
  nextGroup.splice(insertIndex, 0, sourceColumnId)

  let groupCursor = 0
  let changed = false
  const stateById = new Map(columnState.map((entry) => [entry.columnId, entry]))
  for (let position = 0; position < columns.length; position++) {
    const column = columns[position]
    if (!column) return columnState
    const columnId = column.pinned === source.pinned ? nextGroup[groupCursor++] : column.columnId
    if (!columnId) return columnState
    if (columnId !== column.columnId) changed = true
    const existing = stateById.get(columnId)
    stateById.set(columnId, { ...existing, columnId, position })
  }
  return changed ? Array.from(stateById.values()) : columnState
}

// ---------------------------------------------------------------------------
// FLIP animation on sort.
// ---------------------------------------------------------------------------

export interface UseFlipOnSortParams {
  sortState: readonly BcGridSort[]
  scrollerRef: RefObject<HTMLDivElement | null>
  virtualizer: Virtualizer
}

interface RowFlipCandidate extends FlipTarget {
  rowIndex: number
}

const ROW_FLIP_DURATION_MS = 160
const ROW_ENTER_DURATION_MS = 120
const ROW_ENTER_DISTANCE_PX = 4

export function useFlipOnSort({ sortState, scrollerRef, virtualizer }: UseFlipOnSortParams): {
  /**
   * Capture current visible row rects before a sort is committed. The next
   * `useLayoutEffect` after `sortState` changes will play FLIP from these
   * rects to the post-sort positions.
   */
  prepareSortAnimation: () => void
} {
  // Budget is grid-instance-scoped so concurrent sorts don't blow past the
  // design.md §3.2 100-row in-flight cap.
  const flipBudget = useMemo(() => new AnimationBudget(), [])
  const sortFlipRectsRef = useRef<Map<RowId, FlipRect>>(new Map())

  const prepareSortAnimation = useCallback((): void => {
    const rects = new Map<RowId, FlipRect>()
    const scroller = scrollerRef.current
    if (!scroller) {
      sortFlipRectsRef.current = rects
      return
    }
    const rows = visibleBodyRows(scroller)
    for (const row of rows) {
      const id = row.dataset.rowId
      if (id) rects.set(id as RowId, readFlipRect(row))
    }
    sortFlipRectsRef.current = rects
  }, [scrollerRef])

  // After sortState commits and the new row positions render, run FLIP.
  // useLayoutEffect runs synchronously before paint, so we read the new
  // rects (the L of FLIP) and the play() animates from the captured first
  // rects to the rendered last positions. sortState is a deliberate dep
  // even though we don't read its value here — it's the change trigger.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sortState is a re-run trigger
  useLayoutEffect(() => {
    const captured = sortFlipRectsRef.current
    if (captured.size === 0) return
    sortFlipRectsRef.current = new Map()

    const scroller = scrollerRef.current
    if (!scroller) return

    const candidates: RowFlipCandidate[] = []
    const visibleRows = visibleBodyRows(scroller)
    if (visibleRows.length !== captured.size) return

    for (const rowEl of visibleRows) {
      const rowId = rowEl.dataset.rowId as RowId | undefined
      if (!rowId) return
      const first = captured.get(rowId)
      if (!first) return
      const last = readFlipRect(rowEl)
      const maxDelta = Math.max(1, last.height * 1.5)
      if (Math.abs(first.top - last.top) > maxDelta) return
      const candidate = rowFlipCandidate(rowEl, first, last)
      if (candidate) candidates.push(candidate)
    }

    playRowFlipCandidates(candidates, flipBudget, virtualizer)
  }, [flipBudget, sortState, virtualizer, scrollerRef])

  return { prepareSortAnimation }
}

// ---------------------------------------------------------------------------
// FLIP animation when the visible row model changes.
// ---------------------------------------------------------------------------

export interface UseFlipOnRowInsertionParams<TRow> {
  motionKey?: unknown
  rowEntries: readonly RowEntry<TRow>[]
  scrollerRef: RefObject<HTMLDivElement | null>
  virtualizer: Virtualizer
}

export function useFlipOnRowInsertion<TRow>({
  motionKey,
  rowEntries,
  scrollerRef,
  virtualizer,
}: UseFlipOnRowInsertionParams<TRow>): void {
  const flipBudget = useMemo(() => new AnimationBudget(), [])
  const previousRowRectsRef = useRef<Map<RowId, FlipRect>>(new Map())
  const previousRowOrderRef = useRef<readonly RowId[]>([])

  // biome-ignore lint/correctness/useExhaustiveDependencies: rowEntries/motionKey are render-change triggers.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) {
      previousRowRectsRef.current = new Map()
      previousRowOrderRef.current = []
      return
    }

    const rows = visibleBodyRows(scroller)
    const currentRects = new Map<RowId, FlipRect>()
    const currentOrder: RowId[] = []
    for (const row of rows) {
      const rowId = row.dataset.rowId as RowId | undefined
      if (!rowId) continue
      currentOrder.push(rowId)
      currentRects.set(rowId, readFlipRect(row))
    }

    const previousRects = previousRowRectsRef.current
    const previousOrder = previousRowOrderRef.current
    previousRowRectsRef.current = currentRects
    previousRowOrderRef.current = currentOrder
    if (previousRects.size === 0 || currentRects.size === 0) return

    if (sameRowIdSet(previousOrder, currentOrder)) {
      return
    }

    const candidates: RowFlipCandidate[] = []
    const enteringRows: HTMLElement[] = []
    for (const rowEl of rows) {
      const rowId = rowEl.dataset.rowId as RowId | undefined
      if (!rowId) continue
      const first = previousRects.get(rowId)
      if (!first) {
        enteringRows.push(rowEl)
        continue
      }
      const last = currentRects.get(rowId)
      if (!last) continue
      const candidate = rowFlipCandidate(rowEl, first, last)
      if (candidate) candidates.push(candidate)
    }

    playRowFlipCandidates(candidates, flipBudget, virtualizer)
    playRowEnterAnimations(enteringRows, flipBudget)
  }, [flipBudget, motionKey, rowEntries, scrollerRef, virtualizer])
}

function rowFlipCandidate(
  rowEl: HTMLElement,
  first: FlipRect,
  last: FlipRect,
): RowFlipCandidate | null {
  const rowIndexAttr = rowEl.dataset.rowIndex
  if (!rowIndexAttr) return null
  const rowIndex = Number(rowIndexAttr)
  if (!Number.isFinite(rowIndex)) return null
  const delta = calculateFlipDelta(first, last)
  if (delta.x === 0 && delta.y === 0) return null
  return { element: rowEl, first, last, rowIndex }
}

function playRowFlipCandidates(
  candidates: readonly RowFlipCandidate[],
  budget: AnimationBudget,
  virtualizer: Virtualizer,
): void {
  if (candidates.length === 0) return

  const limitedCandidates = budget.limit(candidates, candidates.length)
  const handles = limitedCandidates.map((candidate) =>
    virtualizer.beginInFlightRow(candidate.rowIndex),
  )
  let animations: Animation[]
  try {
    animations = flip(limitedCandidates, {
      budget,
      duration: ROW_FLIP_DURATION_MS,
      scale: false,
    })
  } catch (error) {
    for (const handle of handles) handle.release()
    throw error
  }
  for (let index = animations.length; index < handles.length; index += 1) {
    handles[index]?.release()
  }
  for (const [index, animation] of animations.entries()) {
    const handle = handles[index]
    if (!handle) continue
    void animation.finished.finally(() => handle.release())
  }
}

function playRowEnterAnimations(rows: readonly HTMLElement[], budget: AnimationBudget): void {
  for (const row of budget.limit(rows, rows.length)) {
    slide(row, "up", { budget, distance: ROW_ENTER_DISTANCE_PX, duration: ROW_ENTER_DURATION_MS })
  }
}

function sameRowIdSet(previousOrder: readonly RowId[], currentOrder: readonly RowId[]): boolean {
  if (previousOrder.length !== currentOrder.length) return false
  const previous = new Set(previousOrder)
  if (previous.size !== currentOrder.length) return false
  return currentOrder.every((rowId) => previous.has(rowId))
}

// ---------------------------------------------------------------------------
// Density-derived heights.
// ---------------------------------------------------------------------------

export function resolveRowHeight(density: BcGridDensity, rowHeight: number | undefined): number {
  return rowHeight ?? densityRowHeights[density]
}

export function resolveHeaderHeight(density: BcGridDensity): number {
  return densityHeaderHeights[density]
}

export function resolveFallbackBodyHeight(
  height: number | "auto" | undefined,
  rowHeight: number,
  headerHeight: number,
): number {
  // Pre-mount fallback used only by the virtualizer's first render, before
  // the ResizeObserver in `useViewportSync` reports the real `clientHeight`.
  // Numeric height: the body fills `height - headerHeight`. Auto / undefined:
  // the default 360px is enough to compute a reasonable initial window;
  // page-flow auto mode then re-syncs to the rendered canvas height on the
  // next ResizeObserver tick.
  return typeof height === "number"
    ? Math.max(rowHeight, height - headerHeight)
    : DEFAULT_BODY_HEIGHT
}

// Re-export BcCellPosition for cell render modules that need the type.
export type { BcCellPosition }
