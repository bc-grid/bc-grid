import type {
  BcSelection,
  BcServerGridApi,
  ColumnId,
  RowId,
  ServerBlockKey,
  ServerInvalidation,
  ServerRowModelMode,
  ServerRowModelState,
  ServerSelection,
  ServerViewState,
} from "@bc-grid/core"
import { type ReactNode, useEffect, useMemo } from "react"
import { BcGrid, useBcGridApi } from "./grid"
import { assignRef, createEmptySelection } from "./gridInternals"
import type { BcGridProps, BcServerGridProps } from "./types"

export function BcServerGrid<TRow>(props: BcServerGridProps<TRow>): ReactNode {
  const gridApiRef = useBcGridApi<TRow>()
  const rows = serverRows(props)
  const externalApiRef = props.apiRef
  const visibleColumns = useMemo(
    () =>
      props.columns
        .filter((column) => !column.hidden)
        .map((column, index) => column.columnId ?? column.field ?? `column-${index}`),
    [props.columns],
  )

  const serverApi = useMemo<BcServerGridApi<TRow>>(() => {
    const mode = props.rowModel
    const view = createServerViewState(visibleColumns, props.locale)

    return {
      scrollToRow(rowId, opts) {
        gridApiRef.current?.scrollToRow(rowId, opts)
      },
      scrollToCell(position, opts) {
        gridApiRef.current?.scrollToCell(position, opts)
      },
      focusCell(position) {
        gridApiRef.current?.focusCell(position)
      },
      isCellVisible(position) {
        return gridApiRef.current?.isCellVisible(position) ?? false
      },
      getRowById(rowId) {
        return gridApiRef.current?.getRowById(rowId)
      },
      getActiveCell() {
        return gridApiRef.current?.getActiveCell() ?? null
      },
      getSelection() {
        return gridApiRef.current?.getSelection() ?? createEmptySelection()
      },
      getColumnState() {
        return gridApiRef.current?.getColumnState() ?? []
      },
      setColumnState(state) {
        gridApiRef.current?.setColumnState(state)
      },
      setSort(sort) {
        gridApiRef.current?.setSort(sort)
      },
      setFilter(filter) {
        gridApiRef.current?.setFilter(filter)
      },
      expandAll() {
        gridApiRef.current?.expandAll()
      },
      collapseAll() {
        gridApiRef.current?.collapseAll()
      },
      refresh() {
        gridApiRef.current?.refresh()
      },
      refreshServerRows() {
        gridApiRef.current?.refresh()
      },
      invalidateServerRows(_invalidation: ServerInvalidation) {},
      retryServerBlock(_blockKey: ServerBlockKey) {},
      getServerRowModelState() {
        return createServerRowModelState({
          mode,
          rowCount: serverRowCount(props),
          selection: toServerSelection(gridApiRef.current?.getSelection(), view),
          view,
        })
      },
    }
  }, [gridApiRef, props, visibleColumns])

  useEffect(() => assignRef(externalApiRef, serverApi), [externalApiRef, serverApi])

  const gridProps = props as unknown as BcGridProps<TRow>
  return (
    <BcGrid
      {...gridProps}
      data={rows}
      apiRef={gridApiRef}
      loading={props.loading ?? props.rowModel !== "paged"}
    />
  )
}

function serverRows<TRow>(props: BcServerGridProps<TRow>): readonly TRow[] {
  if (props.rowModel === "paged") return props.initialResult?.rows ?? []
  return []
}

function serverRowCount<TRow>(props: BcServerGridProps<TRow>): number | "unknown" {
  if (props.rowModel === "paged") return props.initialResult?.totalRows ?? 0
  return "unknown"
}

function createServerViewState(
  visibleColumns: readonly ColumnId[],
  locale: string | undefined,
): ServerViewState {
  return {
    groupBy: [],
    sort: [],
    visibleColumns: [...visibleColumns],
    ...(locale ? { locale } : {}),
  }
}

function createServerRowModelState<TRow>(input: {
  mode: ServerRowModelMode
  rowCount: number | "unknown"
  selection: ServerSelection
  view: ServerViewState
}): ServerRowModelState<TRow> {
  return {
    blocks: new Map(),
    mode: input.mode,
    pendingMutations: new Map(),
    rowCount: input.rowCount,
    selection: input.selection,
    view: input.view,
    viewKey: "react-scaffold",
  }
}

function toServerSelection(
  selection: BcSelection | undefined,
  view: ServerViewState,
): ServerSelection {
  if (!selection) return { mode: "explicit", rowIds: new Set<RowId>() }
  if (selection.mode === "filtered") {
    return {
      mode: "filtered",
      except: selection.except,
      view,
      ...(selection.viewKey ? { viewKey: selection.viewKey } : {}),
    }
  }
  return selection
}
