import { AnimationBudget, flash } from "@bc-grid/animations"
import { emptyBcPivotState, emptyBcRangeSelection, rangeClear } from "@bc-grid/core"
import type {
  BcCellPosition,
  BcColumnFilter,
  BcColumnStateEntry,
  BcGridApi,
  BcGridFilter,
  BcGridPasteTsvFailure,
  BcGridPasteTsvParams,
  BcGridPasteTsvResult,
  BcGridPasteTsvSkippedCell,
  BcGridSort,
  BcPaginationState,
  BcPivotState,
  BcRange,
  BcRangeSelection,
  BcSelection,
  ColumnId,
  RowId,
  SetFilterOption,
  SetFilterOptionLoadResult,
} from "@bc-grid/core"
import { Virtualizer } from "@bc-grid/virtualizer"
import {
  type ClipboardEvent,
  type ComponentType,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  Suspense,
  type UIEvent,
  lazy,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"
import { BcGridAggregationFooterRow, useAggregations } from "./aggregations"
import { renderBodyCell, renderGroupRowCell } from "./bodyCells"
import { computeAutosizeWidth, measureColumnWidths, upsertColumnStateEntry } from "./columnCommands"
import {
  type ColumnVisibilityItem,
  ColumnVisibilityMenu,
  type ColumnVisibilityMenuAnchor,
} from "./columnVisibility"
import {
  BcDetailPanelSlot,
  createDetailToggleColumn,
  detailRowHeight,
  resolveDetailPanelHeight,
} from "./detailColumn"
import { nextActiveCellAfterEdit } from "./editingStateMachine"
import { getEditorActivationIntent } from "./editorKeyboard"
import {
  EditorMount,
  EditorPortal,
  defaultTextEditor,
  findActiveEditorInput,
  readEditorInputValue,
} from "./editorPortal"
import {
  type ColumnFilterText,
  type ColumnFilterTypeByColumnId,
  type SetFilterOptionLoaderParams,
  buildGridFilter,
  columnFilterTextEqual,
  columnFilterTextFromGridFilter,
  filterForColumn,
  matchesGridFilter,
  removeColumnFromFilter,
  setFilterValueKeys,
} from "./filter"
import { buildActiveFilterSummaryItems } from "./filterSummary"
import {
  DEFAULT_BODY_HEIGHT,
  DEFAULT_COL_WIDTH,
  type DataRowEntry,
  type GroupRowEntry,
  type ResolvedColumn,
  applyScroll,
  assertNoMixedControlledProps,
  assignRef,
  buildLayoutColumnState,
  rowStyle as buildRowStyle,
  canvasStyle,
  cellDomId,
  classNames,
  createEmptySelection,
  defaultMessages,
  deriveColumnGroupHeaderRows,
  deriveColumnState,
  domToken,
  flattenColumnDefinitions,
  hasDefinedProp,
  hasProp,
  headerBandStyle,
  headerRowStyle,
  isDataRowEntry,
  mergeLayoutColumnState,
  overlayStyle,
  pinnedEdgeFor,
  pinnedLaneStyle,
  pruneLayoutFilterForColumns,
  pruneLayoutGroupByForColumns,
  pruneLayoutSortForColumns,
  resolveColumns,
  resolveContentFitHeight,
  resolveFallbackBodyHeight,
  resolveFilterRowVisibility,
  resolveGridFitHeight,
  resolveHeaderHeight,
  resolveRowHeight,
  resolveViewportFitHeight,
  rootStyle,
  shouldHandleSearchHotkey,
  useColumnReorder,
  useColumnResize,
  useControlledState,
  useFlipOnRowInsertion,
  useLiveRegionAnnouncements,
  useViewportSize,
  viewportStyle,
  visuallyHiddenStyle,
} from "./gridInternals"
import { buildGroupedRowModel } from "./grouping"
import {
  type ColumnMenuAnchor,
  FilterPopup,
  type SortModifiers,
  renderColumnGroupHeaderCell,
  renderFilterCell,
  renderHeaderCell,
} from "./headerCells"
import { buildGridChromeContextMenuItems } from "./internal/chrome-context-menu"
import type { BcGridContextMenuLayerProps } from "./internal/context-menu-layer"
import { nextKeyboardNav } from "./keyboard"
import {
  BcGridPagination,
  DEFAULT_CLIENT_PAGE_SIZE,
  getPaginationWindow,
  normalisePageSizeOptions,
  resolvePaginationEnabled,
  resolvePaginationRowCount,
} from "./pagination"
import {
  readPersistedGridState,
  readUrlPersistedGridState,
  usePersistedGridStateWriter,
  useUrlPersistedGridStateWriter,
} from "./persistence"
import {
  type RangeTsvPasteApplyFailure,
  type RangeTsvPasteApplyPlan,
  buildRangeClipboard,
  buildRangeTsvPasteApplyPlan,
  normaliseClipboardPayload,
  writeClipboardPayload,
} from "./rangeClipboard"
import {
  createRangeInteractionModel,
  shouldClearRangeSelectionForModelChange,
} from "./rangeInteraction"
import { applyKeyboardRangeExtension } from "./rangeNavigation"
import { BcRangeOverlay } from "./rangeOverlay"
import { matchesSearchText } from "./search"
import {
  headerCheckboxState,
  isRowSelected,
  selectOnly,
  selectRange,
  toggleRow,
  toggleRows,
} from "./selection"
import { createSelectionCheckboxColumn } from "./selectionColumn"
import {
  BcGridSidebar,
  normalizeSidebarPanelId,
  resolveInitialSidebarPanelId,
  resolveSidebarPanels,
} from "./sidebar"
import { appendSortFor, defaultCompareValues, removeSortFor, toggleSortFor } from "./sort"
import { BcStatusBar } from "./statusBar"
import type {
  BcCellEditCommitHandler,
  BcCellEditor,
  BcEditGridProps,
  BcGridDensity,
  BcGridLayoutState,
  BcGridProps,
  BcReactGridColumn,
  BcSidebarContext,
  BcUserSettings,
  BcUserSettingsStore,
} from "./types"
import { useEditingController } from "./useEditingController"
import { formatCellValue, getCellValue } from "./value"

export function useBcGridApi<TRow>(): RefObject<BcGridApi<TRow> | null> {
  return useRef<BcGridApi<TRow> | null>(null)
}

const DEFAULT_DETAIL_HEIGHT = 144
const editableKeyTargetTags = new Set(["INPUT", "TEXTAREA", "SELECT"])
const BcGridContextMenuLayer = lazy(() => import("./internal/context-menu-layer"))

function useDefaultUserSettingsStore(
  providedStore: BcUserSettingsStore | undefined,
): BcUserSettingsStore {
  const settingsRef = useRef<BcUserSettings | undefined>(undefined)
  const listenersRef = useRef(new Set<(next: BcUserSettings) => void>())

  return useMemo<BcUserSettingsStore>(
    () =>
      providedStore ?? {
        read: () => settingsRef.current,
        write: (next) => {
          settingsRef.current = next
          for (const listener of listenersRef.current) listener(next)
        },
        subscribe: (listener) => {
          listenersRef.current.add(listener)
          return () => listenersRef.current.delete(listener)
        },
      },
    [providedStore],
  )
}

type BcGridEditRowActionProps<TRow> = Pick<
  BcEditGridProps<TRow>,
  "canDelete" | "confirmDelete" | "onDelete" | "onDuplicateRow" | "onInsertRow"
>

function hasLayoutStateValue<K extends keyof BcGridLayoutState>(
  layout: BcGridLayoutState | undefined,
  key: K,
): layout is BcGridLayoutState & Required<Pick<BcGridLayoutState, K>> {
  return layout != null && Object.prototype.hasOwnProperty.call(layout, key)
}

export function BcGrid<TRow>(props: BcGridProps<TRow>): ReactNode {
  assertNoMixedControlledProps(props)

  const {
    data,
    columns,
    rowId,
    apiRef,
    height,
    fit,
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
  const {
    canDelete: rowContextCanDelete,
    confirmDelete: rowContextConfirmDelete,
    onDelete: rowContextDelete,
    onDuplicateRow: rowContextDuplicate,
    onInsertRow: rowContextInsert,
  } = props as Partial<BcGridEditRowActionProps<TRow>>

  // Editor toggle prop captures (resolved against userSettings
  // below, after userSettingsState + userVisibleSettings declare).
  // Captured here to keep them adjacent to the destructure for
  // `editingEnabled === undefined` ("locked-by-prop") detection.
  const editingEnabledProp = props.editingEnabled
  const showValidationMessagesProp = props.showValidationMessages
  const showEditorKeyboardHintsProp = props.showEditorKeyboardHints
  const editorActivationProp = props.editorActivation
  const editorBlurActionProp = props.editorBlurAction
  const escDiscardsRowProp = props.escDiscardsRow
  const editScrollOutAction: "commit" | "cancel" | "preserve" =
    props.editScrollOutAction ?? "commit"

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
  const userSettingsStore = useDefaultUserSettingsStore(props.userSettings)
  const [userSettingsState, setUserSettingsState] = useState<BcUserSettings | undefined>(() =>
    userSettingsStore.read(),
  )
  const userSettingsRef = useRef(userSettingsState)
  const applyUserSettingsState = useCallback((next: BcUserSettings | undefined) => {
    userSettingsRef.current = next
    setUserSettingsState(next)
  }, [])
  useEffect(() => {
    const store = userSettingsStore
    applyUserSettingsState(store.read())
    return store.subscribe?.((next) => applyUserSettingsState(next))
  }, [applyUserSettingsState, userSettingsStore])
  const updateUserSettings = useCallback(
    (updater: (prev: BcUserSettings) => BcUserSettings) => {
      const base = userSettingsRef.current ?? { version: 1 }
      const next = updater(base)
      userSettingsRef.current = next
      setUserSettingsState(next)
      userSettingsStore.write(next)
    },
    [userSettingsStore],
  )
  const setVisibleUserSetting = useCallback(
    (key: keyof NonNullable<BcUserSettings["visible"]>, value: boolean) => {
      updateUserSettings((prev) => ({
        ...prev,
        // TODO(vanilla-rfc): draft `visible.*` names are intentionally
        // mirrored from the RFC until the coordinator ratifies the final
        // user-settings field names.
        visible: { ...prev.visible, [key]: value },
      }))
    },
    [updateUserSettings],
  )
  const userVisibleSettings = userSettingsState?.visible

  // Editor toggles: prop wins (locked-by-prop), else userSettings,
  // else the v0.5 default. The chrome context menu's `Editor`
  // submenu writes through to userSettings via the `setEditor*`
  // callbacks below — see worker3 v05-default-context-menu-wiring.
  const editingEnabled =
    editingEnabledProp !== undefined
      ? editingEnabledProp !== false
      : (userVisibleSettings?.editingEnabled ?? true)
  const showValidationMessages =
    showValidationMessagesProp !== undefined
      ? showValidationMessagesProp !== false
      : (userVisibleSettings?.showValidationMessages ?? true)
  const showEditorKeyboardHints =
    showEditorKeyboardHintsProp !== undefined
      ? showEditorKeyboardHintsProp === true
      : (userVisibleSettings?.showEditorKeyboardHints ?? false)
  const editorActivation: "f2-only" | "single-click" | "double-click" =
    editorActivationProp ?? userSettingsState?.editorActivation ?? "double-click"
  const editorBlurAction: "commit" | "reject" | "ignore" =
    editorBlurActionProp ?? userSettingsState?.editorBlurAction ?? "commit"
  const escDiscardsRow =
    escDiscardsRowProp !== undefined
      ? escDiscardsRowProp === true
      : (userVisibleSettings?.escDiscardsRow ?? false)

  const setEditingEnabledPreference = useCallback(
    (next: boolean) => setVisibleUserSetting("editingEnabled", next),
    [setVisibleUserSetting],
  )
  const setShowValidationMessagesPreference = useCallback(
    (next: boolean) => setVisibleUserSetting("showValidationMessages", next),
    [setVisibleUserSetting],
  )
  const setShowEditorKeyboardHintsPreference = useCallback(
    (next: boolean) => setVisibleUserSetting("showEditorKeyboardHints", next),
    [setVisibleUserSetting],
  )
  const setEscDiscardsRowPreference = useCallback(
    (next: boolean) => setVisibleUserSetting("escDiscardsRow", next),
    [setVisibleUserSetting],
  )
  const setEditorActivationPreference = useCallback(
    (next: "f2-only" | "single-click" | "double-click") => {
      updateUserSettings((prev) => ({ ...prev, editorActivation: next }))
    },
    [updateUserSettings],
  )
  const setEditorBlurActionPreference = useCallback(
    (next: "commit" | "reject" | "ignore") => {
      updateUserSettings((prev) => ({ ...prev, editorBlurAction: next }))
    },
    [updateUserSettings],
  )

  const defaultLayoutState = props.initialLayout ?? props.layoutState
  const layoutColumnIds = useMemo(
    () =>
      new Set(
        flattenColumnDefinitions(columns, { includeHidden: true }).map((entry) => entry.columnId),
      ),
    [columns],
  )
  const defaultLayoutSort = useMemo(
    () => pruneLayoutSortForColumns(defaultLayoutState?.sort, layoutColumnIds),
    [defaultLayoutState?.sort, layoutColumnIds],
  )
  const defaultLayoutFilter = useMemo(
    () =>
      hasLayoutStateValue(defaultLayoutState, "filter")
        ? pruneLayoutFilterForColumns(defaultLayoutState.filter, layoutColumnIds)
        : undefined,
    [defaultLayoutState, layoutColumnIds],
  )
  const defaultLayoutGroupBy = useMemo(
    () => pruneLayoutGroupByForColumns(defaultLayoutState?.groupBy, layoutColumnIds),
    [defaultLayoutState?.groupBy, layoutColumnIds],
  )
  const density =
    props.density ??
    props.layoutState?.density ??
    defaultLayoutState?.density ??
    userSettingsState?.density ??
    persistedGridState.density ??
    "normal"
  const instanceId = useId()
  const domBaseId = useMemo(
    () => `bc-grid-${domToken(props.gridId ?? instanceId)}`,
    [props.gridId, instanceId],
  )

  const defaultRowHeight = resolveRowHeight(density, rowHeight)
  const headerHeight = resolveHeaderHeight(density)
  const pageSizeOptions = useMemo(
    () => normalisePageSizeOptions(props.pageSizeOptions),
    [props.pageSizeOptions],
  )

  const [scrollOffset, setScrollOffset] = useState({ top: 0, left: 0 })
  const scrollOffsetRef = useRef(scrollOffset)
  const cellFlashBudget = useMemo(() => new AnimationBudget(), [])
  const [, setRenderVersion] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [viewportFitHeight, setViewportFitHeight] = useState<number | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  // Transient visible toast for clear-rejection feedback (audit
  // P1-W3 / v0.5 → v0.6 §6). When `editController.clearCell` /
  // `commit` rejects validation, the assertive live region tells AT
  // users — sighted users get the inline popover (#356) when an
  // editor is mounted, but **nothing** for the clear-cell path
  // (Backspace/Delete on a required cell). The toast surfaces the
  // message at the grid root for ~3s so sighted users see why
  // their gesture was rejected.
  const [validationToast, setValidationToast] = useState<{
    message: string
    key: number
  } | null>(null)
  const validationToastKeyRef = useRef(0)

  const requestRender = useCallback(() => {
    setRenderVersion((version) => (version + 1) % Number.MAX_SAFE_INTEGER)
  }, [])
  // Single source of truth for viewport size (audit `layout-architecture-
  // pass-rfc.md` §4 memo 4). The hook observes `.bc-grid-viewport`'s
  // `clientWidth` / `clientHeight` and surfaces them as state. `viewport.width`
  // feeds `resolveColumns` so columns with `column.flex` set distribute
  // the spare space between fixed-width siblings (closes the bsncraft
  // 2026-05-03 nested-grid gap that originally landed as a second
  // ResizeObserver). The virtualizer.setViewport hand-off lives in a
  // small effect below — `useViewportSize` itself is virtualizer-
  // agnostic so it can run early (the virtualizer construction depends
  // on `resolvedColumns`, which depends on this hook's `viewport.width`).
  const { viewport } = useViewportSize({ scrollerRef, requestRender })
  const updateScrollOffset = useCallback((next: { top: number; left: number }) => {
    scrollOffsetRef.current = next
    setScrollOffset(next)
  }, [])
  const isRowDisabled = useCallback((row: TRow) => rowIsDisabled?.(row) ?? false, [rowIsDisabled])

  const [sortState, setSortState] = useControlledState<readonly BcGridSort[]>(
    hasProp(props, "sort"),
    props.sort ?? [],
    props.defaultSort ?? defaultLayoutSort ?? urlPersistedGridState.sort ?? [],
    props.onSortChange,
  )
  const defaultFilterState = hasDefinedProp(props, "defaultFilter")
    ? (props.defaultFilter ?? null)
    : defaultLayoutFilter !== undefined
      ? defaultLayoutFilter
      : (urlPersistedGridState.filter ?? persistedGridState.filter ?? null)
  const filterControlled = hasDefinedProp(props, "filter")
  const [filterState, setFilterState] = useControlledState<BcGridFilter | null>(
    filterControlled,
    props.filter ?? null,
    defaultFilterState,
    props.onFilterChange,
  )

  // Per-column text-filter inputs. Internal state — projected into the
  // canonical `BcGridFilter` shape via `buildGridFilter` and surfaced
  // through `setFilterState` whenever it changes.
  const [columnFilterText, setColumnFilterText] = useState<ColumnFilterText>(() =>
    columnFilterTextFromGridFilter(filterControlled ? props.filter : defaultFilterState),
  )
  // External filter writes also project into editor text; avoid echoing that
  // projection back through `onFilterChange` as a duplicate user edit.
  const suppressNextInlineFilterCommitRef = useRef(false)
  const syncColumnFilterTextFromFilter = useCallback((nextFilter: BcGridFilter | null) => {
    const nextColumnFilterText = columnFilterTextFromGridFilter(nextFilter)
    setColumnFilterText((prev) => {
      if (columnFilterTextEqual(prev, nextColumnFilterText)) return prev
      suppressNextInlineFilterCommitRef.current = true
      return nextColumnFilterText
    })
  }, [])
  useEffect(() => {
    if (!filterControlled) return
    syncColumnFilterTextFromFilter(props.filter ?? null)
  }, [filterControlled, props.filter, syncColumnFilterTextFromFilter])
  const applyFilterState = useCallback(
    (next: BcGridFilter | null) => {
      syncColumnFilterTextFromFilter(next)
      setFilterState(next)
    },
    [setFilterState, syncColumnFilterTextFromFilter],
  )
  const updateColumnFilterText = useCallback((columnId: ColumnId, value: string) => {
    setColumnFilterText((prev) => {
      if (value.trim().length > 0) return { ...prev, [columnId]: value }
      const { [columnId]: _cleared, ...rest } = prev
      return rest
    })
  }, [])
  const clearColumnFilterText = useCallback((columnId?: ColumnId) => {
    setColumnFilterText((prev) => {
      if (!columnId) return {}
      const { [columnId]: _cleared, ...rest } = prev
      return rest
    })
  }, [])
  const clearAllColumnFilters = useCallback(() => {
    clearColumnFilterText()
  }, [clearColumnFilterText])
  // Filter-popup anchor + columnId for `column.filter.variant === "popup"`
  // columns per `filter-popup-variant`. Null when no popup is open.
  const [filterPopupState, setFilterPopupState] = useState<{
    columnId: ColumnId
    anchor: DOMRect
  } | null>(null)
  const closeFilterPopup = useCallback((columnId?: ColumnId) => {
    setFilterPopupState((prev) => {
      if (!prev) return prev
      if (columnId != null && prev.columnId !== columnId) return prev
      return null
    })
  }, [])
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
  const showColumnMenu = props.showColumnMenu !== false
  const filterRowLocked = props.showFilterRow !== undefined || props.showFilters !== undefined
  const showFilterRow = props.showFilterRow ?? props.showFilters ?? userVisibleSettings?.filterRow
  const sidebarPanels = useMemo(() => resolveSidebarPanels(props.sidebar), [props.sidebar])
  const hasSidebar = sidebarPanels.length > 0
  const sidebarVisible = hasSidebar && (userVisibleSettings?.sidebar ?? true)

  const defaultColumnState = useMemo(() => {
    if (props.defaultColumnState !== undefined) return props.defaultColumnState
    const base = urlPersistedGridState.columnState ?? persistedGridState.columnState ?? []
    return defaultLayoutState?.columnState
      ? mergeLayoutColumnState(columns, base, defaultLayoutState.columnState)
      : base
  }, [
    columns,
    defaultLayoutState?.columnState,
    persistedGridState.columnState,
    props.defaultColumnState,
    urlPersistedGridState.columnState,
  ])
  const [columnState, setColumnState] = useControlledState<readonly BcColumnStateEntry[]>(
    hasProp(props, "columnState"),
    props.columnState ?? [],
    defaultColumnState,
    props.onColumnStateChange,
  )
  const [groupByState, setGroupByState] = useControlledState<readonly ColumnId[]>(
    hasProp(props, "groupBy"),
    props.groupBy ?? [],
    props.defaultGroupBy ?? defaultLayoutGroupBy ?? persistedGridState.groupBy ?? [],
    props.onGroupByChange,
  )
  const [pivotState, setPivotState] = useControlledState<BcPivotState>(
    hasProp(props, "pivotState"),
    props.pivotState ?? emptyBcPivotState,
    props.defaultPivotState ?? persistedGridState.pivotState ?? emptyBcPivotState,
    props.onPivotStateChange,
  )
  const [pageState, setPageState] = useControlledState<number>(
    hasProp(props, "page"),
    props.page ?? 0,
    props.defaultPage ?? defaultLayoutState?.pagination?.page ?? 0,
    undefined,
  )
  const [pageSizeState, setPageSizeState] = useControlledState<number | undefined>(
    hasProp(props, "pageSize"),
    props.pageSize,
    props.defaultPageSize ??
      defaultLayoutState?.pagination?.pageSize ??
      persistedGridState.pageSize,
    undefined,
  )
  const [activeCell, setActiveCell] = useControlledState<BcCellPosition | null>(
    hasProp(props, "activeCell"),
    props.activeCell ?? null,
    props.defaultActiveCell ?? null,
    props.onActiveCellChange,
  )
  const sidebarPanelControlled = hasProp(props, "sidebarPanel")
  const [sidebarPanelState, setSidebarPanelState] = useControlledState<string | null>(
    sidebarPanelControlled,
    props.sidebarPanel ?? null,
    resolveInitialSidebarPanelId({
      defaultPanelId: hasProp(props, "defaultSidebarPanel") ? props.defaultSidebarPanel : undefined,
      persistedPanelId: hasLayoutStateValue(defaultLayoutState, "sidebarPanel")
        ? defaultLayoutState.sidebarPanel
        : (userSettingsState?.sidebarPanel ?? persistedGridState.sidebarPanel),
      panels: sidebarPanels,
    }),
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
  useEffect(() => {
    if (sidebarPanelControlled) return
    if (!userSettingsState) return
    if (!Object.prototype.hasOwnProperty.call(userSettingsState, "sidebarPanel")) return
    setActiveSidebarPanel(userSettingsState.sidebarPanel ?? null)
  }, [setActiveSidebarPanel, sidebarPanelControlled, userSettingsState])
  const setSidebarPanelPreference = useCallback(
    (panelId: string | null) => {
      const normalized = normalizeSidebarPanelId(panelId, sidebarPanels)
      setActiveSidebarPanel(normalized)
      updateUserSettings((prev) => ({
        ...prev,
        sidebarPanel: normalized,
        visible: { ...prev.visible, sidebar: true },
      }))
    },
    [setActiveSidebarPanel, sidebarPanels, updateUserSettings],
  )
  const setSidebarVisiblePreference = useCallback(
    (next: boolean) => {
      const preferredPanel =
        activeSidebarPanel ??
        normalizeSidebarPanelId(userSettingsRef.current?.sidebarPanel, sidebarPanels) ??
        sidebarPanels[0]?.id ??
        null
      if (next && preferredPanel) setActiveSidebarPanel(preferredPanel)
      updateUserSettings((prev) => ({
        ...prev,
        sidebarPanel: preferredPanel,
        visible: { ...prev.visible, sidebar: next },
      }))
    },
    [activeSidebarPanel, setActiveSidebarPanel, sidebarPanels, updateUserSettings],
  )
  const setFilterRowVisiblePreference = useCallback(
    (next: boolean) => setVisibleUserSetting("filterRow", next),
    [setVisibleUserSetting],
  )
  const setStatusBarVisiblePreference = useCallback(
    (next: boolean) => setVisibleUserSetting("statusBar", next),
    [setVisibleUserSetting],
  )
  const setActiveFilterSummaryVisiblePreference = useCallback(
    (next: boolean) => setVisibleUserSetting("activeFilterSummary", next),
    [setVisibleUserSetting],
  )
  const setDensityPreference = useCallback(
    (next: BcGridDensity) => {
      updateUserSettings((prev) => ({
        ...prev,
        density: next,
      }))
    },
    [updateUserSettings],
  )

  // Consumer columns resolved for filter / sort lookups. The synthetic
  // selection-checkbox column (when `checkboxSelection` is on) is added
  // below into `resolvedColumns` for layout + render; rowEntries doesn't
  // need to know about it (synthetic column is `sortable: false`,
  // `filter: false`).
  const consumerLeafColumns = useMemo(
    () => flattenColumnDefinitions(columns).map((entry) => entry.column),
    [columns],
  )
  const consumerResolvedColumns = useMemo(
    () => resolveColumns(columns, columnState, viewport.width || undefined),
    [columns, columnState, viewport.width],
  )
  // Persist the consumer-supplied column state only — the synthetic
  // selection-checkbox column (added later when `checkboxSelection` is on)
  // is runtime-only and must not be written to localStorage.
  const persistedColumnState = useMemo(
    () => deriveColumnState(consumerResolvedColumns, columnState),
    [columnState, consumerResolvedColumns],
  )
  const layoutColumnState = useMemo(
    () => buildLayoutColumnState(columns, columnState),
    [columns, columnState],
  )
  const columnVisibilityItems = useMemo(
    () => buildColumnVisibilityItems(columns, columnState),
    [columns, columnState],
  )
  const groupableColumnIds = useMemo(() => {
    const ids = new Set<ColumnId>()
    for (const column of consumerResolvedColumns) {
      if (column.source.groupable === true) ids.add(column.columnId)
    }
    for (const column of props.groupableColumns ?? []) {
      ids.add(column.columnId)
    }
    return Array.from(ids)
  }, [consumerResolvedColumns, props.groupableColumns])
  const persistenceState = useMemo(
    () => ({
      columnState: persistedColumnState,
      density,
      filter: filterState ?? undefined,
      groupBy: groupByState,
      pageSize: pageSizeState,
      pivotState,
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
      pivotState,
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
  const activeFilterSummaryItems = useMemo(
    () => buildActiveFilterSummaryItems(columns, columnFilterText),
    [columnFilterText, columns],
  )

  const inlineFilter = useMemo(
    () => buildGridFilter(columnFilterText, columnFilterTypes),
    [columnFilterText, columnFilterTypes],
  )
  const activeFilter = filterState
  const searchText =
    props.searchText ??
    props.layoutState?.searchText ??
    props.defaultSearchText ??
    props.initialLayout?.searchText ??
    ""
  useEffect(() => {
    if (!props.searchHotkey || typeof document === "undefined") return

    const handleSearchHotkey = (event: globalThis.KeyboardEvent) => {
      if (!shouldHandleSearchHotkey(event)) return

      const searchInput = props.searchInputRef?.current ?? null
      if (!searchInput) return

      event.preventDefault()
      searchInput.focus()
      searchInput.select()
    }

    document.addEventListener("keydown", handleSearchHotkey)
    return () => document.removeEventListener("keydown", handleSearchHotkey)
  }, [props.searchHotkey, props.searchInputRef])
  const aggregationScope = props.aggregationScope ?? "filtered"
  // Manual row processing — the host (typically `<BcServerGrid>`) owns
  // row order/membership; the grid renders `data` as-is. Skips client
  // sort/filter/search/group transforms and row FLIP/enter animations.
  const rowProcessingMode: "client" | "manual" = props.rowProcessingMode ?? "client"
  const isManualRowProcessing = rowProcessingMode === "manual"

  const allRowEntries = useMemo<readonly DataRowEntry<TRow>[]>(() => {
    // Manual row processing: render `data` as the host gave it, with
    // no client-side sort/filter/search transforms. The active-filter
    // check below is the chrome contract (filter editors stay
    // controlled), but the row pass-through is what avoids stale rows
    // re-sorting under a pending server query.
    if (isManualRowProcessing) {
      const passThroughRows: readonly TRow[] =
        props.showInactive === false && rowIsInactive
          ? data.filter((row) => !rowIsInactive(row))
          : data
      return passThroughRows.map((row, index) => ({
        kind: "data" as const,
        row,
        index,
        rowId: rowId(row, index),
      }))
    }

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
        matchesGridFilter(
          activeFilter,
          (columnId) => {
            const column = columnsById.get(columnId)
            if (!column) return ""
            const value = getCellValue(row, column.source)
            return {
              formattedValue: formatCellValue(value, row, column.source, locale),
              rawValue: value,
            }
          },
          { context: props.filterPredicateContext },
        ),
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
    isManualRowProcessing,
    locale,
    props.filterPredicateContext,
    props.showInactive,
    consumerResolvedColumns,
    rowId,
    rowIsInactive,
    searchText,
    sortState,
  ])
  const effectivePageSize = pageSizeState ?? pageSizeOptions[0] ?? DEFAULT_CLIENT_PAGE_SIZE
  // Manual pagination — the consumer (typically `BcServerGrid` paged
  // rowModel) feeds the grid one page of pre-sliced rows + the dataset
  // total. The pager renders against the server total, the grid never
  // slices `data` itself, and page changes propagate via
  // `onPaginationChange` so the host can fetch the next page.
  const paginationMode: "client" | "manual" = props.paginationMode ?? "client"
  const isManualPagination = paginationMode === "manual"
  const paginationTotalRows = isManualPagination
    ? Number.isFinite(props.paginationTotalRows)
      ? Math.max(0, Math.floor(props.paginationTotalRows as number))
      : null
    : null
  const paginationRowCount = resolvePaginationRowCount(
    paginationMode,
    props.paginationTotalRows,
    allRowEntries.length,
  )
  const paginationEnabled = resolvePaginationEnabled(
    paginationMode,
    props.pagination,
    paginationRowCount,
    effectivePageSize,
  )
  const paginationWindow = useMemo(
    () => getPaginationWindow(paginationRowCount, pageState, effectivePageSize),
    [paginationRowCount, effectivePageSize, pageState],
  )
  const paginationPageSizeOptions = useMemo(
    () =>
      pageSizeOptions.includes(effectivePageSize)
        ? pageSizeOptions
        : normalisePageSizeOptions([...pageSizeOptions, effectivePageSize]),
    [effectivePageSize, pageSizeOptions],
  )
  const layoutStateFingerprint = useMemo(
    () => (props.layoutState ? JSON.stringify(props.layoutState) : null),
    [props.layoutState],
  )
  const lastAppliedLayoutRef = useRef<string | null>(null)
  useEffect(() => {
    const layout = props.layoutState
    if (!layout || layoutStateFingerprint === null) return
    if (lastAppliedLayoutRef.current === layoutStateFingerprint) return
    lastAppliedLayoutRef.current = layoutStateFingerprint

    if (hasLayoutStateValue(layout, "columnState")) {
      setColumnState(mergeLayoutColumnState(columns, columnState, layout.columnState))
    }
    if (hasLayoutStateValue(layout, "sort")) {
      setSortState(pruneLayoutSortForColumns(layout.sort, layoutColumnIds) ?? [])
    }
    if (hasLayoutStateValue(layout, "filter")) {
      applyFilterState(pruneLayoutFilterForColumns(layout.filter, layoutColumnIds) ?? null)
    }
    if (hasLayoutStateValue(layout, "groupBy")) {
      setGroupByState(pruneLayoutGroupByForColumns(layout.groupBy, layoutColumnIds) ?? [])
    }
    if (hasLayoutStateValue(layout, "searchText") && props.searchText !== undefined) {
      props.onSearchTextChange?.(layout.searchText, props.searchText)
    }
    if (hasLayoutStateValue(layout, "sidebarPanel")) {
      setActiveSidebarPanel(layout.sidebarPanel)
    }
    if (hasLayoutStateValue(layout, "pagination")) {
      const pageSize = Number.isFinite(layout.pagination.pageSize)
        ? Math.max(1, Math.floor(layout.pagination.pageSize))
        : effectivePageSize
      const page = Number.isFinite(layout.pagination.page)
        ? Math.max(0, Math.floor(layout.pagination.page))
        : paginationWindow.page
      const normalized = getPaginationWindow(paginationRowCount, page, pageSize)
      const nextState = { page: normalized.page, pageSize: normalized.pageSize }
      const prevState = { page: paginationWindow.page, pageSize: effectivePageSize }
      if (nextState.page !== prevState.page || nextState.pageSize !== prevState.pageSize) {
        setPageState(nextState.page)
        setPageSizeState(nextState.pageSize)
        props.onPaginationChange?.(nextState, prevState)
      }
    }
  }, [
    applyFilterState,
    columnState,
    columns,
    effectivePageSize,
    layoutColumnIds,
    layoutStateFingerprint,
    paginationRowCount,
    paginationWindow.page,
    props.layoutState,
    props.onPaginationChange,
    props.onSearchTextChange,
    props.searchText,
    setActiveSidebarPanel,
    setColumnState,
    setGroupByState,
    setPageSizeState,
    setPageState,
    setSortState,
  ])
  const currentLayoutState = useMemo<BcGridLayoutState>(
    () => ({
      columnState: layoutColumnState,
      density,
      filter: filterState,
      groupBy: groupByState,
      pagination: { page: paginationWindow.page, pageSize: effectivePageSize },
      searchText,
      sidebarPanel: hasSidebar ? activeSidebarPanel : null,
      sort: sortState,
      version: 1,
    }),
    [
      activeSidebarPanel,
      density,
      effectivePageSize,
      filterState,
      groupByState,
      hasSidebar,
      layoutColumnState,
      paginationWindow.page,
      searchText,
      sortState,
    ],
  )
  const currentLayoutFingerprint = useMemo(
    () => JSON.stringify(currentLayoutState),
    [currentLayoutState],
  )
  const previousLayoutRef = useRef<{
    fingerprint: string
    state: BcGridLayoutState
  } | null>(null)
  useEffect(() => {
    const previous = previousLayoutRef.current
    if (!previous) {
      previousLayoutRef.current = {
        fingerprint: currentLayoutFingerprint,
        state: currentLayoutState,
      }
      return
    }
    if (previous.fingerprint === currentLayoutFingerprint) return
    previousLayoutRef.current = {
      fingerprint: currentLayoutFingerprint,
      state: currentLayoutState,
    }
    props.onLayoutStateChange?.(currentLayoutState, previous.state)
  }, [currentLayoutFingerprint, currentLayoutState, props.onLayoutStateChange])
  const leafRowEntries = useMemo<readonly DataRowEntry<TRow>[]>(() => {
    // Manual pagination: `data` is already the current page; client-side
    // slicing would double-page. Pass through as-is.
    if (isManualPagination || !paginationEnabled) return allRowEntries

    return allRowEntries
      .slice(paginationWindow.startIndex, paginationWindow.endIndex)
      .map((entry, index) => ({ ...entry, index }))
  }, [
    allRowEntries,
    isManualPagination,
    paginationEnabled,
    paginationWindow.endIndex,
    paginationWindow.startIndex,
  ])
  const visibleLeafRowIdSet = useMemo(
    () =>
      isManualPagination || !paginationEnabled
        ? undefined
        : new Set(leafRowEntries.map((entry) => entry.rowId)),
    [isManualPagination, leafRowEntries, paginationEnabled],
  )
  const groupedRowModel = useMemo(
    () =>
      buildGroupedRowModel({
        rows: allRowEntries,
        columns: consumerResolvedColumns,
        // Manual row processing skips client grouping so server-owned
        // pages render in the order the host returned. Grouping
        // controls (`groupByState`) stay current so the host can read
        // them via `query.view.groupBy` and react in `loadPage`.
        groupBy: isManualRowProcessing ? [] : groupByState,
        expansionState,
        locale,
        visibleRowIds: visibleLeafRowIdSet,
      }),
    [
      allRowEntries,
      consumerResolvedColumns,
      expansionState,
      groupByState,
      isManualRowProcessing,
      locale,
      visibleLeafRowIdSet,
    ],
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
    (entry: DataRowEntry<TRow>) =>
      resolveDetailPanelHeight({
        defaultHeight: DEFAULT_DETAIL_HEIGHT,
        detailPanelHeight,
        entry,
        hasDetail,
      }),
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
  const selectableLeafRowIds = useMemo(() => {
    const ids = new Set<RowId>()
    for (const entry of leafRowEntries) {
      if (!isRowDisabled(entry.row)) ids.add(entry.rowId)
    }
    return ids
  }, [isRowDisabled, leafRowEntries])

  // Layout-resolved columns including the synthetic pinned-left checkbox
  // column when `checkboxSelection` is on. The synthetic column is rebuilt
  // on every render so its closure captures the live selectionState +
  // setter; resolveColumns is cheap so the cache miss here is acceptable.
  const layoutColumnDefinitions = useMemo(() => {
    const syntheticColumns: BcReactGridColumn<TRow>[] = []
    if (hasDetail) {
      syntheticColumns.push(
        createDetailToggleColumn<TRow>({
          domBaseId,
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
    return syntheticColumns.length > 0 ? [...syntheticColumns, ...columns] : columns
  }, [
    columns,
    domBaseId,
    hasDetail,
    expansionState,
    props.checkboxSelection,
    selectionState,
    setExpansionState,
    setSelectionState,
    visibleSelectableRowIds,
  ])
  const resolvedColumns = useMemo(
    () =>
      layoutColumnDefinitions === columns
        ? consumerResolvedColumns
        : resolveColumns(layoutColumnDefinitions, columnState, viewport.width || undefined),
    [columnState, columns, consumerResolvedColumns, layoutColumnDefinitions, viewport.width],
  )
  const rangeInteractionModel = useMemo(
    () => createRangeInteractionModel(rangeRowIds, resolvedColumns),
    [rangeRowIds, resolvedColumns],
  )
  const previousRangeInteractionModelRef = useRef<ReturnType<
    typeof createRangeInteractionModel
  > | null>(null)
  useEffect(() => {
    const previous = previousRangeInteractionModelRef.current
    previousRangeInteractionModelRef.current = rangeInteractionModel
    if (
      shouldClearRangeSelectionForModelChange(rangeSelectionState, previous, rangeInteractionModel)
    ) {
      setRangeSelectionState(rangeClear(rangeSelectionState))
    }
  }, [rangeInteractionModel, rangeSelectionState, setRangeSelectionState])
  const aggregationResults = useAggregations(aggregationRows, consumerLeafColumns, {
    allRows: data,
    locale,
    rowId,
    scope: aggregationScope,
    selection: selectionState,
  })
  const hasAggregationFooter = aggregationResults.length > 0

  // Whether the inline filter row should render. Default is column-driven
  // (`filter-popup-variant`: row hidden when every filterable column is
  // variant="popup" or filter:false); `showFilterRow` overrides the
  // default so host apps can wire a filter-toggle button without touching
  // column defs. Active filter state (`columnFilterText`) is independent
  // and preserved across toggle — hiding the row never clears anything.
  const hasInlineFilters = useMemo(
    () => resolveFilterRowVisibility(showFilterRow, resolvedColumns),
    [showFilterRow, resolvedColumns],
  )
  const columnGroupHeaderRows = useMemo(
    () => deriveColumnGroupHeaderRows(layoutColumnDefinitions, resolvedColumns),
    [layoutColumnDefinitions, resolvedColumns],
  )
  const columnHeaderRowCount = columnGroupHeaderRows.length + 1
  const headerChromeHeight = headerHeight * (columnHeaderRowCount + (hasInlineFilters ? 1 : 0))
  const contentFitBodyHeight = useMemo(() => {
    let total = 0
    for (const entry of rowEntries) {
      if (isDataRowEntry(entry) && hasDetail && expansionState.has(entry.rowId)) {
        total += detailRowHeight(defaultRowHeight, getDetailHeight(entry))
      } else {
        total += defaultRowHeight
      }
    }
    return total
  }, [defaultRowHeight, expansionState, getDetailHeight, hasDetail, rowEntries])
  const contentFitHeight = resolveContentFitHeight({
    headerChromeHeight,
    bodyHeight: contentFitBodyHeight,
    minBodyHeight: defaultRowHeight,
    trailingChromeHeight: hasAggregationFooter ? defaultRowHeight : 0,
  })
  const minViewportFitHeight = headerChromeHeight + defaultRowHeight
  const viewportFitFallbackHeight = headerChromeHeight + DEFAULT_BODY_HEIGHT
  const resolvedHeight = resolveGridFitHeight({
    explicitHeight: height,
    fit,
    contentHeight: contentFitHeight,
    viewportHeight: viewportFitHeight,
    minViewportHeight: viewportFitFallbackHeight,
  })
  const fallbackBodyHeight = resolveFallbackBodyHeight(
    resolvedHeight,
    defaultRowHeight,
    headerChromeHeight,
  )

  useEffect(() => {
    const viewportFitEnabled = height === undefined && (fit === "viewport" || fit === "auto")
    if (!viewportFitEnabled || typeof window === "undefined") {
      setViewportFitHeight(null)
      return
    }

    let frame: number | null = null
    const updateHeight = () => {
      frame = null
      const rect = rootRef.current?.getBoundingClientRect()
      if (!rect) return
      const next = resolveViewportFitHeight({
        viewportHeight: window.innerHeight,
        elementTop: rect.top,
        minHeight: minViewportFitHeight,
      })
      setViewportFitHeight((prev) => (prev === next ? prev : next))
    }
    const scheduleHeightUpdate = () => {
      if (frame != null) return
      frame = window.requestAnimationFrame(updateHeight)
    }

    scheduleHeightUpdate()
    window.addEventListener("resize", scheduleHeightUpdate)
    return () => {
      if (frame != null) window.cancelAnimationFrame(frame)
      window.removeEventListener("resize", scheduleHeightUpdate)
    }
  }, [fit, height, minViewportFitHeight])

  const getLocalSetFilterOptions = useCallback(
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
          !matchesGridFilter(
            otherFilter,
            (filterColumnId) => {
              const filterColumn = columnsById.get(filterColumnId)
              if (!filterColumn) return ""
              const value = getCellValue(row, filterColumn.source)
              return {
                formattedValue: formatCellValue(value, row, filterColumn.source, locale),
                rawValue: value,
              }
            },
            { context: props.filterPredicateContext },
          )
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
      props.filterPredicateContext,
      props.showInactive,
      resolvedColumns,
      rowIsInactive,
      searchText,
    ],
  )
  const loadSetFilterOptions = useCallback(
    async (params: SetFilterOptionLoaderParams): Promise<SetFilterOptionLoadResult> => {
      const { loadGridSetFilterOptions } = await import("./setFilterLoader")
      return loadGridSetFilterOptions({
        columnFilterText,
        columnFilterTypes,
        getLocalSetFilterOptions,
        params,
        resolvedColumns,
      })
    },
    [columnFilterText, columnFilterTypes, getLocalSetFilterOptions, resolvedColumns],
  )
  const findHeaderFilterAnchor = useCallback((columnId: ColumnId): DOMRect | null => {
    const root = rootRef.current
    if (!root) return null
    const headers = Array.from(root.querySelectorAll<HTMLElement>(".bc-grid-header-cell"))
    const header = headers.find((candidate) => candidate.dataset.columnId === columnId)
    if (!header) return null
    const trigger = header.querySelector<HTMLElement>('[data-bc-grid-filter-button="true"]')
    return (trigger ?? header).getBoundingClientRect()
  }, [])
  const focusInlineFilter = useCallback(
    (columnId: ColumnId) => {
      if (typeof document === "undefined") return false
      const control = document.getElementById(`${domBaseId}-filter-${domToken(columnId)}`)
      if (!control || !rootRef.current?.contains(control)) return false
      if (!("focus" in control) || typeof control.focus !== "function") return false
      control.focus()
      if ("select" in control && typeof control.select === "function") control.select()
      return true
    },
    [domBaseId],
  )
  const openFilter = useCallback(
    (columnId: ColumnId, opts?: { variant?: "popup" | "inline" }) => {
      const column = resolvedColumns.find((candidate) => candidate.columnId === columnId)
      const filterConfig = column?.source.filter
      if (!column || !filterConfig) return

      const variant = opts?.variant ?? filterConfig.variant ?? "inline"
      if (variant === "inline") {
        closeFilterPopup()
        focusInlineFilter(columnId)
        return
      }

      const anchor = findHeaderFilterAnchor(columnId)
      if (!anchor) return
      setFilterPopupState({ columnId, anchor })
    },
    [closeFilterPopup, findHeaderFilterAnchor, focusInlineFilter, resolvedColumns],
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
    if (suppressNextInlineFilterCommitRef.current) {
      suppressNextInlineFilterCommitRef.current = false
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
        next.setRowHeight(index, detailRowHeight(defaultRowHeight, getDetailHeight(entry)))
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

  // Hand-off the early `useViewportSize` state into the virtualizer.
  // Pre-v0.6 these were a single `useViewportSync` hook, but its
  // dep on `virtualizer` meant it had to run late — forcing a second
  // ResizeObserver to feed `resolveColumns` earlier. PR (c) of
  // `layout-architecture-pass-rfc.md` collapses the two: the hook
  // runs early without a virtualizer dep, and the virtualizer wiring
  // is this small downstream effect.
  useEffect(() => {
    virtualizer.setViewport(viewport.height, viewport.width)
    requestRender()
  }, [virtualizer, viewport.height, viewport.width, requestRender])

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
  const virtualLeftPinnedCols = virtualWindow.cols.filter((col) => col.pinned === "left")
  const virtualCenterCols = virtualWindow.cols.filter((col) => col.pinned === null)
  const virtualRightPinnedCols = virtualWindow.cols.filter((col) => col.pinned === "right")
  const pinnedLeftWidth = virtualWindow.bodyLeft
  const pinnedRightWidth = Math.max(0, virtualWindow.totalWidth - virtualWindow.bodyRight)
  // Header rows render every column (no virtualization), so pinned-lane
  // wrappers in the header band size against the full pinned-side width
  // and use full-column-list partitions. Body lanes still size against
  // `pinnedLeftWidth` / `pinnedRightWidth` from the virtualizer's window.
  const leafLeftPinnedColumns = resolvedColumns.filter((column) => column.pinned === "left")
  const leafCenterColumns = resolvedColumns.filter((column) => column.pinned == null)
  const leafRightPinnedColumns = resolvedColumns.filter((column) => column.pinned === "right")
  const pinnedLeftFullWidth = leafLeftPinnedColumns.reduce((sum, column) => sum + column.width, 0)
  const pinnedRightFullWidth = leafRightPinnedColumns.reduce((sum, column) => sum + column.width, 0)
  // Canvas-X where the right pane begins. Cells inside the right lane are
  // positioned absolutely relative to the lane wrapper, so each cell's
  // canvas-X needs to be offset by the lane's start so the in-lane left
  // begins at 0 for the leftmost right-pinned column.
  const pinnedRightLaneOffset = Math.max(virtualWindow.totalWidth - pinnedRightFullWidth, 0)
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
  const onCellEditCommitProp = (props as { onCellEditCommit?: BcCellEditCommitHandler<TRow> })
    .onCellEditCommit
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
        // Sighted-user toast (audit P1-W3 §6). Fires alongside the
        // popover when an editor is mounted (mild duplication is fine
        // — popover stays inline, toast confirms transiently); fires
        // ALONE when the clear path rejects validation, since no
        // editor portal mounts there. The toast is the only visible
        // signal for that case.
        const message = messages.editValidationErrorAnnounce({ columnLabel, error: event.error })
        const key = ++validationToastKeyRef.current
        setValidationToast({ message, key })
        return
      }
      announceAssertive(messages.editServerErrorAnnounce({ columnLabel, error: event.error }))
      const serverMessage = messages.editServerErrorAnnounce({ columnLabel, error: event.error })
      const serverKey = ++validationToastKeyRef.current
      setValidationToast({ message: serverMessage, key: serverKey })
    },
  })

  // Auto-clear the validation toast after a short hold. Tied to
  // `key` so a fresh rejection during the hold restarts the timer
  // cleanly. 3 seconds matches typical screen-reader announce timing
  // and the sales-estimating Tab-driven entry rhythm.
  useEffect(() => {
    if (!validationToast) return
    const handle = setTimeout(() => {
      setValidationToast((current) => (current?.key === validationToast.key ? null : current))
    }, 3000)
    return () => clearTimeout(handle)
  }, [validationToast])

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
  // portal for absolute positioning. Source of truth is the DOM
  // (`getBoundingClientRect`), not the virtualizer's position calculator,
  // because the virtualizer's `scrollOffsetForRow` math assumes uniform
  // row heights and bypasses any layout shifts above the target row
  // (expanded detail panels, group rows, sticky-anything). Surfaced
  // 2026-05-03 by bsncraft: with `renderDetailPanel` configured and
  // multiple panels expanded, the editor portal landed offset upward
  // by the cumulative panel height. AG Grid uses the DOM-rect approach
  // for the same reason. Fallback to the virtualizer math when the
  // cell isn't yet in the DOM (rare first-paint edge case).
  //
  // Short-circuits to `null` for in-cell editors (audit
  // `in-cell-editor-mode-rfc.md` §3): the popup overlay is not
  // mounted in that case, so the rect is unused and the DOM lookup +
  // invalidation deps would be wasted work. Net effect: text /
  // number / checkbox / time editors stop calling
  // `getBoundingClientRect` on every state change; only popup-mode
  // select / multi-select / autocomplete editing pays that cost.
  //
  // Pre-PR (a) of `layout-architecture-pass-rfc.md` this `useMemo` had
  // an `expansionState` invalidation-only dep + a biome-ignore for
  // useExhaustiveDependencies — toggling detail panels above the
  // editing row shifted the cell's DOM y-position without changing
  // any value-dep. With sticky-positioned cells from PR (a), the
  // browser's layout pass owns cell positioning and `getBound-
  // ingClientRect` reads correctly without an explicit invalidation
  // hint. The dep dropped + the suppression dropped per RFC §4 memo 3.
  const editorCellRect = useMemo(() => {
    if (editController.editState.mode === "navigation") return null
    if (editController.editState.mode === "unmounting") return null
    const cell = editController.editState.cell
    const activeColumn = resolvedColumns.find((c) => c.columnId === cell.columnId)
    const activeEditor = activeColumn?.source.cellEditor ?? defaultTextEditor
    if (activeEditor?.popup !== true) return null
    const scrollerEl = scrollerRef.current
    const cellEl = document.getElementById(cellDomId(domBaseId, cell.rowId, cell.columnId))
    if (cellEl && scrollerEl) {
      // Editor portal mounts as a sibling of the canvas inside the
      // scroller, so its absolute `top` / `left` are relative to the
      // scroller's positioning context — NOT the grid root. The earlier
      // 628949c fix subtracted `rootRect` (which includes toolbar +
      // header viewport) so editors landed offset-down by exactly the
      // header height. bsncraft hit this on alpha.2 (visible 2026-05-03:
      // editor input rendering ~1 row below the cell). Compute the
      // cell's offset within the scrollable canvas:
      //   cellRect (screen-relative) − scrollerRect.top (screen-relative)
      //   + scroller.scrollTop (translates to canvas-coords)
      // The +scrollTop term is the key: absolute children of a
      // `position: relative; overflow: auto` scroll container scroll
      // with the scrolled content, so the editor's `top` must encode
      // the cell's position within the canvas, not within the visible
      // viewport.
      const cellRect = cellEl.getBoundingClientRect()
      const scrollerRect = scrollerEl.getBoundingClientRect()
      return {
        top: cellRect.top - scrollerRect.top + scrollerEl.scrollTop,
        left: cellRect.left - scrollerRect.left + scrollerEl.scrollLeft,
        width: cellRect.width,
        height: cellRect.height,
      }
    }
    const rowIndex = rowIndexById.get(cell.rowId)
    const colIndex = columnIndexById.get(cell.columnId)
    if (rowIndex == null || colIndex == null) return null
    const rowOffset = virtualizer.scrollOffsetForRow(rowIndex, "nearest")
    const colOffset = virtualizer.scrollOffsetForCol(colIndex, "nearest")
    const column = resolvedColumns[colIndex]
    return {
      top: rowOffset - scrollOffset.top,
      left: colOffset - scrollOffset.left,
      width: column?.width ?? 120,
      height: defaultRowHeight,
    }
  }, [
    editController.editState,
    rowIndexById,
    columnIndexById,
    virtualizer,
    defaultRowHeight,
    resolvedColumns,
    scrollOffset,
    domBaseId,
  ])

  // In-cell editor mount slot for `renderBodyCell` (audit
  // `in-cell-editor-mode-rfc.md` §3). Returns the `<EditorMount
  // mountStyle="in-cell">` JSX when the cell is the active edit
  // target AND its editor is non-popup. Popup editors are mounted by
  // `<EditorPortal>` in the overlay sibling — this factory returns
  // null for them so bodyCells falls back to the cell's normal
  // renderer output (which then shows under the popup).
  const renderInCellEditor = useCallback(
    (
      cellPos: BcCellPosition,
      cellColumnArg: ResolvedColumn<TRow>,
      rowEntryArg: DataRowEntry<TRow>,
    ): ReactNode => {
      const editorSpec = (cellColumnArg.source.cellEditor ?? defaultTextEditor) as
        | BcCellEditor<TRow>
        | undefined
      if (!editorSpec || editorSpec.popup === true) return null
      const rowIndex = rowIndexById.get(cellPos.rowId)
      const colIndex = columnIndexById.get(cellPos.columnId)
      return (
        <EditorMount
          controller={editController}
          cell={cellPos}
          column={cellColumnArg}
          rowEntry={rowEntryArg}
          editor={editorSpec}
          mountStyle="in-cell"
          showValidationMessages={showValidationMessages}
          showKeyboardHints={showEditorKeyboardHints}
          blurAction={editorBlurAction}
          escDiscardsRow={escDiscardsRow}
          editScrollOutAction={editScrollOutAction}
          {...(virtualizer ? { virtualizer } : {})}
          {...(typeof rowIndex === "number" ? { rowIndex } : {})}
          {...(typeof colIndex === "number" ? { colIndex } : {})}
        />
      )
    },
    [
      editController,
      rowIndexById,
      columnIndexById,
      virtualizer,
      showValidationMessages,
      showEditorKeyboardHints,
      editorBlurAction,
      escDiscardsRow,
      editScrollOutAction,
    ],
  )

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
  const pasteTsv = useCallback(
    async (params: BcGridPasteTsvParams): Promise<BcGridPasteTsvResult<TRow>> => {
      const activeRange = rangeSelectionState.ranges[rangeSelectionState.ranges.length - 1]
      const targetRange =
        params.range ??
        activeRange ??
        (activeCell ? { start: activeCell, end: activeCell } : undefined)

      if (!targetRange) {
        const error = pasteFailure("no-paste-target", "No active cell or range to paste into.")
        announceAssertive(messages.pasteRejectedAnnounce({ error: error.message }))
        return { ok: false, error }
      }

      if (editController.editState.mode !== "navigation") {
        const error = pasteFailure(
          "edit-in-progress",
          "Finish the active cell edit before pasting.",
        )
        announceAssertive(messages.pasteRejectedAnnounce({ error: error.message }))
        return { ok: false, range: targetRange, error }
      }

      const applyResult = await buildRangeTsvPasteApplyPlan({
        range: targetRange,
        tsv: params.tsv,
        columns: resolvedColumns,
        rowEntries,
        rowIds: rangeRowIds,
        ...(params.overflow ? { overflow: params.overflow } : {}),
        ...(params.signal ? { signal: params.signal } : {}),
      })

      if (!applyResult.ok) {
        const error = pasteFailureFromApplyFailure(applyResult.error)
        announceAssertive(messages.pasteRejectedAnnounce({ error: error.message }))
        return { ok: false, range: targetRange, error }
      }

      editController.commitFromPasteApplyPlan(applyResult.plan)
      const result = pasteSuccessFromApplyPlan(applyResult.plan)
      announcePolite(messages.pasteCommittedAnnounce({ count: result.appliedCount }))
      return result
    },
    [
      activeCell,
      announceAssertive,
      announcePolite,
      editController,
      messages,
      rangeRowIds,
      rangeSelectionState,
      resolvedColumns,
      rowEntries,
    ],
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
      getFilter() {
        return filterState
      },
      getActiveFilter(columnId) {
        return filterForColumn(filterState, columnId)
      },
      setColumnState(next) {
        setColumnState(next)
      },
      setSort(next) {
        setSortState(next)
      },
      setFilter(next) {
        applyFilterState(next)
      },
      openFilter,
      closeFilter(columnId) {
        closeFilterPopup(columnId)
      },
      clearFilter(columnId) {
        if (columnId == null) {
          applyFilterState(null)
          return
        }
        applyFilterState(removeColumnFromFilter(filterState, columnId))
      },
      setColumnPinned(columnId, pinned) {
        setColumnState(upsertColumnStateEntry(columnState, columnId, { pinned }))
      },
      setColumnHidden(columnId, hidden) {
        setColumnState(upsertColumnStateEntry(columnState, columnId, { hidden }))
      },
      autoSizeColumn(columnId) {
        const root = rootRef.current
        if (!root) return
        const column = resolvedColumns.find((entry) => entry.columnId === columnId)
        if (!column) return
        const measurements = measureColumnWidths(root, columnId)
        const next = computeAutosizeWidth(measurements, {
          minWidth: column.source.minWidth ?? 48,
          maxWidth: column.source.maxWidth ?? 800,
        })
        if (next == null) return
        setColumnState(upsertColumnStateEntry(columnState, columnId, { width: next }))
      },
      setRangeSelection(next) {
        setRangeSelectionState(next)
      },
      copyRange(range) {
        return copyRangeToClipboard(range, nextApi)
      },
      pasteTsv,
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
      startEdit(targetRowId, targetColumnId, opts) {
        // Audit P0-7. Mirrors keyboard activation but with `"api"`
        // source so consumer telemetry can split programmatic edits
        // from user gestures. The state machine itself absorbs the
        // event when the grid is already editing a different cell —
        // we don't try to "switch" implicitly, since that races with
        // an in-flight async commit.
        if (!editingEnabled) return
        if (editController.editState.mode !== "navigation") return
        const rowEntry = rowsById.get(targetRowId)
        if (!rowEntry || rowEntry.kind !== "data") return
        if (isRowDisabled(rowEntry.row)) return
        const column = resolvedColumns.find((c) => c.columnId === targetColumnId)
        if (!column) return
        if (!isCellEditable(column, rowEntry.row)) return
        const editorForActivation = column.source.cellEditor ?? defaultTextEditor
        const seedKey =
          typeof opts?.seedKey === "string" && [...opts.seedKey].length === 1
            ? opts.seedKey
            : undefined
        editController.start({ rowId: targetRowId, columnId: targetColumnId }, "api", {
          editor: editorForActivation as never,
          row: rowEntry.row,
          rowId: targetRowId,
          column: column.source,
          ...(seedKey != null ? { seedKey } : {}),
        })
      },
      commitEdit(opts) {
        // Audit P0-7. The editor portal owns the keyboard / pointer
        // commit paths and reads the value from the active editor's
        // input ref directly. The api lives outside that scope, so we
        // re-discover the input via the stable `data-bc-grid-editor-input`
        // marker the editor chrome stamps on every mounted editor.
        // Consumers can short-circuit the DOM read by passing `value`
        // directly (useful for typed-commit editors that already know
        // the value programmatically).
        if (editController.editState.mode !== "editing") return
        const cell = editController.editState.cell
        const rowEntry = rowsById.get(cell.rowId)
        if (!rowEntry || rowEntry.kind !== "data") return
        const column = resolvedColumns.find((c) => c.columnId === cell.columnId)
        if (!column) return
        const editorForRead = (column.source.cellEditor ?? defaultTextEditor) as BcCellEditor<TRow>
        const value =
          opts && Object.hasOwn(opts, "value")
            ? opts.value
            : readEditorInputValue(
                findActiveEditorInput(rootRef.current),
                editorForRead as BcCellEditor<unknown>,
              )
        const previousValue = column.source.field
          ? (rowEntry.row as Record<string, unknown>)[column.source.field]
          : undefined
        void editController.commit(
          {
            rowId: cell.rowId,
            row: rowEntry.row,
            columnId: cell.columnId,
            column: column.source,
            value,
            previousValue,
            source: "api",
          },
          opts?.moveOnSettle ?? "stay",
        )
      },
      cancelEdit() {
        // Audit P0-7. The state machine's `cancel` event is a no-op
        // outside of preparing/mounting/editing/validating modes, so
        // this is safe to call unconditionally.
        editController.cancel()
      },
      discardRowEdits(targetRowId) {
        // Audit P1-W3-3. The controller drops every non-pending /
        // non-error overlay patch on the row + cancels the active
        // editor if it's on the same row. Returns the discarded
        // count so consumers can announce "Reverted N changes" or
        // skip the toast when nothing rolled back.
        return editController.discardRowEdits(targetRowId)
      },
      getVisibleSetting(key) {
        const visible = userSettingsRef.current?.visible
        if (!visible) return undefined
        return (visible as Record<string, boolean | undefined>)[key]
      },
      setVisibleSetting(key, value) {
        setVisibleUserSetting(key as keyof NonNullable<BcUserSettings["visible"]>, value)
      },
      getPrefetchAhead() {
        return userSettingsRef.current?.prefetchAhead
      },
      setPrefetchAhead(value) {
        const clamped = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
        updateUserSettings((prev) => ({ ...prev, prefetchAhead: clamped }))
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
    editController,
    filterState,
    closeFilterPopup,
    focusCell,
    isRowDisabled,
    editingEnabled,
    openFilter,
    pasteTsv,
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
    applyFilterState,
    setRangeSelectionState,
    setSortState,
    setVisibleUserSetting,
    updateUserSettings,
    virtualizer,
  ])

  useEffect(() => assignRef(apiRef, api), [apiRef, api])

  // Status-bar render context per `chrome-rfc §Status bar`. The
  // `aggregations` segment consumes the same `useAggregations` output
  // already feeding the in-grid aggregation footer row, so the segment
  // and the row stay in sync at zero extra cost.
  // Re-read on every render — the controller bumps state on each new
  // validation error / auto-clear, which re-renders <BcGrid> and pulls
  // the fresh entry through. Including it in the useMemo deps means
  // the context stays stable when no error has fired and refreshes
  // exactly when one does.
  const latestValidationError = editController.getLatestValidationError()
  const statusBarContext = useMemo(
    () => ({
      api,
      totalRowCount: data.length,
      filteredRowCount: allRowEntries.length,
      selectedRowCount: computeSelectedRowCount(selectionState, data.length, allRowEntries.length),
      aggregations: aggregationResults,
      activeFilters: activeFilterSummaryItems,
      clearColumnFilter: clearColumnFilterText,
      clearAllFilters: clearAllColumnFilters,
      latestValidationError,
    }),
    [
      activeFilterSummaryItems,
      api,
      aggregationResults,
      allRowEntries.length,
      clearAllColumnFilters,
      clearColumnFilterText,
      data.length,
      latestValidationError,
      selectionState,
    ],
  )
  const activeFilterSummaryVisible =
    props.activeFilterSummary !== "off" && (userVisibleSettings?.activeFilterSummary ?? true)
  const activeFilterSummaryLocked = props.activeFilterSummary !== undefined
  const statusBarSegments = useMemo<
    readonly NonNullable<BcGridProps<TRow>["statusBar"]>[number][]
  >(() => {
    if (userVisibleSettings?.statusBar === false) return []
    const base =
      props.statusBar ??
      (userVisibleSettings?.statusBar === true ? (["total", "filtered", "selected"] as const) : [])
    if (!activeFilterSummaryVisible) return base
    if (base.includes("activeFilters")) return base
    return ["activeFilters", ...base]
  }, [activeFilterSummaryVisible, props.statusBar, userVisibleSettings?.statusBar])
  const statusBarVisible = userVisibleSettings?.statusBar ?? true

  const handlePaginationChange = useCallback(
    (next: BcPaginationState) => {
      const normalized = getPaginationWindow(paginationRowCount, next.page, next.pageSize)
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
      paginationRowCount,
      effectivePageSize,
      paginationWindow.page,
      props.onPaginationChange,
      setPageSizeState,
      setPageState,
      updateScrollOffset,
      virtualizer,
    ],
  )

  // `showPagination === false` hides the pager chrome but leaves
  // page-window slicing / aria-rowcount / onPaginationChange intact.
  // Vanilla-and-context-menu RFC §4 (View → Show pagination toggle).
  // Resolution: explicit prop wins; otherwise userSettings.visible.pagination
  // (driven by the DEFAULT_CONTEXT_MENU_ITEMS Server submenu); otherwise true.
  const showPaginationChrome = props.showPagination ?? userVisibleSettings?.pagination ?? true
  const renderedFooter =
    footer ??
    (paginationEnabled && showPaginationChrome ? (
      <BcGridPagination
        page={paginationWindow.page}
        pageCount={paginationWindow.pageCount}
        pageSize={effectivePageSize}
        pageSizeOptions={paginationPageSizeOptions}
        totalRows={paginationWindow.totalRows}
        onChange={handlePaginationChange}
      />
    ) : null)

  const clearContextSelection = useCallback(
    () => setSelectionState(createEmptySelection()),
    [setSelectionState],
  )

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

  const isAutoHeight = resolvedHeight === "auto"
  // Numeric height takes the root; "auto" lets the grid grow to its
  // canvas height; undefined falls through to the parent's flex space.
  const rootHeight = typeof resolvedHeight === "number" ? resolvedHeight : undefined
  // Auto-height & undefined both leave the scroller height to layout
  // (page-flow vs. parent-flex respectively, controlled by `pageFlow`
  // below). Only numeric height paths could benefit from a clamp here,
  // and the existing root flex column already enforces that.
  const bodyHeight: number | undefined = undefined

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const target = event.currentTarget
      virtualizer.setScrollTop(target.scrollTop)
      virtualizer.setScrollLeft(target.scrollLeft)
      updateScrollOffset({ top: target.scrollTop, left: target.scrollLeft })
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

      const currentRow = activeCell ? (rowIndexById.get(activeCell.rowId) ?? 0) : 0
      const currentCol = activeCell ? (columnIndexById.get(activeCell.columnId) ?? 0) : 0

      // Activation paths per `editing-rfc §Activation`:
      //   - F2 / Enter: toggle edit mode on the active cell
      //   - Printable single character (no Ctrl/Meta): seed the editor
      //   - Double-click is handled separately on the cell (onDoubleClick)
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
        editingEnabled &&
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
          column: cellColumn.source,
        }
        const activationIntent = getEditorActivationIntent({
          key: event.key,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
        })
        if (activationIntent.type === "start") {
          event.preventDefault()
          editController.start(cellTarget, activationIntent.activation, {
            ...startOpts,
            ...(activationIntent.activation === "printable"
              ? { seedKey: activationIntent.seedKey }
              : {}),
          })
          return
        }
        if (activationIntent.type === "clear") {
          // Excel-style clear semantics (audit P1-W3-1):
          //   - Backspace: clear + enter edit mode (so the user can
          //     immediately type a replacement value).
          //   - Delete: clear + stay in nav (the "I want it empty" gesture).
          //
          // Both run through column.valueParser (with `""` input) +
          // validate + the overlay update + onCellEditCommit, so
          // consumer column logic applies the same way as a keyboard
          // commit. Backspace activates with an empty seed so the
          // editor mounts with a blank input; Delete bypasses the
          // editor portal entirely via `editController.clearCell`.
          event.preventDefault()
          if (activationIntent.key === "Backspace") {
            editController.start(cellTarget, "printable", {
              ...startOpts,
              seedKey: "",
            })
          } else {
            // Read previous value the same way EditorMount does so
            // onCellEditCommit's previousValue matches what the user saw.
            const previousValue = cellColumn.source.field
              ? (cellRow.row as Record<string, unknown>)[cellColumn.source.field]
              : undefined
            void editController.clearCell({
              rowId: cellRow.rowId,
              row: cellRow.row,
              columnId: cellTarget.columnId,
              column: cellColumn.source,
              previousValue,
            })
          }
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
      if (outcome.type === "clearRange") {
        setRangeSelectionState(rangeClear(rangeSelectionState))
        return
      }
      if (outcome.type === "extendRange") {
        const nextRangeState = applyKeyboardRangeExtension({
          activeCell,
          columns: resolvedColumns,
          direction: outcome.direction,
          rangeSelection: rangeSelectionState,
          rowIds: rangeRowIds,
          toEdge: outcome.toEdge,
        })
        setRangeSelectionState(nextRangeState.rangeSelection)
        if (nextRangeState.activeCell) focusCell(nextRangeState.activeCell)
        return
      }
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
      editingEnabled,
      focusGroupRow,
      focusCell,
      isRowDisabled,
      pageRowCount,
      rangeSelectionState,
      rangeRowIds,
      resolvedColumns,
      rowEntries,
      rowIndexById,
      selectionState,
      setRangeSelectionState,
      setSelectionState,
      toggleGroupRow,
    ],
  )

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (editController.editState.mode !== "navigation") return
      if (isEditableKeyTarget(event.target)) return
      const activeRange = rangeSelectionState.ranges[rangeSelectionState.ranges.length - 1]
      const targetRange =
        activeRange ?? (activeCell ? { start: activeCell, end: activeCell } : undefined)
      if (!targetRange) return
      const hasPlainText = Array.from(event.clipboardData.types).includes("text/plain")
      if (!hasPlainText) return

      event.preventDefault()
      void pasteTsv({
        range: targetRange,
        tsv: event.clipboardData.getData("text/plain"),
      }).catch(() => undefined)
    },
    [activeCell, editController.editState.mode, pasteTsv, rangeSelectionState],
  )

  useFlipOnRowInsertion({
    rowEntries,
    scrollerRef,
    virtualizer,
    enabled: !isManualRowProcessing,
  })

  const handleHeaderSort = useCallback(
    (
      column: {
        columnId: (typeof resolvedColumns)[number]["columnId"]
        source: (typeof resolvedColumns)[number]["source"]
      },
      modifiers: SortModifiers,
    ) => {
      if (column.source.sortable === false) return
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
    [setSortState, sortState],
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
      if (!showColumnMenu) return
      // Viewport-clamp moved into ColumnVisibilityMenu via the shared
      // `computePopupPosition` helper — same Radix-Popper-style flip
      // and clamp the filter popup and context menu use. The anchor
      // here is the trigger button's bottom-left; the menu measures
      // its own DOM and re-positions on first layout.
      setColumnMenu({ x: anchor.x, y: anchor.y })
    },
    [showColumnMenu],
  )
  const closeColumnMenu = useCallback(() => setColumnMenu(null), [])
  useEffect(() => {
    if (!showColumnMenu) setColumnMenu(null)
  }, [showColumnMenu])
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

  // Pinned-edge scroll-shadow indicators. Surfaces as data attrs on the
  // grid root so theming can render shadows when content has scrolled
  // under a pinned region.
  const maxScrollLeft = Math.max(0, virtualWindow.totalWidth - viewport.width)
  const isScrolledLeft = scrollOffset.left > 1 && pinnedLeftCols > 0
  const isScrolledRight = scrollOffset.left < maxScrollLeft - 1 && pinnedRightCols > 0
  const sidebarContext = useMemo<BcSidebarContext<TRow>>(
    () => ({
      api,
      clearColumnFilterText,
      columnFilterText,
      columns,
      columnState,
      filterState: activeFilter,
      getSetFilterOptions: getLocalSetFilterOptions,
      groupableColumns: props.groupableColumns ?? [],
      groupBy: groupByState,
      loadSetFilterOptions,
      messages,
      pivotState,
      setColumnState,
      setColumnFilterText: updateColumnFilterText,
      setFilterState: applyFilterState,
      setGroupBy: setGroupByState,
      setPivotState,
    }),
    [
      activeFilter,
      api,
      clearColumnFilterText,
      columnFilterText,
      columnState,
      columns,
      getLocalSetFilterOptions,
      groupByState,
      loadSetFilterOptions,
      messages,
      pivotState,
      props.groupableColumns,
      applyFilterState,
      setColumnState,
      setGroupByState,
      setPivotState,
      updateColumnFilterText,
    ],
  )
  const bodyAriaRowOffset = columnHeaderRowCount + (hasInlineFilters ? 1 : 0) + 1
  const ContextMenuLayer = BcGridContextMenuLayer as ComponentType<
    BcGridContextMenuLayerProps<TRow>
  >
  const rowContextMenuActions = useMemo(() => {
    if (!rowContextInsert && !rowContextDuplicate && !rowContextDelete) return undefined
    return {
      canDelete: rowContextCanDelete,
      confirmDelete: rowContextConfirmDelete,
      onDelete: rowContextDelete,
      onDuplicateRow: rowContextDuplicate,
      onInsertRow: rowContextInsert,
    }
  }, [
    rowContextCanDelete,
    rowContextConfirmDelete,
    rowContextDelete,
    rowContextDuplicate,
    rowContextInsert,
  ])
  const chromeContextMenuItems = useMemo(
    () =>
      buildGridChromeContextMenuItems<TRow>({
        activeFilterSummaryLocked,
        activeFilterSummaryVisible,
        activeSidebarPanel,
        density,
        densityLocked: props.density !== undefined || props.layoutState?.density !== undefined,
        editingEnabled,
        editingEnabledLocked: editingEnabledProp !== undefined,
        editorActivation,
        editorActivationLocked: editorActivationProp !== undefined,
        editorBlurAction,
        editorBlurActionLocked: editorBlurActionProp !== undefined,
        escDiscardsRow,
        escDiscardsRowLocked: escDiscardsRowProp !== undefined,
        filterRowLocked,
        filterRowVisible: hasInlineFilters,
        groupBy: groupByState,
        groupableColumnIds,
        latestValidationError: editController.getLatestValidationError(),
        onActiveFilterSummaryVisibleChange: setActiveFilterSummaryVisiblePreference,
        onDensityChange: setDensityPreference,
        onDismissLatestValidationError: editController.clearLatestValidationError,
        onEditingEnabledChange: setEditingEnabledPreference,
        onEditorActivationChange: setEditorActivationPreference,
        onEditorBlurActionChange: setEditorBlurActionPreference,
        onEscDiscardsRowChange: setEscDiscardsRowPreference,
        onFilterRowVisibleChange: setFilterRowVisiblePreference,
        onGroupByChange: setGroupByState,
        onShowEditorKeyboardHintsChange: setShowEditorKeyboardHintsPreference,
        onShowValidationMessagesChange: setShowValidationMessagesPreference,
        onSidebarPanelChange: setSidebarPanelPreference,
        onSidebarVisibleChange: setSidebarVisiblePreference,
        onStatusBarVisibleChange: setStatusBarVisiblePreference,
        rowActions: rowContextMenuActions,
        showEditorKeyboardHints,
        showEditorKeyboardHintsLocked: showEditorKeyboardHintsProp !== undefined,
        showValidationMessages,
        showValidationMessagesLocked: showValidationMessagesProp !== undefined,
        sidebarAvailable: hasSidebar,
        sidebarPanels,
        sidebarVisible,
        statusBarVisible,
      }),
    [
      activeFilterSummaryLocked,
      activeFilterSummaryVisible,
      activeSidebarPanel,
      density,
      editController,
      editingEnabled,
      editingEnabledProp,
      editorActivation,
      editorActivationProp,
      editorBlurAction,
      editorBlurActionProp,
      escDiscardsRow,
      escDiscardsRowProp,
      filterRowLocked,
      groupByState,
      groupableColumnIds,
      hasInlineFilters,
      hasSidebar,
      props.density,
      props.layoutState?.density,
      rowContextMenuActions,
      setActiveFilterSummaryVisiblePreference,
      setDensityPreference,
      setEditingEnabledPreference,
      setEditorActivationPreference,
      setEditorBlurActionPreference,
      setEscDiscardsRowPreference,
      setFilterRowVisiblePreference,
      setGroupByState,
      setShowEditorKeyboardHintsPreference,
      setShowValidationMessagesPreference,
      setSidebarPanelPreference,
      setSidebarVisiblePreference,
      setStatusBarVisiblePreference,
      showEditorKeyboardHints,
      showEditorKeyboardHintsProp,
      showValidationMessages,
      showValidationMessagesProp,
      sidebarPanels,
      sidebarVisible,
      statusBarVisible,
    ],
  )

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
        // Per accessibility-rfc §aria-rowcount: total rows in the
        // underlying dataset. In manual pagination with a known server
        // total, surface that total + the chrome rows (header + filter
        // row + aggregation footer). Grouped column headers add extra
        // header rows, so use `columnHeaderRowCount` rather than assuming
        // a single leaf-header row.
        (isManualPagination && paginationTotalRows != null
          ? paginationTotalRows
          : rowEntries.length) +
        columnHeaderRowCount +
        (hasInlineFilters ? 1 : 0) +
        (hasAggregationFooter ? 1 : 0)
      }
      aria-colcount={resolvedColumns.length}
      aria-activedescendant={activeCellId}
      tabIndex={0}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      style={rootStyle(isAutoHeight ? "auto" : rootHeight)}
      data-bc-grid-fit={fit}
      data-bc-grid-height-mode={isAutoHeight ? "auto" : "fixed"}
    >
      {toolbar ? <div className="bc-grid-toolbar">{toolbar}</div> : null}

      <div className="bc-grid-main">
        <div className="bc-grid-table">
          <div
            ref={scrollerRef}
            className="bc-grid-viewport"
            onScroll={handleScroll}
            style={viewportStyle(bodyHeight, isAutoHeight, viewport.width)}
          >
            <div
              className="bc-grid-header-band"
              role="rowgroup"
              style={headerBandStyle(virtualWindow.totalWidth, headerChromeHeight)}
            >
              {columnGroupHeaderRows.map((row, rowIndex) => {
                const groupLeftCells = row.filter((cell) => cell.pinned === "left")
                const groupCenterCells = row.filter((cell) => cell.pinned == null)
                const groupRightCells = row.filter((cell) => cell.pinned === "right")
                return (
                  <div
                    key={row.map((cell) => `${cell.groupId}:${cell.ariaColIndex}`).join("|")}
                    className={classNames("bc-grid-header", "bc-grid-header-group-row")}
                    role="row"
                    aria-rowindex={rowIndex + 1}
                    style={headerRowStyle(virtualWindow.totalWidth, headerHeight)}
                  >
                    {groupLeftCells.length > 0 ? (
                      <div
                        className="bc-grid-pinned-lane bc-grid-pinned-lane-left"
                        data-bc-grid-pinned-lane="left"
                        style={pinnedLaneStyle("left", headerHeight, pinnedLeftFullWidth)}
                      >
                        {groupLeftCells.map((cell) =>
                          renderColumnGroupHeaderCell({
                            cell,
                            domBaseId,
                            headerHeight,
                          }),
                        )}
                      </div>
                    ) : null}
                    {groupCenterCells.map((cell) =>
                      renderColumnGroupHeaderCell({
                        cell,
                        domBaseId,
                        headerHeight,
                      }),
                    )}
                    {groupRightCells.length > 0 ? (
                      <div
                        className="bc-grid-pinned-lane bc-grid-pinned-lane-right"
                        data-bc-grid-pinned-lane="right"
                        style={pinnedLaneStyle("right", headerHeight, pinnedRightFullWidth)}
                      >
                        {groupRightCells.map((cell) =>
                          renderColumnGroupHeaderCell({
                            cell: { ...cell, left: cell.left - pinnedRightLaneOffset },
                            domBaseId,
                            headerHeight,
                          }),
                        )}
                      </div>
                    ) : null}
                  </div>
                )
              })}
              <div
                className={classNames(
                  "bc-grid-header",
                  columnGroupHeaderRows.length > 0 ? "bc-grid-header-leaf-row" : undefined,
                )}
                role="row"
                aria-rowindex={columnGroupHeaderRows.length + 1}
                style={headerRowStyle(virtualWindow.totalWidth, headerHeight)}
              >
                {leafLeftPinnedColumns.length > 0 ? (
                  <div
                    className="bc-grid-pinned-lane bc-grid-pinned-lane-left"
                    data-bc-grid-pinned-lane="left"
                    style={pinnedLaneStyle("left", headerHeight, pinnedLeftFullWidth)}
                  >
                    {leafLeftPinnedColumns.map((column) =>
                      renderHeaderCell({
                        column,
                        domBaseId,
                        headerHeight,
                        index: columnIndexById.get(column.columnId) ?? 0,
                        onColumnMenu: openColumnMenu,
                        onConsumeReorderClickSuppression: consumeColumnReorderClickSuppression,
                        onReorderEnd: endReorder,
                        onReorderMove: handleReorderPointerMove,
                        onReorderStart: handleReorderPointerDown,
                        onResizeEnd: endResize,
                        onResizeMove: handleResizePointerMove,
                        onResizeStart: handleResizePointerDown,
                        onSort: handleHeaderSort,
                        pinnedEdge: pinnedEdgeFor(
                          resolvedColumns,
                          columnIndexById.get(column.columnId) ?? 0,
                        ),
                        reorderingColumnId: columnReorderPreview?.sourceColumnId,
                        showColumnMenu,
                        sortState,
                        filterText: columnFilterText[column.columnId] ?? "",
                        filterPopupOpen: filterPopupState?.columnId === column.columnId,
                        onOpenFilterPopup: (col, anchor) =>
                          setFilterPopupState((prev) =>
                            prev?.columnId === col.columnId
                              ? null
                              : { columnId: col.columnId, anchor },
                          ),
                      }),
                    )}
                  </div>
                ) : null}
                {leafCenterColumns.map((column) =>
                  renderHeaderCell({
                    column,
                    domBaseId,
                    headerHeight,
                    index: columnIndexById.get(column.columnId) ?? 0,
                    onColumnMenu: openColumnMenu,
                    onConsumeReorderClickSuppression: consumeColumnReorderClickSuppression,
                    onReorderEnd: endReorder,
                    onReorderMove: handleReorderPointerMove,
                    onReorderStart: handleReorderPointerDown,
                    onResizeEnd: endResize,
                    onResizeMove: handleResizePointerMove,
                    onResizeStart: handleResizePointerDown,
                    onSort: handleHeaderSort,
                    pinnedEdge: pinnedEdgeFor(
                      resolvedColumns,
                      columnIndexById.get(column.columnId) ?? 0,
                    ),
                    reorderingColumnId: columnReorderPreview?.sourceColumnId,
                    showColumnMenu,
                    sortState,
                    filterText: columnFilterText[column.columnId] ?? "",
                    filterPopupOpen: filterPopupState?.columnId === column.columnId,
                    onOpenFilterPopup: (col, anchor) =>
                      setFilterPopupState((prev) =>
                        prev?.columnId === col.columnId ? null : { columnId: col.columnId, anchor },
                      ),
                  }),
                )}
                {leafRightPinnedColumns.length > 0 ? (
                  <div
                    className="bc-grid-pinned-lane bc-grid-pinned-lane-right"
                    data-bc-grid-pinned-lane="right"
                    style={pinnedLaneStyle("right", headerHeight, pinnedRightFullWidth)}
                  >
                    {leafRightPinnedColumns.map((column) =>
                      renderHeaderCell({
                        column: { ...column, left: column.left - pinnedRightLaneOffset },
                        domBaseId,
                        headerHeight,
                        index: columnIndexById.get(column.columnId) ?? 0,
                        onColumnMenu: openColumnMenu,
                        onConsumeReorderClickSuppression: consumeColumnReorderClickSuppression,
                        onReorderEnd: endReorder,
                        onReorderMove: handleReorderPointerMove,
                        onReorderStart: handleReorderPointerDown,
                        onResizeEnd: endResize,
                        onResizeMove: handleResizePointerMove,
                        onResizeStart: handleResizePointerDown,
                        onSort: handleHeaderSort,
                        pinnedEdge: pinnedEdgeFor(
                          resolvedColumns,
                          columnIndexById.get(column.columnId) ?? 0,
                        ),
                        reorderingColumnId: columnReorderPreview?.sourceColumnId,
                        showColumnMenu,
                        sortState,
                        filterText: columnFilterText[column.columnId] ?? "",
                        filterPopupOpen: filterPopupState?.columnId === column.columnId,
                        onOpenFilterPopup: (col, anchor) =>
                          setFilterPopupState((prev) =>
                            prev?.columnId === col.columnId
                              ? null
                              : { columnId: col.columnId, anchor },
                          ),
                      }),
                    )}
                  </div>
                ) : null}
              </div>
              {columnReorderPreview ? (
                <div
                  aria-hidden="true"
                  className="bc-grid-column-drop-indicator"
                  style={{
                    height: headerChromeHeight,
                    left: columnReorderPreview.indicatorLeft,
                  }}
                />
              ) : null}
              {hasInlineFilters ? (
                <div
                  className="bc-grid-filter-row"
                  role="row"
                  aria-rowindex={columnHeaderRowCount + 1}
                  style={headerRowStyle(virtualWindow.totalWidth, headerHeight)}
                >
                  {leafLeftPinnedColumns.length > 0 ? (
                    <div
                      className="bc-grid-pinned-lane bc-grid-pinned-lane-left"
                      data-bc-grid-pinned-lane="left"
                      style={pinnedLaneStyle("left", headerHeight, pinnedLeftFullWidth)}
                    >
                      {leafLeftPinnedColumns.map((column) =>
                        renderFilterCell({
                          column,
                          domBaseId,
                          filterText: columnFilterText[column.columnId] ?? "",
                          headerHeight,
                          index: columnIndexById.get(column.columnId) ?? 0,
                          loadSetFilterOptions,
                          onFilterChange: (next) => updateColumnFilterText(column.columnId, next),
                          pinnedEdge: pinnedEdgeFor(
                            resolvedColumns,
                            columnIndexById.get(column.columnId) ?? 0,
                          ),
                          messages,
                        }),
                      )}
                    </div>
                  ) : null}
                  {leafCenterColumns.map((column) =>
                    renderFilterCell({
                      column,
                      domBaseId,
                      filterText: columnFilterText[column.columnId] ?? "",
                      headerHeight,
                      index: columnIndexById.get(column.columnId) ?? 0,
                      loadSetFilterOptions,
                      onFilterChange: (next) => updateColumnFilterText(column.columnId, next),
                      pinnedEdge: pinnedEdgeFor(
                        resolvedColumns,
                        columnIndexById.get(column.columnId) ?? 0,
                      ),
                      messages,
                    }),
                  )}
                  {leafRightPinnedColumns.length > 0 ? (
                    <div
                      className="bc-grid-pinned-lane bc-grid-pinned-lane-right"
                      data-bc-grid-pinned-lane="right"
                      style={pinnedLaneStyle("right", headerHeight, pinnedRightFullWidth)}
                    >
                      {leafRightPinnedColumns.map((column) =>
                        renderFilterCell({
                          column: { ...column, left: column.left - pinnedRightLaneOffset },
                          domBaseId,
                          filterText: columnFilterText[column.columnId] ?? "",
                          headerHeight,
                          index: columnIndexById.get(column.columnId) ?? 0,
                          loadSetFilterOptions,
                          onFilterChange: (next) => updateColumnFilterText(column.columnId, next),
                          pinnedEdge: pinnedEdgeFor(
                            resolvedColumns,
                            columnIndexById.get(column.columnId) ?? 0,
                          ),
                          messages,
                        }),
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div
              className="bc-grid-canvas"
              role="rowgroup"
              style={canvasStyle(virtualWindow.totalHeight, virtualWindow.totalWidth)}
            >
              {virtualWindow.rows.map((virtualRow) => {
                const entry = rowEntries[virtualRow.index]
                if (!entry) return null
                if (!isDataRowEntry(entry)) {
                  const groupSelectableRowIds = entry.childRowIds.filter((rowId) =>
                    selectableLeafRowIds.has(rowId),
                  )
                  const toggleGroupSelection = () => {
                    if (groupSelectableRowIds.length === 0) return false
                    setSelectionState(toggleRows(selectionState, groupSelectableRowIds))
                    selectionAnchorRef.current = groupSelectableRowIds[0] ?? entry.rowId
                    return true
                  }
                  const groupSelectionProps = props.checkboxSelection
                    ? {
                        groupSelectionDisabled: groupSelectableRowIds.length === 0,
                        groupSelectionState: headerCheckboxState(
                          selectionState,
                          groupSelectableRowIds,
                        ),
                        onToggleSelection: () => {
                          toggleGroupSelection()
                        },
                      }
                    : {}
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
                      style={buildRowStyle(
                        virtualRow.top,
                        virtualRow.height,
                        virtualWindow.totalWidth,
                      )}
                      onClick={(event) => {
                        focusGroupRow(entry)
                        if (
                          (event.shiftKey || event.ctrlKey || event.metaKey) &&
                          toggleGroupSelection()
                        ) {
                          return
                        }
                        toggleGroupRow(entry)
                      }}
                    >
                      {renderGroupRowCell({
                        activeCell,
                        colCount: resolvedColumns.length,
                        column: resolvedColumns[0],
                        domBaseId,
                        entry,
                        ...groupSelectionProps,
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
                const focused = activeCell?.rowId === entry.rowId
                const expanded = hasDetail && expansionState.has(entry.rowId)
                const detailHeight = expanded ? getDetailHeight(entry) : 0
                const cellVirtualRow = expanded
                  ? { ...virtualRow, height: defaultRowHeight }
                  : virtualRow
                const rowParams = {
                  row: entry.row,
                  rowId: entry.rowId,
                  rowIndex: virtualRow.index,
                  selected,
                  focused,
                  disabled,
                }
                const consumerRowClassName =
                  typeof props.rowClassName === "function"
                    ? props.rowClassName(rowParams)
                    : props.rowClassName
                const consumerRowStyle =
                  typeof props.rowStyle === "function" ? props.rowStyle(rowParams) : props.rowStyle
                return (
                  <div
                    key={entry.rowId}
                    className={classNames(
                      "bc-grid-row",
                      selected ? "bc-grid-row-selected" : undefined,
                      focused ? "bc-grid-row-focused" : undefined,
                      disabled ? "bc-grid-row-disabled" : undefined,
                      expanded ? "bc-grid-row-expanded" : undefined,
                      consumerRowClassName,
                    )}
                    role="row"
                    aria-rowindex={virtualRow.index + bodyAriaRowOffset}
                    aria-level={groupingActive ? entry.level : undefined}
                    aria-selected={selected || undefined}
                    aria-disabled={disabled || undefined}
                    data-row-id={entry.rowId}
                    data-row-index={virtualRow.index}
                    data-bc-grid-focused-row={focused || undefined}
                    data-bc-grid-row-kind="data"
                    data-bc-grid-expanded={expanded || undefined}
                    style={{
                      ...buildRowStyle(virtualRow.top, virtualRow.height, virtualWindow.totalWidth),
                      ...consumerRowStyle,
                    }}
                    onClick={(event) => {
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
                      // Single-click activation mode (forms-style ERP screens).
                      // Default `"double-click"` mode skips this branch; the
                      // dblclick handler below owns activation. `"f2-only"`
                      // mode skips both — keyboard-only edits.
                      if (
                        editingEnabled &&
                        editorActivation === "single-click" &&
                        !disabled &&
                        !event.shiftKey &&
                        !event.ctrlKey &&
                        !event.metaKey
                      ) {
                        const target = (event.target as HTMLElement).closest<HTMLElement>(
                          "[data-column-id]",
                        )
                        const columnId = target?.dataset.columnId
                        if (columnId) {
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
                                column: column.source,
                              },
                            )
                          }
                        }
                      }
                      onRowClick?.(entry.row, event)
                    }}
                    onDoubleClick={(event) => {
                      // Activate edit on the cell at the click point if the
                      // column is editable. Falls through to onRowDoubleClick
                      // either way. Skipped in `"f2-only"` and `"single-click"`
                      // modes — the latter handled the activation on single
                      // click already.
                      const target = (event.target as HTMLElement).closest<HTMLElement>(
                        "[data-column-id]",
                      )
                      const columnId = target?.dataset.columnId
                      if (
                        editingEnabled &&
                        editorActivation === "double-click" &&
                        !disabled &&
                        columnId
                      ) {
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
                              column: column.source,
                            },
                          )
                        }
                      }
                      onRowDoubleClick?.(entry.row, event)
                    }}
                  >
                    {virtualLeftPinnedCols.length > 0 ? (
                      <div
                        className="bc-grid-pinned-lane bc-grid-pinned-lane-left"
                        data-bc-grid-pinned-lane="left"
                        style={pinnedLaneStyle("left", cellVirtualRow.height, pinnedLeftWidth)}
                      >
                        {virtualLeftPinnedCols.map((virtualCol) =>
                          renderBodyCell({
                            activeCell,
                            column: resolvedColumns[virtualCol.index],
                            domBaseId,
                            entry,
                            locale,
                            onCellFocus,
                            pinnedEdge: pinnedEdgeFor(resolvedColumns, virtualCol.index),
                            pinnedLaneOffset: 0,
                            searchText,
                            setActiveCell,
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
                            renderInCellEditor,
                            isCellFlashing: editController.isCellFlashing,
                          }),
                        )}
                      </div>
                    ) : null}
                    {virtualCenterCols.map((virtualCol) =>
                      renderBodyCell({
                        activeCell,
                        column: resolvedColumns[virtualCol.index],
                        domBaseId,
                        entry,
                        locale,
                        onCellFocus,
                        pinnedEdge: pinnedEdgeFor(resolvedColumns, virtualCol.index),
                        searchText,
                        setActiveCell,
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
                        renderInCellEditor,
                        isCellFlashing: editController.isCellFlashing,
                      }),
                    )}
                    {virtualRightPinnedCols.length > 0 ? (
                      <div
                        className="bc-grid-pinned-lane bc-grid-pinned-lane-right"
                        data-bc-grid-pinned-lane="right"
                        style={pinnedLaneStyle("right", cellVirtualRow.height, pinnedRightWidth)}
                      >
                        {virtualRightPinnedCols.map((virtualCol) =>
                          renderBodyCell({
                            activeCell,
                            column: resolvedColumns[virtualCol.index],
                            domBaseId,
                            entry,
                            locale,
                            onCellFocus,
                            pinnedEdge: pinnedEdgeFor(resolvedColumns, virtualCol.index),
                            pinnedLaneOffset: virtualWindow.bodyRight,
                            searchText,
                            setActiveCell,
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
                            renderInCellEditor,
                            isCellFlashing: editController.isCellFlashing,
                          }),
                        )}
                      </div>
                    ) : null}
                    {expanded && renderDetailPanel ? (
                      <BcDetailPanelSlot
                        colSpan={resolvedColumns.length}
                        domBaseId={domBaseId}
                        height={detailHeight}
                        renderDetailPanel={renderDetailPanel}
                        row={entry.row}
                        rowId={entry.rowId}
                        rowIndex={entry.index}
                        top={defaultRowHeight}
                        width={virtualWindow.totalWidth}
                      />
                    ) : null}
                  </div>
                )
              })}
              <BcRangeOverlay
                columns={resolvedColumns}
                rangeSelection={rangeSelectionState}
                rowIds={rangeRowIds}
                scrollLeft={scrollOffset.left}
                totalWidth={virtualWindow.totalWidth}
                viewportWidth={viewport.width}
                virtualizer={virtualizer}
              />
            </div>
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
            showValidationMessages={showValidationMessages}
            showKeyboardHints={showEditorKeyboardHints}
            blurAction={editorBlurAction}
            escDiscardsRow={escDiscardsRow}
          />

          {loading ? (
            <div className="bc-grid-overlay" role="status" style={overlayStyle}>
              {loadingOverlay ?? <BcGridDefaultLoadingOverlay label={messages.loadingLabel} />}
            </div>
          ) : null}

          {!loading && rowEntries.length === 0 ? (
            <div className="bc-grid-overlay" role="status" style={overlayStyle}>
              {messages.noRowsLabel}
            </div>
          ) : null}

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

          {statusBarSegments.length > 0 ? (
            <BcStatusBar
              segments={statusBarSegments}
              ctx={statusBarContext}
              ariaLabel={messages.statusBarLabel}
            />
          ) : null}
        </div>

        {sidebarVisible ? (
          <BcGridSidebar
            panels={sidebarPanels}
            activePanelId={activeSidebarPanel}
            context={sidebarContext}
            domBaseId={domBaseId}
            width={props.sidebarWidth}
            onActivePanelChange={setSidebarPanelPreference}
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

      <Suspense fallback={null}>
        <ContextMenuLayer
          args={[
            activeCell,
            api,
            props.contextMenuItems ?? chromeContextMenuItems,
            clearContextSelection,
            copyRangeToClipboard,
            editController.editState.mode === "navigation",
            onCellFocus,
            resolvedColumns,
            rowEntries,
            rowsById,
            rootRef,
            selectionState,
            setActiveCell,
          ]}
        />
      </Suspense>

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
      {/*
       * Visible validation toast (audit P1-W3 §6) — sighted-user
       * companion to the assertive live region above. Fires on
       * `validationError` / `serverError` from the editing
       * controller's announce hook. Auto-clears after 3s; aria-hidden
       * because the assertive region above already covers AT.
       */}
      {validationToast ? (
        <div
          key={validationToast.key}
          className="bc-grid-validation-toast"
          data-bc-grid-validation-toast="true"
          aria-hidden="true"
        >
          {validationToast.message}
        </div>
      ) : null}
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
                column={popupColumn.source}
                columnId={popupColumnId}
                filterType={popupFilter.type}
                filterText={columnFilterText[popupColumnId] ?? ""}
                filterLabel={popupLabel}
                loadSetFilterOptions={loadSetFilterOptions}
                onFilterChange={(next) => updateColumnFilterText(popupColumnId, next)}
                onClear={() => {
                  clearColumnFilterText(popupColumnId)
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

function BcGridDefaultLoadingOverlay({ label }: { label: string }): ReactNode {
  return (
    <span className="bc-grid-loading-state">
      <span className="bc-grid-loading-spinner" aria-hidden="true" />
      <span className="bc-grid-loading-label">{label}</span>
    </span>
  )
}

function pasteSuccessFromApplyPlan<TRow>(
  plan: RangeTsvPasteApplyPlan<TRow>,
): Extract<BcGridPasteTsvResult<TRow>, { ok: true }> {
  return {
    ok: true,
    range: plan.range,
    cells: plan.parsed.cells,
    appliedCount: plan.commits.length,
    commits: plan.commits.map((commit) => ({
      sourceRowIndex: commit.sourceRowIndex,
      sourceColumnIndex: commit.sourceColumnIndex,
      targetRowIndex: commit.targetRowIndex,
      targetColumnIndex: commit.targetColumnIndex,
      rowId: commit.rowId,
      row: commit.row,
      columnId: commit.columnId,
      previousValue: commit.previousValue,
      nextValue: commit.nextValue,
      rawValue: commit.rawValue,
    })),
    rowPatches: plan.rowPatches.map((patch) => ({
      rowId: patch.rowId,
      row: patch.row,
      values: { ...patch.values },
    })),
    skippedCells: plan.skippedCells.map(publicPasteSkippedCell),
  }
}

function pasteFailureFromApplyFailure(error: RangeTsvPasteApplyFailure): BcGridPasteTsvFailure {
  const failure = pasteFailure(error.code, error.message)
  if (error.sourceRowIndex !== undefined) failure.sourceRowIndex = error.sourceRowIndex
  if (error.sourceColumnIndex !== undefined) failure.sourceColumnIndex = error.sourceColumnIndex
  if (error.targetRowIndex !== undefined) failure.targetRowIndex = error.targetRowIndex
  if (error.targetColumnIndex !== undefined) failure.targetColumnIndex = error.targetColumnIndex
  if (error.rowId !== undefined) failure.rowId = error.rowId
  if (error.columnId !== undefined) failure.columnId = error.columnId
  if (error.rawValue !== undefined) failure.rawValue = error.rawValue
  if (error.diagnostic) failure.diagnostic = { ...error.diagnostic }
  if (error.skippedCell) failure.skippedCell = publicPasteSkippedCell(error.skippedCell)
  if (error.validation) failure.validation = error.validation
  return failure
}

function pasteFailure(code: BcGridPasteTsvFailure["code"], message: string): BcGridPasteTsvFailure {
  return { code, message }
}

function publicPasteSkippedCell(cell: BcGridPasteTsvSkippedCell): BcGridPasteTsvSkippedCell {
  return {
    sourceRowIndex: cell.sourceRowIndex,
    sourceColumnIndex: cell.sourceColumnIndex,
    ...(cell.targetRowIndex !== undefined ? { targetRowIndex: cell.targetRowIndex } : {}),
    ...(cell.targetColumnIndex !== undefined ? { targetColumnIndex: cell.targetColumnIndex } : {}),
    ...(cell.rowId !== undefined ? { rowId: cell.rowId } : {}),
    ...(cell.columnId !== undefined ? { columnId: cell.columnId } : {}),
    value: cell.value,
    reasons: [...cell.reasons],
  }
}

function isEditableKeyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || editableKeyTargetTags.has(target.tagName)
}

/**
 * Activation guard per `editing-rfc §Activation guards`. The column may
 * declare `editable` as a boolean or a row-fn. When `editable` is
 * undefined the default is `cellEditor != null` so a column that ships
 * a custom `cellEditor` is editable out of the box (bsncraft 2026-05
 * P1 #10: silent no-op when `cellEditor` was set without `editable`
 * was a discoverability trap). Set `editable: false` to opt out.
 */
function isCellEditable<TRow>(
  column: {
    source: {
      editable?: boolean | ((row: TRow) => boolean)
      cellEditor?: unknown
    }
  },
  row: TRow,
): boolean {
  const editable = column.source.editable
  if (typeof editable === "function") return editable(row)
  if (typeof editable === "boolean") return editable
  return column.source.cellEditor != null
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
  const items = flattenColumnDefinitions(columns, { includeHidden: true }).map(
    ({ column, columnId }) => {
      const hidden = stateById.get(columnId)?.hidden ?? column.hidden ?? false
      return {
        columnId,
        hidden,
        label: columnVisibilityLabel(column, columnId),
      }
    },
  )
  const visibleCount = items.filter((item) => !item.hidden).length
  return items.map((item) => ({
    ...item,
    hideDisabled: !item.hidden && visibleCount <= 1,
  }))
}

function columnVisibilityLabel<TRow>(column: BcReactGridColumn<TRow>, columnId: ColumnId): string {
  return typeof column.header === "string" ? column.header : columnId
}
