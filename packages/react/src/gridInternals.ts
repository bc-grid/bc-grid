import {
  AnimationBudget,
  type FlipRect,
  type FlipTarget,
  flip,
  readFlipRect,
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

export interface RowEntry<TRow> {
  row: TRow
  rowId: RowId
  index: number
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
  const resolved = columns.flatMap((column, originalIndex) => {
    const columnId = columnIdFor(column, originalIndex)
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
  })

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

export function columnIdFor<TRow>(
  column: BcReactGridColumn<TRow>,
  originalIndex: number,
): ColumnId {
  return column.columnId ?? column.field ?? `column-${originalIndex}`
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

export function rootStyle(height: number | undefined): CSSProperties {
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

export function headerRowStyle(width: number, height: number, scrollLeft: number): CSSProperties {
  return {
    height,
    minWidth: "100%",
    position: "relative",
    transform: `translate3d(${-scrollLeft}px, 0, 0)`,
    width: Math.max(width, 1),
  }
}

export function scrollerStyle(height: number | undefined): CSSProperties {
  return {
    flex: height == null ? "1 1 auto" : "0 0 auto",
    height,
    minHeight: height == null ? 0 : undefined,
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
    ["expansion", "defaultExpansion"],
    ["groupBy", "defaultGroupBy"],
    ["columnState", "defaultColumnState"],
    ["activeCell", "defaultActiveCell"],
    ["page", "defaultPage"],
    ["pageSize", "defaultPageSize"],
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
  const announcePolite = useCallback((message: string) => {
    setPoliteMessage(message)
  }, [])
  const announceAssertive = useCallback((message: string) => {
    setAssertiveMessage(message)
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
  const selectionAnnounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const size = selectionState.mode === "explicit" ? selectionState.rowIds.size : -1
    const prev = prevSelectionSizeRef.current
    prevSelectionSizeRef.current = size
    if (size === prev) return
    if (selectionAnnounceTimerRef.current) clearTimeout(selectionAnnounceTimerRef.current)
    selectionAnnounceTimerRef.current = setTimeout(() => {
      if (size === 0) announcePolite(messages.selectionClearedAnnounce())
      else if (size > 0) announcePolite(messages.selectionAnnounce({ count: size }))
      // size < 0 means "all" / "filtered" mode — count is consumer-specific;
      // skip the announce until the consumer wires their own.
    }, 200)
    return () => {
      if (selectionAnnounceTimerRef.current) clearTimeout(selectionAnnounceTimerRef.current)
    }
  }, [selectionState, messages, announcePolite])

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
// FLIP animation on sort.
// ---------------------------------------------------------------------------

export interface UseFlipOnSortParams {
  sortState: readonly BcGridSort[]
  scrollerRef: RefObject<HTMLDivElement | null>
  virtualizer: Virtualizer
}

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

    const targets: FlipTarget[] = []
    const handles: { release(): void }[] = []
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
      targets.push({ element: rowEl, first, last })
      const rowIndexAttr = rowEl.dataset.rowIndex
      if (rowIndexAttr) {
        const rowIndex = Number(rowIndexAttr)
        if (Number.isFinite(rowIndex)) {
          handles.push(virtualizer.beginInFlightRow(rowIndex))
        }
      }
    }

    if (targets.length === 0) {
      for (const h of handles) h.release()
      return
    }

    const animations = flip(targets, { budget: flipBudget })
    if (animations.length === 0) {
      for (const h of handles) h.release()
      return
    }
    for (const [i, animation] of animations.entries()) {
      const handle = handles[i]
      if (!handle) continue
      animation.finished.finally(() => handle.release())
    }
  }, [flipBudget, sortState, virtualizer, scrollerRef])

  return { prepareSortAnimation }
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
  return typeof height === "number"
    ? Math.max(rowHeight, height - headerHeight)
    : DEFAULT_BODY_HEIGHT
}

// Re-export BcCellPosition for cell render modules that need the type.
export type { BcCellPosition }
