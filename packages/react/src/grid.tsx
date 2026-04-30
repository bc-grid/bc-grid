import { AnimationBudget, flash } from "@bc-grid/animations"
import { emptyBcRangeSelection, rangeClear } from "@bc-grid/core"
import type {
  BcCellPosition,
  BcColumnFilter,
  BcColumnStateEntry,
  BcGridApi,
  BcGridFilter,
  BcGridSort,
  BcPaginationState,
  BcRange,
  BcRangeSelection,
  BcSelection,
  ColumnId,
  RowId,
} from "@bc-grid/core"
import { Virtualizer } from "@bc-grid/virtualizer"
import {
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  type UIEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"
import { BcGridAggregationFooterRow, useAggregations } from "./aggregations"
import { renderBodyCell, renderGroupRowCell } from "./bodyCells"
import {
  type ColumnVisibilityItem,
  ColumnVisibilityMenu,
  type ColumnVisibilityMenuAnchor,
} from "./columnVisibility"
import { isCustomContextMenuItem, resolveContextMenuItems } from "./contextMenu"
import { createDetailToggleColumn } from "./detailColumn"
import { nextActiveCellAfterEdit } from "./editingStateMachine"
import { EditorPortal, defaultTextEditor } from "./editorPortal"
import {
  type ColumnFilterText,
  type ColumnFilterTypeByColumnId,
  type SetFilterOption,
  buildGridFilter,
  columnFilterTextFromGridFilter,
  matchesGridFilter,
  setFilterValueKeys,
} from "./filter"
import {
  DEFAULT_BODY_HEIGHT,
  DEFAULT_COL_WIDTH,
  type DataRowEntry,
  type GroupRowEntry,
  applyScroll,
  assertNoMixedControlledProps,
  assignRef,
  canvasStyle,
  cellDomId,
  classNames,
  columnIdFor,
  createEmptySelection,
  defaultMessages,
  deriveColumnState,
  domToken,
  hasProp,
  headerRowStyle,
  headerViewportStyle,
  isDataRowEntry,
  overlayStyle,
  pinnedEdgeFor,
  resolveColumns,
  resolveFallbackBodyHeight,
  resolveHeaderHeight,
  resolveRowHeight,
  rootStyle,
  rowStyle,
  scrollerStyle,
  useColumnReorder,
  useColumnResize,
  useControlledState,
  useFlipOnRowInsertion,
  useFlipOnSort,
  useLiveRegionAnnouncements,
  useViewportSync,
  visuallyHiddenStyle,
} from "./gridInternals"
import { buildGroupedRowModel } from "./grouping"
import {
  type ColumnMenuAnchor,
  FilterPopup,
  type SortModifiers,
  renderFilterCell,
  renderHeaderCell,
} from "./headerCells"
import { BcGridContextMenu, type BcGridContextMenuAnchor } from "./internal/context-menu"
import { nextKeyboardNav } from "./keyboard"
import {
  BcGridPagination,
  DEFAULT_CLIENT_PAGE_SIZE,
  getPaginationWindow,
  isPaginationEnabled,
  normalisePageSizeOptions,
} from "./pagination"
import {
  readPersistedGridState,
  readUrlPersistedGridState,
  usePersistedGridStateWriter,
  useUrlPersistedGridStateWriter,
} from "./persistence"
import {
  buildRangeClipboard,
  normaliseClipboardPayload,
  writeClipboardPayload,
} from "./rangeClipboard"
import { matchesSearchText } from "./search"
import { isRowSelected, selectOnly, selectRange, toggleRow } from "./selection"
import { createSelectionCheckboxColumn } from "./selectionColumn"
import { BcGridSidebar, normalizeSidebarPanelId, resolveSidebarPanels } from "./sidebar"
import { appendSortFor, defaultCompareValues, removeSortFor, toggleSortFor } from "./sort"
import { BcStatusBar } from "./statusBar"
import type {
  BcCellEditCommitEvent,
  BcContextMenuContext,
  BcContextMenuItem,
  BcGridProps,
  BcReactGridColumn,
  BcSidebarContext,
} from "./types"
import { useEditingController } from "./useEditingController"
import { formatCellValue, getCellValue } from "./value"

export function useBcGridApi<TRow>(): RefObject<BcGridApi<TRow> | null> {
  return useRef<BcGridApi<TRow> | null>(null)
}

const DEFAULT_DETAIL_HEIGHT = 144
const editableKeyTargetTags = new Set(["INPUT", "TEXTAREA", "SELECT"])

export function BcGrid<TRow>(props: BcGridProps<TRow>): ReactNode {
  assertNoMixedControlledProps(props)

  const {
    data,
    columns,
    rowId,
    apiRef,
    height,
    rowHeight,
    rowIsInactive,
    rowIsDisabled,
    locale,
    toolbar,
    footer,
    loading,
    loadingOverlay,
    renderDetailPanel,
    detailPanelHeight,
    ariaLabel,
    ariaLabelledBy,
    onRowClick,
    onRowDoubleClick,
    onCellFocus,
    onBeforeCopy,
    onCopy,
    onVisibleRowRangeChange,
  } = props

  // The spread preserves all defaultMessages required fields; cast back
  // to the full BcGridMessages shape since `Partial<>` overrides widen
  // each function to `string | undefined` in the inferred result.
  const messages = useMemo(
    () => ({ ...defaultMessages, ...props.messages }) as typeof defaultMessages,
    [props.messages],
  )
  const persistedGridState = useMemo(() => readPersistedGridState(props.gridId), [props.gridId])
  const urlPersistedGridState = useMemo(
    () => readUrlPersistedGridState(props.urlStatePersistence),
    [props.urlStatePersistence],
  )
  const density = props.density ?? persistedGridState.density ?? "normal"
  const instanceId = useId()
  const domBaseId = useMemo(
    () => `bc-grid-${domToken(props.gridId ?? instanceId)}`,
    [props.gridId, instanceId],
  )

  const defaultRowHeight = resolveRowHeight(density, rowHeight)
  const headerHeight = resolveHeaderHeight(density)
  const fallbackBodyHeight = resolveFallbackBodyHeight(height, defaultRowHeight, headerHeight)
  const pageSizeOptions = useMemo(
    () => normalisePageSizeOptions(props.pageSizeOptions),
    [props.pageSizeOptions],
  )

  const [scrollOffset, setScrollOffset] = useState({ top: 0, left: 0 })
  const scrollOffsetRef = useRef(scrollOffset)
  const cellFlashBudget = useMemo(() => new AnimationBudget(), [])
  const [, setRenderVersion] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  const requestRender = useCallback(() => {
    setRenderVersion((version) => (version + 1) % Number.MAX_SAFE_INTEGER)
  }, [])
  const updateScrollOffset = useCallback((next: { top: number; left: number }) => {
    scrollOffsetRef.current = next
    setScrollOffset(next)
  }, [])
  const isRowDisabled = useCallback((row: TRow) => rowIsDisabled?.(row) ?? false, [rowIsDisabled])

  const [sortState, setSortState] = useControlledState<readonly BcGridSort[]>(
    hasProp(props, "sort"),
    props.sort ?? [],
    props.defaultSort ?? urlPersistedGridState.sort ?? [],
    props.onSortChange,
  )
  const defaultFilterState =
    props.defaultFilter ?? urlPersistedGridState.filter ?? persistedGridState.filter ?? null
  const [filterState, setFilterState] = useControlledState<BcGridFilter | null>(
    hasProp(props, "filter"),
    props.filter ?? null,
    defaultFilterState,
    props.onFilterChange
      ? (next, prev) => {
          if (next) props.onFilterChange?.(next, prev ?? next)
        }
      : undefined,
  )

  // Per-column text-filter inputs. Internal state — projected into the
  // canonical `BcGridFilter` shape via `buildGridFilter` and surfaced
  // through `setFilterState` whenever it changes.
  const [columnFilterText, setColumnFilterText] = useState<ColumnFilterText>(() =>
    columnFilterTextFromGridFilter(hasProp(props, "filter") ? props.filter : defaultFilterState),
  )
  // Filter-popup anchor + columnId for `column.filter.variant === "popup"`
  // columns per `filter-popup-variant`. Null when no popup is open.
  const [filterPopupState, setFilterPopupState] = useState<{
    columnId: ColumnId
    anchor: DOMRect
  } | null>(null)
  const [selectionState, setSelectionState] = useControlledState<BcSelection>(
    hasProp(props, "selection"),
    props.selection ?? createEmptySelection(),
    props.defaultSelection ?? createEmptySelection(),
    props.onSelectionChange,
  )
  const [rangeSelectionState, setRangeSelectionState] = useControlledState<BcRangeSelection>(
    hasProp(props, "rangeSelection"),
    props.rangeSelection ?? emptyBcRangeSelection,
    props.defaultRangeSelection ?? emptyBcRangeSelection,
    props.onRangeSelectionChange,
  )
  const emptyExpansion = useMemo(() => new Set<RowId>(), [])
  const expansionControlled = hasProp(props, "expansion")
  const defaultExpansionProvided = hasProp(props, "defaultExpansion")
  const [expansionState, setExpansionState] = useControlledState<ReadonlySet<RowId>>(
    expansionControlled,
    props.expansion ?? emptyExpansion,
    props.defaultExpansion ?? emptyExpansion,
    props.onExpansionChange,
  )
  const hasDetail = renderDetailPanel != null

  // Anchor for shift-click range selection. Set on plain click + ctrl/cmd
  // click; consumed (and reset) by shift-click. Held in a ref so we don't
  // re-render the grid just to update the anchor.
  const selectionAnchorRef = useRef<RowId | null>(null)
  const [columnMenu, setColumnMenu] = useState<ColumnVisibilityMenuAnchor | null>(null)
  const sidebarPanels = useMemo(() => resolveSidebarPanels(props.sidebar), [props.sidebar])
  const hasSidebar = sidebarPanels.length > 0
  const [contextMenu, setContextMenu] = useState<{
    anchor: BcGridContextMenuAnchor
    context: BcContextMenuContext<TRow>
    items: readonly BcContextMenuItem<TRow>[]
  } | null>(null)
  const contextMenuLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contextMenuLongPressOpenedRef = useRef(false)

  const [columnState, setColumnState] = useControlledState<readonly BcColumnStateEntry[]>(
    hasProp(props, "columnState"),
    props.columnState ?? [],
    props.defaultColumnState ??
      urlPersistedGridState.columnState ??
      persistedGridState.columnState ??
      [],
    props.onColumnStateChange,
  )
  const [groupByState, setGroupByState] = useControlledState<readonly ColumnId[]>(
    hasProp(props, "groupBy"),
    props.groupBy ?? [],
    props.defaultGroupBy ?? persistedGridState.groupBy ?? [],
    props.onGroupByChange,
  )
  const [pageState, setPageState] = useControlledState<number>(
    hasProp(props, "page"),
    props.page ?? 0,
    props.defaultPage ?? 0,
    undefined,
  )
  const [pageSizeState, setPageSizeState] = useControlledState<number | undefined>(
    hasProp(props, "pageSize"),
    props.pageSize,
    props.defaultPageSize ?? persistedGridState.pageSize,
    undefined,
  )
  const [activeCell, setActiveCell] = useControlledState<BcCellPosition | null>(
    hasProp(props, "activeCell"),
    props.activeCell ?? null,
    props.defaultActiveCell ?? null,
    props.onActiveCellChange,
  )
  const [sidebarPanelState, setSidebarPanelState] = useControlledState<string | null>(
    hasProp(props, "sidebarPanel"),
    props.sidebarPanel ?? null,
    props.defaultSidebarPanel ?? persistedGridState.sidebarPanel ?? null,
    props.onSidebarPanelChange,
  )
  const activeSidebarPanel = useMemo(
    () => normalizeSidebarPanelId(sidebarPanelState, sidebarPanels),
    [sidebarPanelState, sidebarPanels],
  )
  const setActiveSidebarPanel = useCallback(
    (next: string | null) => {
      setSidebarPanelState(normalizeSidebarPanelId(next, sidebarPanels))
    },
    [setSidebarPanelState, sidebarPanels],
  )

  // Consumer columns resolved for filter / sort lookups. The synthetic
  // selection-checkbox column (when `checkboxSelection` is on) is added
  // below into `resolvedColumns` for layout + render; rowEntries doesn't
  // need to know about it (synthetic column is `sortable: false`,
  // `filter: false`).
  const consumerResolvedColumns = useMemo(
    () => resolveColumns(columns, columnState),
    [columns, columnState],
  )
  // Persist the consumer-supplied column state only — the synthetic
  // selection-checkbox column (added later when `checkboxSelection` is on)
  // is runtime-only and must not be written to localStorage.
  const persistedColumnState = useMemo(
    () => deriveColumnState(consumerResolvedColumns, columnState),
    [columnState, consumerResolvedColumns],
  )
  const columnVisibilityItems = useMemo(
    () => buildColumnVisibilityItems(columns, columnState),
    [columns, columnState],
  )
  const persistenceState = useMemo(
    () => ({
      columnState: persistedColumnState,
      density,
      filter: filterState ?? undefined,
      groupBy: groupByState,
      pageSize: pageSizeState,
      sidebarPanel: hasSidebar ? activeSidebarPanel : undefined,
    }),
    [
      activeSidebarPanel,
      density,
      filterState,
      groupByState,
      hasSidebar,
      pageSizeState,
      persistedColumnState,
    ],
  )
  usePersistedGridStateWriter(props.gridId, persistenceState)
  const urlPersistenceState = useMemo(
    () => ({
      columnState: persistedColumnState,
      filter: filterState ?? undefined,
      sort: sortState,
    }),
    [filterState, persistedColumnState, sortState],
  )
  useUrlPersistedGridStateWriter(props.urlStatePersistence, urlPersistenceState)

  const columnFilterTypes = useMemo<ColumnFilterTypeByColumnId>(() => {
    const next: Record<ColumnId, BcColumnFilter["type"]> = {}
    for (const column of consumerResolvedColumns) {
      const filter = column.source.filter
      if (filter) next[column.columnId] = filter.type
    }
    return next
  }, [consumerResolvedColumns])

  const inlineFilter = useMemo(
    () => buildGridFilter(columnFilterText, columnFilterTypes),
    [columnFilterText, columnFilterTypes],
  )
  const activeFilter = filterState
  const searchText = props.searchText ?? props.defaultSearchText ?? ""
  const aggregationScope = props.aggregationScope ?? "filtered"

  const allRowEntries = useMemo<readonly DataRowEntry<TRow>[]>(() => {
    let visibleRows: TRow[] =
      props.showInactive === false && rowIsInactive
        ? data.filter((row) => !rowIsInactive(row))
        : [...data]

    // Filter step: pass the row's per-column formatted values to the
    // matcher. We use formatted values (not raw) so the result matches
    // what the user sees in the cell.
    if (activeFilter) {
      const columnsById = new Map(consumerResolvedColumns.map((c) => [c.columnId, c]))
      visibleRows = visibleRows.filter((row) =>
        matchesGridFilter(activeFilter, (columnId) => {
          const column = columnsById.get(columnId)
          if (!column) return ""
          const value = getCellValue(row, column.source)
          return {
            formattedValue: formatCellValue(value, row, column.source, locale),
            rawValue: value,
          }
        }),
      )
    }

    if (searchText.trim()) {
      const searchableColumns = consumerResolvedColumns.filter(
        (column) => column.source.filter !== false,
      )
      visibleRows = visibleRows.filter((row) =>
        matchesSearchText(
          searchText,
          searchableColumns.map((column) => {
            const value = getCellValue(row, column.source)
            return formatCellValue(value, row, column.source, locale)
          }),
        ),
      )
    }

    const built = visibleRows.map((row, index) => ({
      kind: "data" as const,
      row,
      index,
      rowId: rowId(row, index),
    }))

    if (sortState.length === 0) return built

    // Sort using each column's comparator (or the default). Multi-column:
    // run keys in order, return the first non-zero comparison. After sort,
    // re-stamp `index` so DOM positioning + virtualizer state line up.
    const sorted = [...built].sort((a, b) => {
      for (const sort of sortState) {
        const column = consumerResolvedColumns.find((c) => c.columnId === sort.columnId)
        if (!column) continue
        const va = getCellValue(a.row, column.source)
        const vb = getCellValue(b.row, column.source)
        const cmp = column.source.comparator
          ? column.source.comparator(va, vb, a.row, b.row)
          : defaultCompareValues(va, vb)
        if (cmp !== 0) return sort.direction === "asc" ? cmp : -cmp
      }
      return 0
    })

    return sorted.map((entry, index) => ({ ...entry, index }))
  }, [
    activeFilter,
    data,
    locale,
    props.showInactive,
    consumerResolvedColumns,
    rowId,
    rowIsInactive,
    searchText,
    sortState,
  ])
  const effectivePageSize = pageSizeState ?? pageSizeOptions[0] ?? DEFAULT_CLIENT_PAGE_SIZE
  const paginationEnabled = isPaginationEnabled(
    props.pagination,
    allRowEntries.length,
    effectivePageSize,
  )
  const paginationWindow = useMemo(
    () => getPaginationWindow(allRowEntries.length, pageState, effectivePageSize),
    [allRowEntries.length, effectivePageSize, pageState],
  )
  const paginationPageSizeOptions = useMemo(
    () =>
      pageSizeOptions.includes(effectivePageSize)
        ? pageSizeOptions
        : normalisePageSizeOptions([...pageSizeOptions, effectivePageSize]),
    [effectivePageSize, pageSizeOptions],
  )
  const leafRowEntries = useMemo<readonly DataRowEntry<TRow>[]>(() => {
    if (!paginationEnabled) return allRowEntries

    return allRowEntries
      .slice(paginationWindow.startIndex, paginationWindow.endIndex)
      .map((entry, index) => ({ ...entry, index }))
  }, [allRowEntries, paginationEnabled, paginationWindow.endIndex, paginationWindow.startIndex])
  const groupedRowModel = useMemo(
    () =>
      buildGroupedRowModel({
        rows: leafRowEntries,
        columns: consumerResolvedColumns,
        groupBy: groupByState,
        expansionState,
        locale,
      }),
    [consumerResolvedColumns, expansionState, groupByState, leafRowEntries, locale],
  )
  const rowEntries = groupedRowModel.rows
  const groupingActive = groupedRowModel.active
  const visibleDataRowEntries = useMemo(() => rowEntries.filter(isDataRowEntry), [rowEntries])
  const rangeRowIds = useMemo(() => rowEntries.map((entry) => entry.rowId), [rowEntries])
  const autoExpandedGroupIdsRef = useRef(new Set<RowId>())
  useEffect(() => {
    if (
      !groupingActive ||
      !props.groupsExpandedByDefault ||
      expansionControlled ||
      defaultExpansionProvided
    ) {
      return
    }

    let nextExpansion: Set<RowId> | null = null
    for (const groupRowId of groupedRowModel.allGroupRowIds) {
      if (autoExpandedGroupIdsRef.current.has(groupRowId)) continue
      autoExpandedGroupIdsRef.current.add(groupRowId)
      if (expansionState.has(groupRowId)) continue
      nextExpansion ??= new Set(expansionState)
      nextExpansion.add(groupRowId)
    }
    if (nextExpansion) setExpansionState(nextExpansion)
  }, [
    defaultExpansionProvided,
    expansionControlled,
    expansionState,
    groupedRowModel.allGroupRowIds,
    groupingActive,
    props.groupsExpandedByDefault,
    setExpansionState,
  ])
  const aggregationRows = useMemo(() => allRowEntries.map((entry) => entry.row), [allRowEntries])
  const getDetailHeight = useCallback(
    (entry: DataRowEntry<TRow>) => {
      if (!hasDetail) return 0
      const params = { row: entry.row, rowId: entry.rowId, rowIndex: entry.index }
      const height =
        typeof detailPanelHeight === "function"
          ? detailPanelHeight(params)
          : (detailPanelHeight ?? DEFAULT_DETAIL_HEIGHT)
      return Math.max(0, height)
    },
    [hasDetail, detailPanelHeight],
  )

  // Visible, selectable row IDs in display order (post-filter, post-sort).
  // Used by the synthetic selection-checkbox column's header to compute the
  // tri-state "all / some / none" master toggle while skipping disabled rows.
  const visibleSelectableRowIds = useMemo(
    () =>
      visibleDataRowEntries
        .filter((entry) => !isRowDisabled(entry.row))
        .map((entry) => entry.rowId),
    [isRowDisabled, visibleDataRowEntries],
  )

  // Layout-resolved columns including the synthetic pinned-left checkbox
  // column when `checkboxSelection` is on. The synthetic column is rebuilt
  // on every render so its closure captures the live selectionState +
  // setter; resolveColumns is cheap so the cache miss here is acceptable.
  const resolvedColumns = useMemo(() => {
    if (!props.checkboxSelection && !hasDetail) return consumerResolvedColumns
    const syntheticColumns: BcReactGridColumn<TRow>[] = []
    if (hasDetail) {
      syntheticColumns.push(
        createDetailToggleColumn<TRow>({
          expansionState,
          setExpansionState,
        }),
      )
    }
    if (props.checkboxSelection) {
      syntheticColumns.push(
        createSelectionCheckboxColumn<TRow>({
          selectionState,
          setSelectionState,
          visibleRowIds: visibleSelectableRowIds,
        }),
      )
    }
    return resolveColumns([...syntheticColumns, ...columns], columnState)
  }, [
    columns,
    columnState,
    consumerResolvedColumns,
    hasDetail,
    expansionState,
    props.checkboxSelection,
    selectionState,
    setExpansionState,
    setSelectionState,
    visibleSelectableRowIds,
  ])
  const aggregationResults = useAggregations(aggregationRows, columns, {
    allRows: data,
    locale,
    rowId,
    scope: aggregationScope,
    selection: selectionState,
  })
  const hasAggregationFooter = aggregationResults.length > 0

  // Whether the inline filter row should render at all. Per
  // `filter-popup-variant`: when every filterable column is variant="popup"
  // (or filter:false), the inline row collapses entirely. Any other case —
  // mixed inline/popup or all inline — keeps the row.
  const hasInlineFilters = useMemo(
    () =>
      resolvedColumns.some(
        (column) =>
          column.source.filter !== false &&
          column.source.filter != null &&
          (column.source.filter as BcColumnFilter).variant !== "popup",
      ),
    [resolvedColumns],
  )

  const loadSetFilterOptions = useCallback(
    (columnId: ColumnId): readonly SetFilterOption[] => {
      const column = resolvedColumns.find((candidate) => candidate.columnId === columnId)
      if (!column) return []

      const { [columnId]: _currentFilter, ...otherFilterText } = columnFilterText
      const otherFilter = buildGridFilter(otherFilterText, columnFilterTypes)
      const columnsById = new Map(
        consumerResolvedColumns.map((candidate) => [candidate.columnId, candidate]),
      )
      const searchableColumns = consumerResolvedColumns.filter(
        (candidate) => candidate.source.filter !== false,
      )
      const optionsByValue = new Map<string, SetFilterOption>()

      for (const row of data) {
        if (props.showInactive === false && rowIsInactive?.(row)) continue
        if (
          otherFilter &&
          !matchesGridFilter(otherFilter, (filterColumnId) => {
            const filterColumn = columnsById.get(filterColumnId)
            if (!filterColumn) return ""
            const value = getCellValue(row, filterColumn.source)
            return {
              formattedValue: formatCellValue(value, row, filterColumn.source, locale),
              rawValue: value,
            }
          })
        ) {
          continue
        }
        if (
          searchText.trim() &&
          !matchesSearchText(
            searchText,
            searchableColumns.map((searchColumn) => {
              const value = getCellValue(row, searchColumn.source)
              return formatCellValue(value, row, searchColumn.source, locale)
            }),
          )
        ) {
          continue
        }

        const rawValue = getCellValue(row, column.source)
        const values = setFilterValueKeys(rawValue)
        if (values.length === 0) continue
        const formattedValue = formatCellValue(rawValue, row, column.source, locale)

        for (const value of values) {
          if (optionsByValue.has(value)) continue
          const label =
            Array.isArray(rawValue) || formattedValue.trim().length === 0 ? value : formattedValue
          optionsByValue.set(value, { value, label })
        }
      }

      return Array.from(optionsByValue.values()).sort((a, b) =>
        a.label.localeCompare(b.label, locale, { numeric: true, sensitivity: "base" }),
      )
    },
    [
      columnFilterText,
      columnFilterTypes,
      consumerResolvedColumns,
      data,
      locale,
      props.showInactive,
      resolvedColumns,
      rowIsInactive,
      searchText,
    ],
  )

  const columnIndexById = useMemo(() => {
    const map = new Map<(typeof resolvedColumns)[number]["columnId"], number>()
    resolvedColumns.forEach((column, index) => map.set(column.columnId, index))
    return map
  }, [resolvedColumns])

  // Surface inline filters through the controlled setFilterState contract so
  // consumers using the `filter` prop see the canonical BcGridFilter shape
  // when the user types. Skip the first pass so a URL/localStorage/default
  // filter can hydrate without being cleared by initially-empty filter inputs.
  const filterTextHydratedRef = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: setFilterState identity isn't useful here
  useEffect(() => {
    if (!filterTextHydratedRef.current) {
      filterTextHydratedRef.current = true
      return
    }
    setFilterState(inlineFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inlineFilter])

  const { politeMessage, assertiveMessage, announcePolite, announceAssertive } =
    useLiveRegionAnnouncements({
      sortState,
      resolvedColumns,
      activeFilter,
      rowEntries: visibleDataRowEntries,
      data,
      selectionState,
      messages,
    })

  const rowsById = useMemo(() => {
    const map = new Map<RowId, DataRowEntry<TRow>>()
    for (const entry of visibleDataRowEntries) map.set(entry.rowId, entry)
    return map
  }, [visibleDataRowEntries])

  const rowIndexById = useMemo(() => {
    const map = new Map<RowId, number>()
    for (const entry of rowEntries) map.set(entry.rowId, entry.index)
    return map
  }, [rowEntries])

  const pinnedLeftCols = useMemo(
    () => resolvedColumns.filter((column) => column.pinned === "left").length,
    [resolvedColumns],
  )
  const pinnedRightCols = useMemo(
    () => resolvedColumns.filter((column) => column.pinned === "right").length,
    [resolvedColumns],
  )

  const virtualizer = useMemo(() => {
    const next = new Virtualizer({
      rowCount: rowEntries.length,
      colCount: resolvedColumns.length,
      defaultRowHeight,
      defaultColWidth: DEFAULT_COL_WIDTH,
      viewportHeight: fallbackBodyHeight,
      viewportWidth: 800,
      pinnedLeftCols,
      pinnedRightCols,
    })

    resolvedColumns.forEach((column, index) => next.setColWidth(index, column.width))
    if (hasDetail) {
      rowEntries.forEach((entry, index) => {
        if (!isDataRowEntry(entry)) return
        if (!expansionState.has(entry.rowId)) return
        next.setRowHeight(index, defaultRowHeight + getDetailHeight(entry))
      })
    }
    next.setScrollTop(scrollOffsetRef.current.top)
    next.setScrollLeft(scrollOffsetRef.current.left)
    return next
  }, [
    defaultRowHeight,
    hasDetail,
    getDetailHeight,
    expansionState,
    fallbackBodyHeight,
    pinnedLeftCols,
    pinnedRightCols,
    resolvedColumns,
    rowEntries,
    rowEntries.length,
  ])

  const { viewport } = useViewportSync({
    scrollerRef,
    virtualizer,
    fallbackBodyHeight,
    requestRender,
  })

  const activeRowIndex = activeCell ? rowIndexById.get(activeCell.rowId) : undefined
  const activeColIndex = activeCell ? columnIndexById.get(activeCell.columnId) : undefined

  useEffect(() => {
    if (activeRowIndex != null) virtualizer.retainRow(activeRowIndex, true)
    if (activeColIndex != null) virtualizer.retainCol(activeColIndex, true)
    requestRender()

    return () => {
      if (activeRowIndex != null) virtualizer.retainRow(activeRowIndex, false)
      if (activeColIndex != null) virtualizer.retainCol(activeColIndex, false)
    }
  }, [activeColIndex, activeRowIndex, requestRender, virtualizer])

  const virtualWindow = virtualizer.computeWindow()
  const firstVirtualRow = virtualWindow.rows.reduce(
    (first, row) => Math.min(first, row.index),
    Number.POSITIVE_INFINITY,
  )
  const lastVirtualRow = virtualWindow.rows.reduce((last, row) => Math.max(last, row.index), -1)

  useEffect(() => {
    if (!onVisibleRowRangeChange || lastVirtualRow < 0) return
    onVisibleRowRangeChange({
      startIndex: firstVirtualRow === Number.POSITIVE_INFINITY ? 0 : firstVirtualRow,
      endIndex: lastVirtualRow,
    })
  }, [firstVirtualRow, lastVirtualRow, onVisibleRowRangeChange])

  // Editing controller. The framework owns the lifecycle / state machine /
  // overlay; consumers wire commit semantics via `onCellEditCommit` (read
  // off props since it's declared on `BcEditGridProps` and reaches us via
  // spread). Sync + async per-column `validate` runs through the
  // controller before the overlay updates.
  const onCellEditCommitProp = (
    props as {
      onCellEditCommit?: (event: BcCellEditCommitEvent<TRow>) => void | Promise<void>
    }
  ).onCellEditCommit
  const editController = useEditingController<TRow>({
    ...(onCellEditCommitProp ? { onCellEditCommit: onCellEditCommitProp } : {}),
    validate: (value, row, columnId, signal) => {
      const column = consumerResolvedColumns.find((c) => c.columnId === columnId)
      if (!column?.source.validate) return { valid: true }
      return column.source.validate(value as never, row, signal)
    },
    // Live-region announce per `editing-rfc §Live Regions`. The
    // controller fires committed / validationError / serverError; the
    // grid renders polite for committed and assertive for the two
    // error variants so AT interrupts speech on rejection.
    announce: (event) => {
      const columnLabel =
        typeof event.column.header === "string"
          ? event.column.header
          : (event.column.columnId ?? "this cell")
      if (event.kind === "committed") {
        const formattedValue = formatCellValue(event.nextValue, event.row, event.column, locale)
        const rowLabel = String(event.rowId)
        announcePolite(messages.editCommittedAnnounce({ columnLabel, rowLabel, formattedValue }))
        return
      }
      if (event.kind === "validationError") {
        announceAssertive(messages.editValidationErrorAnnounce({ columnLabel, error: event.error }))
        return
      }
      announceAssertive(messages.editServerErrorAnnounce({ columnLabel, error: event.error }))
    },
  })

  // Overlay cleanup per `editing-rfc §Row-model ownership`: when the
  // consumer's `data` prop catches up to a patched value, drop the
  // overlay entry — the canonical state now reflects it. Pending /
  // error entries are preserved (the overlay is still load-bearing).
  // biome-ignore lint/correctness/useExhaustiveDependencies: pruneOverlay is stable from the controller; the canonical resolver reads from data + columns at fire time
  useEffect(() => {
    editController.pruneOverlay((rowId, columnId) => {
      const entry = rowEntries.find((e) => e.rowId === rowId)
      // Group rows have no `row`; only DataRowEntry carries the
      // canonical TRow we read fields from.
      if (!entry || entry.kind !== "data") return undefined
      const column = consumerResolvedColumns.find((c) => c.columnId === columnId)
      const field = column?.source.field
      if (!field) return undefined
      return (entry.row as Record<string, unknown>)[field]
    })
  }, [data, rowEntries, consumerResolvedColumns])

  // Apply the moveOnSettle directive after the editor unmounts. The state
  // machine reaches Unmounting once the editor's useLayoutEffect cleanup
  // dispatches; we read `next.move`, advance the active cell, and dispatch
  // the final `unmounted` to land back in Navigation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dispatchUnmounted is stable; columnIndex/rowIndex are read at fire time
  useEffect(() => {
    if (editController.editState.mode !== "unmounting") return
    const next = editController.editState.next
    const cell = editController.editState.cell
    const rowIndex = rowIndexById.get(cell.rowId)
    const colIndex = columnIndexById.get(cell.columnId)
    if (rowIndex == null || colIndex == null) {
      editController.dispatchUnmounted()
      return
    }
    // Cell-flash on commit per `editing-rfc §Edit-cell paint perf`.
    // Off by default; opt-in via `BcGridProps.flashOnEdit`. Skipped when
    // the user prefers reduced motion (the `flash` primitive already
    // bails on the prefers-reduced-motion media query, so opting in
    // here is safe regardless). Only fires on a successful commit —
    // cancel paths have `next.committedValue === undefined`.
    if (props.flashOnEdit && next.committedValue !== undefined) {
      const cellEl = document.getElementById(cellDomId(domBaseId, cell.rowId, cell.columnId))
      if (cellEl) flash(cellEl, { budget: cellFlashBudget })
    }
    const lastRow = rowEntries.length - 1
    const lastCol = resolvedColumns.length - 1
    const { row: nextRow, col: nextCol } = nextActiveCellAfterEdit(
      rowIndex,
      colIndex,
      lastRow,
      lastCol,
      next.move,
    )
    const targetRow = rowEntries[nextRow]
    const targetCol =
      targetRow && isDataRowEntry(targetRow) ? resolvedColumns[nextCol] : resolvedColumns[0]
    if (targetRow && targetCol) {
      setActiveCell({ rowId: targetRow.rowId, columnId: targetCol.columnId })
    }
    rootRef.current?.focus({ preventScroll: true })
    editController.dispatchUnmounted()
  }, [
    editController.editState,
    rowEntries,
    resolvedColumns,
    rowIndexById,
    columnIndexById,
    cellFlashBudget,
    props.flashOnEdit,
    domBaseId,
  ])

  // Pixel rect of the cell currently being edited — passed to the editor
  // portal for absolute positioning. Computed from the virtualizer so we
  // get the right offsets even when the row/col is in a pinned region.
  const editorCellRect = useMemo(() => {
    if (editController.editState.mode === "navigation") return null
    if (editController.editState.mode === "unmounting") return null
    const cell = editController.editState.cell
    const rowIndex = rowIndexById.get(cell.rowId)
    const colIndex = columnIndexById.get(cell.columnId)
    if (rowIndex == null || colIndex == null) return null
    const rowOffset = virtualizer.scrollOffsetForRow(rowIndex, "nearest")
    const colOffset = virtualizer.scrollOffsetForCol(colIndex, "nearest")
    const rowHeightAtIndex = defaultRowHeight
    const column = resolvedColumns[colIndex]
    return {
      top: rowOffset - scrollOffset.top,
      left: colOffset - scrollOffset.left,
      width: column?.width ?? 120,
      height: rowHeightAtIndex,
    }
  }, [
    editController.editState,
    rowIndexById,
    columnIndexById,
    virtualizer,
    defaultRowHeight,
    resolvedColumns,
    scrollOffset,
  ])

  const scrollToRow = useCallback(
    (targetRowId: RowId, align: "start" | "center" | "end" | "nearest" = "nearest") => {
      const rowIndex = rowIndexById.get(targetRowId)
      if (rowIndex == null) return
      const top = virtualizer.scrollOffsetForRow(rowIndex, align)
      applyScroll(scrollerRef.current, virtualizer, top, undefined, updateScrollOffset)
    },
    [rowIndexById, updateScrollOffset, virtualizer],
  )

  const scrollToCell = useCallback(
    (position: BcCellPosition, align: "start" | "center" | "end" | "nearest" = "nearest") => {
      const rowIndex = rowIndexById.get(position.rowId)
      const colIndex = columnIndexById.get(position.columnId)
      if (rowIndex == null || colIndex == null) return
      const top = virtualizer.scrollOffsetForRow(rowIndex, align)
      const left = virtualizer.scrollOffsetForCol(colIndex, align)
      applyScroll(scrollerRef.current, virtualizer, top, left, updateScrollOffset)
    },
    [columnIndexById, rowIndexById, updateScrollOffset, virtualizer],
  )

  const focusCell = useCallback(
    (position: BcCellPosition) => {
      setActiveCell(position)
      onCellFocus?.(position)
      scrollToCell(position)
      rootRef.current?.focus({ preventScroll: true })
    },
    [onCellFocus, scrollToCell, setActiveCell],
  )

  const allExpandableRowIds = useMemo(() => {
    const expandable = [...groupedRowModel.allGroupRowIds]
    if (hasDetail) {
      for (const entry of visibleDataRowEntries) expandable.push(entry.rowId)
    }
    return expandable
  }, [groupedRowModel.allGroupRowIds, hasDetail, visibleDataRowEntries])

  const copyRangeToClipboard = useCallback(
    async (
      requestedRange: BcRange | undefined,
      gridApi: BcGridApi<TRow>,
      options: { includeHeaders?: boolean } = {},
    ) => {
      const range =
        requestedRange ?? rangeSelectionState.ranges[rangeSelectionState.ranges.length - 1]
      if (!range) return

      const built = buildRangeClipboard({
        range,
        columns: resolvedColumns,
        rowEntries,
        rowIds: rangeRowIds,
        locale,
        includeHeaders: options.includeHeaders === true,
      })
      if (!built) return

      const beforeResult = onBeforeCopy?.({
        api: gridApi,
        range,
        rows: built.rows,
      })
      const defaultPayload = built.payload
      if (beforeResult === false) {
        onCopy?.({ range, payload: defaultPayload, suppressed: true })
        return
      }

      const payload = normaliseClipboardPayload(beforeResult ?? defaultPayload)
      await writeClipboardPayload(payload)
      onCopy?.({ range, payload, suppressed: false })
    },
    [locale, onBeforeCopy, onCopy, rangeRowIds, rangeSelectionState, resolvedColumns, rowEntries],
  )

  const api = useMemo<BcGridApi<TRow>>(() => {
    const nextApi: BcGridApi<TRow> = {
      scrollToRow(targetRowId, opts) {
        scrollToRow(targetRowId, opts?.align)
      },
      scrollToCell(position, opts) {
        scrollToCell(position, opts?.align)
      },
      focusCell,
      isCellVisible(position) {
        const rowIndex = rowIndexById.get(position.rowId)
        const colIndex = columnIndexById.get(position.columnId)
        if (rowIndex == null || colIndex == null) return false
        return virtualizer.isCellVisible(rowIndex, colIndex)
      },
      getRowById(targetRowId) {
        return rowsById.get(targetRowId)?.row
      },
      getActiveCell() {
        return activeCell
      },
      getSelection() {
        return selectionState
      },
      getRangeSelection() {
        return rangeSelectionState
      },
      getColumnState() {
        return deriveColumnState(resolvedColumns, columnState)
      },
      setColumnState(next) {
        setColumnState(next)
      },
      setSort(next) {
        setSortState(next)
      },
      setFilter(next) {
        setFilterState(next)
      },
      setRangeSelection(next) {
        setRangeSelectionState(next)
      },
      copyRange(range) {
        return copyRangeToClipboard(range, nextApi)
      },
      clearRangeSelection() {
        setRangeSelectionState(rangeClear(rangeSelectionState))
      },
      expandAll() {
        if (allExpandableRowIds.length === 0) return
        setExpansionState(new Set(allExpandableRowIds))
      },
      collapseAll() {
        if (allExpandableRowIds.length === 0) return
        setExpansionState(new Set<RowId>())
      },
      refresh() {
        requestRender()
      },
    }
    return nextApi
  }, [
    activeCell,
    allExpandableRowIds,
    columnIndexById,
    columnState,
    copyRangeToClipboard,
    focusCell,
    rangeSelectionState,
    requestRender,
    resolvedColumns,
    rowIndexById,
    rowsById,
    scrollToCell,
    scrollToRow,
    selectionState,
    setColumnState,
    setExpansionState,
    setFilterState,
    setRangeSelectionState,
    setSortState,
    virtualizer,
  ])

  useEffect(() => assignRef(apiRef, api), [apiRef, api])

  // Status-bar render context per `chrome-rfc §Status bar`. The
  // `aggregations` segment consumes the same `useAggregations` output
  // already feeding the in-grid aggregation footer row, so the segment
  // and the row stay in sync at zero extra cost.
  const statusBarContext = useMemo(
    () => ({
      api,
      totalRowCount: data.length,
      filteredRowCount: allRowEntries.length,
      selectedRowCount: computeSelectedRowCount(selectionState, data.length, allRowEntries.length),
      aggregations: aggregationResults,
    }),
    [api, aggregationResults, allRowEntries.length, data.length, selectionState],
  )

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const buildContextMenuContext = useCallback(
    (
      position: BcCellPosition | null,
      entry: RowEntry<TRow> | null,
      selection: BcSelection,
    ): BcContextMenuContext<TRow> => {
      const rowEntry = position ? (rowsById.get(position.rowId) ?? entry) : entry
      const column = position
        ? (resolvedColumns.find((candidate) => candidate.columnId === position.columnId)?.source ??
          null)
        : null
      return {
        cell: position,
        row: rowEntry && isDataRowEntry(rowEntry) ? rowEntry.row : null,
        column,
        selection,
        api,
      }
    },
    [api, resolvedColumns, rowsById],
  )

  const openContextMenu = useCallback(
    ({
      anchor,
      entry,
      position,
    }: {
      anchor: BcGridContextMenuAnchor
      entry: RowEntry<TRow> | null
      position: BcCellPosition | null
    }) => {
      if (position) {
        setActiveCell(position)
        onCellFocus?.(position)
      }

      let nextSelection = selectionState
      if (
        entry &&
        isDataRowEntry(entry) &&
        props.contextMenuSelectionMode !== "preserve" &&
        selectionHasAny(selectionState) &&
        !isRowDisabled(entry.row) &&
        !isRowSelected(selectionState, entry.rowId)
      ) {
        nextSelection = toggleRow(selectionState, entry.rowId)
        setSelectionState(nextSelection)
        selectionAnchorRef.current = entry.rowId
      }

      const context = buildContextMenuContext(position, entry, nextSelection)
      const items = resolveContextMenuItems(props.contextMenuItems, context)
      if (items.length === 0) {
        setContextMenu(null)
        return
      }
      setContextMenu({ anchor, context, items })
    },
    [
      buildContextMenuContext,
      isRowDisabled,
      onCellFocus,
      props.contextMenuItems,
      props.contextMenuSelectionMode,
      selectionState,
      setActiveCell,
      setSelectionState,
    ],
  )

  const openContextMenuForEntry = useCallback(
    (entry: DataRowEntry<TRow>, target: EventTarget | null, anchor: BcGridContextMenuAnchor) => {
      const targetElement = target instanceof Element ? target : null
      const cellElement = targetElement?.closest<HTMLElement>("[data-column-id]")
      const columnId = cellElement?.dataset.columnId
      const column = columnId
        ? resolvedColumns.find((candidate) => candidate.columnId === columnId)
        : undefined
      openContextMenu({
        anchor,
        entry,
        position: column ? { rowId: entry.rowId, columnId: column.columnId } : null,
      })
    },
    [openContextMenu, resolvedColumns],
  )

  const openContextMenuForKeyboard = useCallback(() => {
    const entry = activeCell != null ? rowsById.get(activeCell.rowId) : (rowEntries[0] ?? null)
    const column =
      activeCell != null
        ? resolvedColumns.find((candidate) => candidate.columnId === activeCell.columnId)
        : resolvedColumns[0]
    if (!entry || !column) return
    const position = { rowId: entry.rowId, columnId: column.columnId }
    openContextMenu({
      anchor: contextMenuKeyboardAnchor(domBaseId, position, rootRef.current),
      entry,
      position,
    })
  }, [activeCell, domBaseId, openContextMenu, resolvedColumns, rowEntries, rowsById])

  const clearContextMenuLongPress = useCallback(() => {
    if (contextMenuLongPressTimerRef.current == null) return
    clearTimeout(contextMenuLongPressTimerRef.current)
    contextMenuLongPressTimerRef.current = null
  }, [])

  useEffect(() => clearContextMenuLongPress, [clearContextMenuLongPress])

  const handleContextMenuSelect = useCallback(
    (item: BcContextMenuItem<TRow>, context: BcContextMenuContext<TRow>) => {
      if (isCustomContextMenuItem(item)) {
        item.onSelect(context)
        return
      }
      if (item === "copy" || item === "copy-with-headers") {
        const text = contextMenuClipboardText(context, locale, item === "copy-with-headers", {
          getOverlayValue: editController.getOverlayValue,
          hasOverlayValue: editController.hasOverlayValue,
        })
        if (text != null) void writeClipboardText(text)
      }
    },
    [editController.getOverlayValue, editController.hasOverlayValue, locale],
  )

  const handlePaginationChange = useCallback(
    (next: BcPaginationState) => {
      const normalized = getPaginationWindow(allRowEntries.length, next.page, next.pageSize)
      const nextState = {
        page: normalized.page,
        pageSize: normalized.pageSize,
      }
      const prevState = {
        page: paginationWindow.page,
        pageSize: effectivePageSize,
      }
      if (nextState.page === prevState.page && nextState.pageSize === prevState.pageSize) return

      applyScroll(scrollerRef.current, virtualizer, 0, undefined, updateScrollOffset)
      setPageState(nextState.page)
      setPageSizeState(nextState.pageSize)
      props.onPaginationChange?.(nextState, prevState)
    },
    [
      allRowEntries.length,
      effectivePageSize,
      paginationWindow.page,
      props.onPaginationChange,
      setPageSizeState,
      setPageState,
      updateScrollOffset,
      virtualizer,
    ],
  )

  const renderedFooter =
    footer ??
    (paginationEnabled ? (
      <BcGridPagination
        page={paginationWindow.page}
        pageCount={paginationWindow.pageCount}
        pageSize={effectivePageSize}
        pageSizeOptions={paginationPageSizeOptions}
        totalRows={paginationWindow.totalRows}
        onChange={handlePaginationChange}
      />
    ) : null)

  // While the editor input owns DOM focus, aria-activedescendant is
  // suspended (set to "") so AT doesn't try to point at a cell that's now
  // hosting an `<input>`. Once committing/cancelling starts, the editor DOM
  // is gone and the grid root should expose the active cell again.
  const editingCell =
    editController.editState.mode === "mounting" ||
    editController.editState.mode === "editing" ||
    editController.editState.mode === "validating"
      ? editController.editState.cell
      : null
  const editorOwnsFocus = editingCell !== null
  const pendingEditNavigationCell = useMemo<BcCellPosition | null>(() => {
    const editState = editController.editState
    if (editState.mode !== "committing" && editState.mode !== "unmounting") return null
    const cell = editState.cell
    const rowIndex = rowIndexById.get(cell.rowId)
    const colIndex = columnIndexById.get(cell.columnId)
    if (rowIndex == null || colIndex == null) return null

    const move = editState.mode === "committing" ? editState.moveOnSettle : editState.next.move
    const lastRow = rowEntries.length - 1
    const lastCol = resolvedColumns.length - 1
    const { row: nextRow, col: nextCol } = nextActiveCellAfterEdit(
      rowIndex,
      colIndex,
      lastRow,
      lastCol,
      move,
    )
    const targetRow = rowEntries[nextRow]
    const targetCol =
      targetRow && isDataRowEntry(targetRow) ? resolvedColumns[nextCol] : resolvedColumns[0]
    if (!targetRow || !targetCol) return null
    return { rowId: targetRow.rowId, columnId: targetCol.columnId }
  }, [columnIndexById, editController.editState, resolvedColumns, rowEntries, rowIndexById])
  const activeDescendantCell = pendingEditNavigationCell ?? activeCell
  const activeCellId = editorOwnsFocus
    ? ""
    : activeDescendantCell
      ? cellDomId(domBaseId, activeDescendantCell.rowId, activeDescendantCell.columnId)
      : undefined

  const rootHeight = typeof height === "number" ? height : undefined
  const bodyHeight =
    height === "auto" ? Math.min(virtualWindow.totalHeight, DEFAULT_BODY_HEIGHT) : undefined

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const target = event.currentTarget
      virtualizer.setScrollTop(target.scrollTop)
      virtualizer.setScrollLeft(target.scrollLeft)
      updateScrollOffset({ top: target.scrollTop, left: target.scrollLeft })
      setContextMenu(null)
    },
    [updateScrollOffset, virtualizer],
  )

  const focusGroupRow = useCallback(
    (entry: GroupRowEntry) => {
      const firstColumn = resolvedColumns[0]
      if (!firstColumn) return
      const position = { rowId: entry.rowId, columnId: firstColumn.columnId }
      setActiveCell(position)
      onCellFocus?.(position)
    },
    [onCellFocus, resolvedColumns, setActiveCell],
  )

  const toggleGroupRow = useCallback(
    (entry: GroupRowEntry) => {
      const next = new Set(expansionState)
      if (entry.expanded) next.delete(entry.rowId)
      else next.add(entry.rowId)
      setExpansionState(next)

      announcePolite(
        entry.expanded
          ? `Collapsed ${entry.label}.`
          : `Expanded ${entry.label}. ${entry.childCount} rows.`,
      )

      if (entry.expanded && activeCell && entry.childRowIds.includes(activeCell.rowId)) {
        focusGroupRow(entry)
      }
    },
    [activeCell, announcePolite, expansionState, focusGroupRow, setExpansionState],
  )

  const handleFocus = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return
      if (activeCell || rowEntries.length === 0 || resolvedColumns.length === 0) return
      const firstRow = rowEntries[0]
      const firstColumn = resolvedColumns[0]
      if (!firstRow || !firstColumn) return
      setActiveCell({ rowId: firstRow.rowId, columnId: firstColumn.columnId })
    },
    [activeCell, resolvedColumns, rowEntries, setActiveCell],
  )

  // Approximate "page size" for PageUp/PageDown: full viewport rows minus
  // one for context overlap. Variable heights are handled approximately —
  // viewport / default-row gives close-enough behaviour for v0.1.
  const pageRowCount = Math.max(1, Math.floor(viewport.height / defaultRowHeight) - 1)

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const lastRow = rowEntries.length - 1
      const lastCol = resolvedColumns.length - 1
      if (lastRow < 0 || lastCol < 0) return

      // Edit mode: the editor's own onKeyDown owns Tab / Enter / Esc /
      // Shift+Enter / Shift+Tab. The grid stays out of the way.
      if (editController.editState.mode !== "navigation") return
      if (isEditableKeyTarget(event.target)) return

      if (event.shiftKey && event.key === "F10") {
        event.preventDefault()
        openContextMenuForKeyboard()
        return
      }

      const currentRow = activeCell ? (rowIndexById.get(activeCell.rowId) ?? 0) : 0
      const currentCol = activeCell ? (columnIndexById.get(activeCell.columnId) ?? 0) : 0

      // Activation paths per `editing-rfc §Activation`:
      //   - F2 / Enter: toggle edit mode on the active cell
      //   - Printable single character (no Ctrl/Meta): seed the editor
      //   - Double-click is handled separately on the cell (onDoubleClick)
      const isPrintable =
        event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
      const cellTarget = activeCell ?? null
      const cellRow = cellTarget ? rowEntries[currentRow] : null
      const cellColumn = cellTarget ? resolvedColumns[currentCol] : null

      if (cellRow && !isDataRowEntry(cellRow)) {
        const shouldToggle =
          event.key === "Enter" ||
          event.key === " " ||
          event.key === "Spacebar" ||
          (event.key === "ArrowRight" && !cellRow.expanded) ||
          (event.key === "ArrowLeft" && cellRow.expanded)
        if (shouldToggle) {
          event.preventDefault()
          focusGroupRow(cellRow)
          toggleGroupRow(cellRow)
          return
        }
      }

      if (
        cellTarget &&
        cellRow &&
        isDataRowEntry(cellRow) &&
        cellColumn &&
        !isRowDisabled(cellRow.row) &&
        isCellEditable(cellColumn, cellRow.row)
      ) {
        const editorForActivation = cellColumn.source.cellEditor ?? defaultTextEditor
        const startOpts = {
          editor: editorForActivation as never,
          row: cellRow.row,
          rowId: cellRow.rowId,
        }
        if (event.key === "F2" || event.key === "Enter") {
          event.preventDefault()
          editController.start(cellTarget, event.key === "F2" ? "f2" : "enter", startOpts)
          return
        }
        if (isPrintable) {
          event.preventDefault()
          editController.start(cellTarget, "printable", { ...startOpts, seedKey: event.key })
          return
        }
      }

      if ((event.ctrlKey || event.metaKey) && (event.key === "c" || event.key === "C")) {
        const activeRange = rangeSelectionState.ranges[rangeSelectionState.ranges.length - 1]
        if (!activeRange) return
        event.preventDefault()
        void copyRangeToClipboard(activeRange, api, { includeHeaders: event.shiftKey }).catch(
          () => undefined,
        )
        return
      }

      const outcome = nextKeyboardNav({
        key: event.key,
        ctrlOrMeta: event.ctrlKey || event.metaKey,
        shiftKey: event.shiftKey,
        currentRow,
        currentCol,
        lastRow,
        lastCol,
        pageRowCount,
      })

      if (outcome.type === "noop") return
      event.preventDefault()
      if (outcome.type === "preventDefault") return
      if (outcome.type === "toggleSelection") {
        const targetRow = rowEntries[currentRow]
        if (!targetRow) return
        if (!isDataRowEntry(targetRow)) return
        if (isRowDisabled(targetRow.row)) return
        setSelectionState(toggleRow(selectionState, targetRow.rowId))
        selectionAnchorRef.current = targetRow.rowId
        return
      }

      const nextRow = rowEntries[outcome.row]
      const nextColumn =
        nextRow && isDataRowEntry(nextRow) ? resolvedColumns[outcome.col] : resolvedColumns[0]
      if (!nextRow || !nextColumn) return
      focusCell({ rowId: nextRow.rowId, columnId: nextColumn.columnId })
    },
    [
      activeCell,
      api,
      columnIndexById,
      copyRangeToClipboard,
      editController,
      focusGroupRow,
      focusCell,
      isRowDisabled,
      openContextMenuForKeyboard,
      pageRowCount,
      rangeSelectionState,
      resolvedColumns,
      rowEntries,
      rowIndexById,
      selectionState,
      setSelectionState,
      toggleGroupRow,
    ],
  )

  const { prepareSortAnimation } = useFlipOnSort({ sortState, scrollerRef, virtualizer })
  useFlipOnRowInsertion({ motionKey: expansionState, rowEntries, scrollerRef, virtualizer })

  const handleHeaderSort = useCallback(
    (
      column: {
        columnId: (typeof resolvedColumns)[number]["columnId"]
        source: (typeof resolvedColumns)[number]["source"]
      },
      modifiers: SortModifiers,
    ) => {
      if (column.source.sortable === false) return
      prepareSortAnimation()
      // Ctrl/Cmd-click drops the column from the sort. Shift-click composes
      // a multi-column sort (append/cycle within). Plain click cycles a
      // single primary sort, replacing any multi-column composition.
      if (modifiers.ctrlOrMeta) {
        setSortState(removeSortFor(sortState, column.columnId))
        return
      }
      if (modifiers.shiftKey) {
        setSortState(appendSortFor(sortState, column.columnId))
        return
      }
      setSortState(toggleSortFor(sortState, column.columnId))
    },
    [prepareSortAnimation, setSortState, sortState],
  )

  const { handleResizePointerDown, handleResizePointerMove, endResize } = useColumnResize<TRow>({
    columnState,
    setColumnState,
  })
  const {
    columnReorderPreview,
    consumeColumnReorderClickSuppression,
    handleReorderPointerDown,
    handleReorderPointerMove,
    endReorder,
  } = useColumnReorder<TRow>({
    rootRef,
    columns: consumerResolvedColumns,
    layoutColumns: resolvedColumns,
    columnState,
    scrollLeft: scrollOffset.left,
    totalWidth: virtualWindow.totalWidth,
    viewportWidth: viewport.width,
    setColumnState,
  })
  const openColumnMenu = useCallback(
    (_column: (typeof resolvedColumns)[number], anchor: ColumnMenuAnchor) => {
      const margin = 8
      const menuWidth = 260
      const menuHeight = 360
      const viewportWidth = typeof window === "undefined" ? menuWidth : window.innerWidth
      const viewportHeight = typeof window === "undefined" ? menuHeight : window.innerHeight
      setColumnMenu({
        x: Math.min(
          Math.max(margin, anchor.x),
          Math.max(margin, viewportWidth - menuWidth - margin),
        ),
        y: Math.min(
          Math.max(margin, anchor.y),
          Math.max(margin, viewportHeight - menuHeight - margin),
        ),
      })
    },
    [],
  )
  const closeColumnMenu = useCallback(() => setColumnMenu(null), [])
  const toggleColumnHidden = useCallback(
    (columnId: ColumnId, hidden: boolean) => {
      if (hidden) {
        const item = columnVisibilityItems.find((entry) => entry.columnId === columnId)
        if (item?.hideDisabled) return
      }
      const next = columnState.some((entry) => entry.columnId === columnId)
        ? columnState.map((entry) => (entry.columnId === columnId ? { ...entry, hidden } : entry))
        : [...columnState, { columnId, hidden }]
      setColumnState(next)
    },
    [columnState, columnVisibilityItems, setColumnState],
  )

  useEffect(() => {
    if (!columnMenu) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (
        target.closest(".bc-grid-column-menu") ||
        target.closest('[data-bc-grid-column-menu-button="true"]')
      ) {
        return
      }
      setColumnMenu(null)
    }
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setColumnMenu(null)
    }
    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown, true)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown, true)
    }
  }, [columnMenu])

  // Pinned-edge scroll-shadow indicators. Surfaces as data attrs on the
  // grid root so theming can render shadows when content has scrolled
  // under a pinned region.
  const maxScrollLeft = Math.max(0, virtualWindow.totalWidth - viewport.width)
  const isScrolledLeft = scrollOffset.left > 1 && pinnedLeftCols > 0
  const isScrolledRight = scrollOffset.left < maxScrollLeft - 1 && pinnedRightCols > 0
  const sidebarContext = useMemo<BcSidebarContext<TRow>>(
    () => ({
      api,
      columns,
      columnState,
      filterState: activeFilter,
      groupableColumns: props.groupableColumns ?? [],
      groupBy: groupByState,
      setColumnState,
      setFilterState,
      setGroupBy: setGroupByState,
    }),
    [
      activeFilter,
      api,
      columnState,
      columns,
      groupByState,
      props.groupableColumns,
      setColumnState,
      setFilterState,
      setGroupByState,
    ],
  )
  const bodyAriaRowOffset = hasInlineFilters ? 3 : 2

  return (
    <div
      ref={rootRef}
      className={classNames("bc-grid", `bc-grid--${density}`)}
      data-density={density}
      data-bc-grid-react="v0"
      data-bc-grid-grouped={groupingActive || undefined}
      data-scrolled-left={isScrolledLeft || undefined}
      data-scrolled-right={isScrolledRight || undefined}
      role={groupingActive ? "treegrid" : "grid"}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-rowcount={
        rowEntries.length + (hasInlineFilters ? 2 : 1) + (hasAggregationFooter ? 1 : 0)
      }
      aria-colcount={resolvedColumns.length}
      aria-activedescendant={activeCellId}
      tabIndex={0}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      style={rootStyle(rootHeight)}
    >
      {toolbar ? <div className="bc-grid-toolbar">{toolbar}</div> : null}

      <div className="bc-grid-main">
        <div className="bc-grid-table">
          <div className="bc-grid-header-viewport" role="rowgroup" style={headerViewportStyle}>
            <div
              className="bc-grid-header"
              role="row"
              aria-rowindex={1}
              style={headerRowStyle(virtualWindow.totalWidth, headerHeight, scrollOffset.left)}
            >
              {resolvedColumns.map((column, index) =>
                renderHeaderCell({
                  column,
                  domBaseId,
                  headerHeight,
                  index,
                  onColumnMenu: openColumnMenu,
                  onConsumeReorderClickSuppression: consumeColumnReorderClickSuppression,
                  onReorderEnd: endReorder,
                  onReorderMove: handleReorderPointerMove,
                  onReorderStart: handleReorderPointerDown,
                  onResizeEnd: endResize,
                  onResizeMove: handleResizePointerMove,
                  onResizeStart: handleResizePointerDown,
                  onSort: handleHeaderSort,
                  pinnedEdge: pinnedEdgeFor(resolvedColumns, index),
                  reorderingColumnId: columnReorderPreview?.sourceColumnId,
                  scrollLeft: scrollOffset.left,
                  sortState,
                  totalWidth: virtualWindow.totalWidth,
                  viewportWidth: viewport.width,
                  filterText: columnFilterText[column.columnId] ?? "",
                  filterPopupOpen: filterPopupState?.columnId === column.columnId,
                  onOpenFilterPopup: (col, anchor) =>
                    setFilterPopupState((prev) =>
                      prev?.columnId === col.columnId ? null : { columnId: col.columnId, anchor },
                    ),
                }),
              )}
            </div>
            {columnReorderPreview ? (
              <div
                aria-hidden="true"
                className="bc-grid-column-drop-indicator"
                style={{
                  height: headerHeight * 2,
                  left: columnReorderPreview.indicatorLeft,
                }}
              />
            ) : null}
            {hasInlineFilters ? (
              <div
                className="bc-grid-filter-row"
                role="row"
                aria-rowindex={2}
                style={headerRowStyle(virtualWindow.totalWidth, headerHeight, scrollOffset.left)}
              >
                {resolvedColumns.map((column, index) =>
                  renderFilterCell({
                    column,
                    domBaseId,
                    filterText: columnFilterText[column.columnId] ?? "",
                    headerHeight,
                    index,
                    loadSetFilterOptions,
                    onFilterChange: (next) =>
                      setColumnFilterText((prev) => ({ ...prev, [column.columnId]: next })),
                    pinnedEdge: pinnedEdgeFor(resolvedColumns, index),
                    scrollLeft: scrollOffset.left,
                    totalWidth: virtualWindow.totalWidth,
                    viewportWidth: viewport.width,
                    messages,
                  }),
                )}
              </div>
            ) : null}
          </div>

          <div
            ref={scrollerRef}
            className="bc-grid-scroller"
            role="rowgroup"
            onScroll={handleScroll}
            style={scrollerStyle(bodyHeight)}
          >
            <div
              className="bc-grid-canvas"
              style={canvasStyle(virtualWindow.totalHeight, virtualWindow.totalWidth)}
            >
              {virtualWindow.rows.map((virtualRow) => {
                const entry = rowEntries[virtualRow.index]
                if (!entry) return null
                if (!isDataRowEntry(entry)) {
                  return (
                    <div
                      key={entry.rowId}
                      className={classNames("bc-grid-row", "bc-grid-row-group")}
                      role="row"
                      aria-rowindex={virtualRow.index + bodyAriaRowOffset}
                      aria-level={entry.level}
                      aria-expanded={entry.expanded}
                      data-row-id={entry.rowId}
                      data-row-index={virtualRow.index}
                      data-bc-grid-row-kind="group"
                      style={rowStyle(virtualRow.top, virtualRow.height, virtualWindow.totalWidth)}
                      onClick={() => {
                        focusGroupRow(entry)
                        toggleGroupRow(entry)
                      }}
                    >
                      {renderGroupRowCell({
                        activeCell,
                        colCount: resolvedColumns.length,
                        column: resolvedColumns[0],
                        domBaseId,
                        entry,
                        onToggle: (groupEntry) => {
                          focusGroupRow(groupEntry)
                          toggleGroupRow(groupEntry)
                        },
                        totalWidth: virtualWindow.totalWidth,
                        virtualRow,
                      })}
                    </div>
                  )
                }
                const disabled = isRowDisabled(entry.row)
                const selected = !disabled && isRowSelected(selectionState, entry.rowId)
                const expanded = hasDetail && expansionState.has(entry.rowId)
                const detailHeight = expanded ? getDetailHeight(entry) : 0
                const cellVirtualRow = expanded
                  ? { ...virtualRow, height: defaultRowHeight }
                  : virtualRow
                return (
                  <div
                    key={entry.rowId}
                    className={classNames(
                      "bc-grid-row",
                      selected ? "bc-grid-row-selected" : undefined,
                      disabled ? "bc-grid-row-disabled" : undefined,
                    )}
                    role="row"
                    aria-rowindex={virtualRow.index + bodyAriaRowOffset}
                    aria-level={groupingActive ? entry.level : undefined}
                    aria-selected={selected || undefined}
                    aria-disabled={disabled || undefined}
                    data-row-id={entry.rowId}
                    data-row-index={virtualRow.index}
                    data-bc-grid-row-kind="data"
                    style={rowStyle(virtualRow.top, virtualRow.height, virtualWindow.totalWidth)}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      clearContextMenuLongPress()
                      openContextMenuForEntry(entry, event.target, {
                        x: event.clientX,
                        y: event.clientY,
                      })
                    }}
                    onPointerDown={(event) => {
                      if (!isCoarsePointerLongPress(event)) return
                      const target = event.target
                      const anchor = { x: event.clientX, y: event.clientY }
                      clearContextMenuLongPress()
                      contextMenuLongPressTimerRef.current = setTimeout(() => {
                        contextMenuLongPressTimerRef.current = null
                        contextMenuLongPressOpenedRef.current = true
                        openContextMenuForEntry(entry, target, anchor)
                      }, 500)
                    }}
                    onPointerUp={clearContextMenuLongPress}
                    onPointerCancel={clearContextMenuLongPress}
                    onPointerLeave={clearContextMenuLongPress}
                    onClick={(event) => {
                      if (contextMenuLongPressOpenedRef.current) {
                        contextMenuLongPressOpenedRef.current = false
                        event.preventDefault()
                        event.stopPropagation()
                        return
                      }
                      // Selection logic. Shift+click → range from anchor; ctrl/
                      // cmd+click → toggle this row in current selection;
                      // plain click → select only this row.
                      if (!disabled) {
                        if (event.shiftKey && selectionAnchorRef.current) {
                          setSelectionState(
                            selectRange(
                              visibleSelectableRowIds,
                              selectionAnchorRef.current,
                              entry.rowId,
                            ),
                          )
                        } else if (event.ctrlKey || event.metaKey) {
                          setSelectionState(toggleRow(selectionState, entry.rowId))
                          selectionAnchorRef.current = entry.rowId
                        } else {
                          setSelectionState(selectOnly(entry.rowId))
                          selectionAnchorRef.current = entry.rowId
                        }
                      }
                      onRowClick?.(entry.row, event)
                    }}
                    onDoubleClick={(event) => {
                      // Activate edit on the cell at the click point if the
                      // column is editable. Falls through to onRowDoubleClick
                      // either way.
                      const target = (event.target as HTMLElement).closest<HTMLElement>(
                        "[data-column-id]",
                      )
                      const columnId = target?.dataset.columnId
                      if (!disabled && columnId) {
                        const column = resolvedColumns.find((c) => c.columnId === columnId)
                        if (column && isCellEditable(column, entry.row)) {
                          const editor = (column.source.cellEditor ?? defaultTextEditor) as never
                          editController.start(
                            { rowId: entry.rowId, columnId: column.columnId },
                            "doubleclick",
                            {
                              pointerHint: { x: event.clientX, y: event.clientY },
                              editor,
                              row: entry.row,
                              rowId: entry.rowId,
                            },
                          )
                        }
                      }
                      onRowDoubleClick?.(entry.row, event)
                    }}
                  >
                    {virtualWindow.cols.map((virtualCol) =>
                      renderBodyCell({
                        activeCell,
                        column: resolvedColumns[virtualCol.index],
                        domBaseId,
                        entry,
                        locale,
                        onCellFocus,
                        pinnedEdge: pinnedEdgeFor(resolvedColumns, virtualCol.index),
                        searchText,
                        scrollLeft: scrollOffset.left,
                        setActiveCell,
                        totalWidth: virtualWindow.totalWidth,
                        viewportWidth: viewport.width,
                        virtualCol,
                        virtualRow: cellVirtualRow,
                        selected,
                        disabled,
                        expanded,
                        editingCell,
                        hasOverlayValue: editController.hasOverlayValue,
                        getOverlayValue: editController.getOverlayValue,
                        getCellEditEntry: editController.getCellEditEntry,
                        getRowEditState: editController.getRowEditState,
                      }),
                    )}
                    {expanded && renderDetailPanel ? (
                      <div
                        className="bc-grid-detail-panel"
                        role="region"
                        aria-label="Detail"
                        style={detailPanelStyle(
                          defaultRowHeight,
                          detailHeight,
                          virtualWindow.totalWidth,
                        )}
                        onClick={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => event.stopPropagation()}
                      >
                        {renderDetailPanel({
                          row: entry.row,
                          rowId: entry.rowId,
                          rowIndex: entry.index,
                        })}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>

            <EditorPortal
              controller={editController}
              activeCell={activeCell}
              rowEntries={visibleDataRowEntries}
              resolvedColumns={resolvedColumns}
              cellRect={editorCellRect}
              virtualizer={virtualizer}
              rowIndexById={rowIndexById}
              columnIndexById={columnIndexById}
              defaultEditor={defaultTextEditor as never}
            />

            {loading ? (
              <div className="bc-grid-overlay" role="status" style={overlayStyle}>
                {loadingOverlay ?? messages.loadingLabel}
              </div>
            ) : null}

            {!loading && rowEntries.length === 0 ? (
              <div className="bc-grid-overlay" role="status" style={overlayStyle}>
                {messages.noRowsLabel}
              </div>
            ) : null}
          </div>

          {hasAggregationFooter ? (
            <BcGridAggregationFooterRow
              columns={resolvedColumns}
              locale={locale}
              results={aggregationResults}
              rowHeight={defaultRowHeight}
              rowIndex={rowEntries.length + bodyAriaRowOffset}
              scrollLeft={scrollOffset.left}
              totalWidth={virtualWindow.totalWidth}
              viewportWidth={viewport.width}
            />
          ) : null}

          {props.statusBar && props.statusBar.length > 0 ? (
            <BcStatusBar
              segments={props.statusBar}
              ctx={statusBarContext}
              ariaLabel={messages.statusBarLabel}
            />
          ) : null}
        </div>

        {hasSidebar ? (
          <BcGridSidebar
            panels={sidebarPanels}
            activePanelId={activeSidebarPanel}
            context={sidebarContext}
            domBaseId={domBaseId}
            width={props.sidebarWidth}
            onActivePanelChange={setActiveSidebarPanel}
          />
        ) : null}
      </div>

      {columnMenu ? (
        <ColumnVisibilityMenu
          anchor={columnMenu}
          items={columnVisibilityItems}
          onClose={closeColumnMenu}
          onToggle={toggleColumnHidden}
        />
      ) : null}

      {contextMenu ? (
        <BcGridContextMenu
          anchor={contextMenu.anchor}
          context={contextMenu.context}
          items={contextMenu.items}
          onClose={closeContextMenu}
          onSelect={handleContextMenuSelect}
        />
      ) : null}

      {renderedFooter ? <div className="bc-grid-footer">{renderedFooter}</div> : null}

      {/*
       * Live regions per accessibility-rfc §Live Regions. Visually hidden
       * but exposed to assistive tech. Polite for sort / filter / selection
       * state changes; assertive for errors that need user action (Q2 cell-
       * edit-rejected).
       */}
      <div
        data-bc-grid-status="true"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={visuallyHiddenStyle}
      >
        {politeMessage}
      </div>
      <div
        data-bc-grid-alert="true"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        style={visuallyHiddenStyle}
      >
        {assertiveMessage}
      </div>
      {filterPopupState
        ? (() => {
            const popupColumn = resolvedColumns.find(
              (column) => column.columnId === filterPopupState.columnId,
            )
            if (!popupColumn) return null
            const popupFilter = popupColumn.source.filter
            if (!popupFilter) return null
            const popupColumnId = filterPopupState.columnId
            const popupColumnLabel =
              typeof popupColumn.source.header === "string"
                ? popupColumn.source.header
                : popupColumnId
            const popupLabel = messages.filterAriaLabel({ columnLabel: popupColumnLabel })
            return (
              <FilterPopup
                anchor={filterPopupState.anchor}
                columnId={popupColumnId}
                filterType={popupFilter.type}
                filterText={columnFilterText[popupColumnId] ?? ""}
                filterLabel={popupLabel}
                getSetFilterOptions={() => loadSetFilterOptions(popupColumnId)}
                onFilterChange={(next) =>
                  setColumnFilterText((prev) => ({ ...prev, [popupColumnId]: next }))
                }
                onClear={() => {
                  setColumnFilterText((prev) => {
                    const { [popupColumnId]: _drop, ...rest } = prev
                    return rest
                  })
                  setFilterPopupState(null)
                }}
                onClose={() => setFilterPopupState(null)}
                messages={messages}
              />
            )
          })()
        : null}
    </div>
  )
}

function isEditableKeyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || editableKeyTargetTags.has(target.tagName)
}

/**
 * Activation guard per `editing-rfc §Activation guards`. The column may
 * declare `editable` as a boolean or a row-fn; default false (read-only).
 */
function isCellEditable<TRow>(
  column: { source: { editable?: boolean | ((row: TRow) => boolean) } },
  row: TRow,
): boolean {
  const editable = column.source.editable
  if (typeof editable === "function") return editable(row)
  return editable === true
}

/**
 * Selected-row count for the status bar across selection modes:
 * `explicit` → set size; `all`/`filtered` → population minus exceptions.
 */
function computeSelectedRowCount(
  selection: BcSelection,
  totalRows: number,
  filteredRows: number,
): number {
  if (selection.mode === "explicit") return selection.rowIds.size
  const population = selection.mode === "all" ? totalRows : filteredRows
  return Math.max(0, population - selection.except.size)
}

function buildColumnVisibilityItems<TRow>(
  columns: readonly BcReactGridColumn<TRow>[],
  columnState: readonly BcColumnStateEntry[],
): readonly ColumnVisibilityItem[] {
  const stateById = new Map(columnState.map((entry) => [entry.columnId, entry]))
  const items = columns.map((column, index) => {
    const columnId = columnIdFor(column, index)
    const hidden = stateById.get(columnId)?.hidden ?? column.hidden ?? false
    return {
      columnId,
      hidden,
      label: columnVisibilityLabel(column, columnId),
    }
  })
  const visibleCount = items.filter((item) => !item.hidden).length
  return items.map((item) => ({
    ...item,
    hideDisabled: !item.hidden && visibleCount <= 1,
  }))
}

function columnVisibilityLabel<TRow>(column: BcReactGridColumn<TRow>, columnId: ColumnId): string {
  return typeof column.header === "string" ? column.header : columnId
}

function detailPanelStyle(top: number, height: number, width: number): CSSProperties {
  return {
    height,
    left: 0,
    minWidth: "100%",
    overflow: "auto",
    position: "absolute",
    top,
    width: Math.max(width, 1),
  }
}

function selectionHasAny(selection: BcSelection): boolean {
  if (selection.mode === "explicit") return selection.rowIds.size > 0
  return true
}

function isCoarsePointerLongPress(event: { button: number; pointerType: string }): boolean {
  if (event.button !== 0 || event.pointerType === "mouse") return false
  if (typeof window === "undefined") return true
  return window.matchMedia?.("(pointer: coarse)").matches ?? true
}

function contextMenuKeyboardAnchor(
  domBaseId: string,
  position: BcCellPosition,
  root: HTMLElement | null,
): BcGridContextMenuAnchor {
  const cell =
    typeof document === "undefined"
      ? null
      : document.getElementById(cellDomId(domBaseId, position.rowId, position.columnId))
  const rect = cell?.getBoundingClientRect() ?? root?.getBoundingClientRect()
  if (!rect) return { x: 8, y: 8 }
  return { x: rect.left + 8, y: rect.bottom }
}

function contextMenuClipboardText<TRow>(
  context: BcContextMenuContext<TRow>,
  locale: string | undefined,
  includeHeaders: boolean,
  overlay: {
    hasOverlayValue?: (rowId: RowId, columnId: ColumnId) => boolean
    getOverlayValue?: (rowId: RowId, columnId: ColumnId) => unknown
  },
): string | null {
  if (!context.cell || !context.row || !context.column) return null
  const value =
    overlay.hasOverlayValue?.(context.cell.rowId, context.cell.columnId) === true
      ? overlay.getOverlayValue?.(context.cell.rowId, context.cell.columnId)
      : getCellValue(context.row, context.column)
  const formattedValue = formatCellValue(value, context.row, context.column, locale)
  if (!includeHeaders) return formattedValue
  const header =
    typeof context.column.header === "string"
      ? context.column.header
      : (context.column.columnId ?? context.cell.columnId)
  return `${header}\n${formattedValue}`
}

async function writeClipboardText(text: string): Promise<void> {
  if (typeof navigator === "undefined") return
  try {
    await navigator.clipboard?.writeText(text)
  } catch {
    // Clipboard permissions are browser-controlled; failed writes are non-fatal.
  }
}
