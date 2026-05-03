import type { BcCellPosition, ColumnId, RowId } from "@bc-grid/core"
import type { RowEntry } from "./gridInternals"
import {
  LONG_PRESS_DEFAULT_THRESHOLD_MS,
  type LongPressState,
  isCoarsePointerType,
  shouldCancelLongPressOnMove,
} from "./touchInteraction"

export interface BcGridContextMenuState {
  anchor: { x: number; y: number }
  columnId?: ColumnId | undefined
  rowId?: RowId | undefined
}

export function attachContextMenuEvents(
  root: HTMLElement,
  applyContextMenuState: (state: BcGridContextMenuState | null) => void,
): () => void {
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let longPressOpened = false
  let longPressOrigin: LongPressState | null = null

  const clearLongPress = () => {
    if (longPressTimer == null) return
    clearTimeout(longPressTimer)
    longPressTimer = null
    longPressOrigin = null
  }
  const handleContextMenu = (event: MouseEvent) => {
    const state = contextMenuStateFromTarget(event.target, {
      x: event.clientX,
      y: event.clientY,
    })
    if (!state) return
    event.preventDefault()
    event.stopPropagation()
    clearLongPress()
    applyContextMenuState(state)
  }
  const handlePointerDown = (event: PointerEvent) => {
    // Long-press fallback only applies to coarse pointers (touch / pen)
    // — mouse uses the native `contextmenu` event. Anything other than
    // primary button is ignored so right-click + a stray finger don't
    // double-fire.
    if (event.button !== 0 || !isCoarsePointerType(event.pointerType)) return
    const state = contextMenuStateFromTarget(event.target, {
      x: event.clientX,
      y: event.clientY,
    })
    if (!state) return
    clearLongPress()
    longPressOrigin = { startX: event.clientX, startY: event.clientY }
    longPressTimer = setTimeout(() => {
      longPressTimer = null
      longPressOrigin = null
      longPressOpened = true
      applyContextMenuState(state)
    }, LONG_PRESS_DEFAULT_THRESHOLD_MS)
  }
  const handlePointerMove = (event: PointerEvent) => {
    // If the pointer drifts beyond the tap-slop threshold the user has
    // started panning, not pressing — cancel the pending long-press so
    // the gesture flips to "scroll" without firing a context menu.
    if (longPressTimer == null || longPressOrigin == null) return
    if (shouldCancelLongPressOnMove(longPressOrigin, { x: event.clientX, y: event.clientY })) {
      clearLongPress()
    }
  }
  const handleClick = (event: MouseEvent) => {
    if (!longPressOpened) return
    longPressOpened = false
    event.preventDefault()
    event.stopPropagation()
  }

  root.addEventListener("contextmenu", handleContextMenu, true)
  root.addEventListener("pointerdown", handlePointerDown)
  root.addEventListener("pointermove", handlePointerMove)
  root.addEventListener("pointerup", clearLongPress)
  root.addEventListener("pointercancel", clearLongPress)
  root.addEventListener("pointerleave", clearLongPress)
  root.addEventListener("click", handleClick, true)

  return () => {
    clearLongPress()
    root.removeEventListener("contextmenu", handleContextMenu, true)
    root.removeEventListener("pointerdown", handlePointerDown)
    root.removeEventListener("pointermove", handlePointerMove)
    root.removeEventListener("pointerup", clearLongPress)
    root.removeEventListener("pointercancel", clearLongPress)
    root.removeEventListener("pointerleave", clearLongPress)
    root.removeEventListener("click", handleClick, true)
  }
}

export function contextMenuStateFromKeyboard<TRow>({
  activeCell,
  firstColumnId,
  root,
  rowEntries,
}: {
  activeCell: BcCellPosition | null
  firstColumnId?: ColumnId | undefined
  root: HTMLElement | null
  rowEntries: readonly RowEntry<TRow>[]
}): BcGridContextMenuState | null {
  const rowId = activeCell?.rowId ?? rowEntries.find((entry) => entry.kind === "data")?.rowId
  const columnId = activeCell?.columnId ?? firstColumnId
  if (!rowId || !columnId) return null
  const rect = root?.getBoundingClientRect()
  return {
    anchor: { x: (rect?.left ?? 0) + 8, y: (rect?.top ?? 0) + 8 },
    columnId,
    rowId,
  }
}

export function contextMenuStateFromTarget(
  target: EventTarget | null,
  anchor: BcGridContextMenuState["anchor"],
): BcGridContextMenuState | null {
  const targetElement = target instanceof Element ? target : null
  if (!targetElement) return null
  if (
    targetElement.closest("[data-bc-grid-filter-button='true']") ||
    targetElement.closest("[data-bc-grid-column-menu-button='true']")
  ) {
    return null
  }

  const columnId = targetElement.closest<HTMLElement>("[data-column-id]")?.dataset.columnId
  const rowId = targetElement.closest<HTMLElement>("[data-bc-grid-row-kind='data']")?.dataset.rowId
  if (rowId != null) {
    return {
      anchor,
      columnId,
      rowId,
    }
  }

  const header = targetElement.closest<HTMLElement>("[role='columnheader'][data-column-id]")
  // Preserve the existing header right-click column-visibility menu when
  // the trigger is present; headers without that menu fall through to
  // the grid context menu's column-only context.
  if (header?.querySelector("[data-bc-grid-column-menu-button='true']")) return null
  const headerColumnId = header?.dataset.columnId ?? columnId
  if (!headerColumnId) return null
  return {
    anchor,
    columnId: headerColumnId,
  }
}
