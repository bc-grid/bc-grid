import type { BcCellPosition, ColumnId, RowId } from "@bc-grid/core"
import type { RowEntry } from "./gridInternals"

export interface BcGridContextMenuState {
  anchor: { x: number; y: number }
  columnId?: ColumnId | undefined
  rowId: RowId
}

export function attachContextMenuEvents(
  root: HTMLElement,
  applyContextMenuState: (state: BcGridContextMenuState | null) => void,
): () => void {
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let longPressOpened = false

  const clearLongPress = () => {
    if (longPressTimer == null) return
    clearTimeout(longPressTimer)
    longPressTimer = null
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
    if (event.button !== 0 || event.pointerType === "mouse") return
    const state = contextMenuStateFromTarget(event.target, {
      x: event.clientX,
      y: event.clientY,
    })
    if (!state) return
    clearLongPress()
    longPressTimer = setTimeout(() => {
      longPressTimer = null
      longPressOpened = true
      applyContextMenuState(state)
    }, 500)
  }
  const handleClick = (event: MouseEvent) => {
    if (!longPressOpened) return
    longPressOpened = false
    event.preventDefault()
    event.stopPropagation()
  }

  root.addEventListener("contextmenu", handleContextMenu)
  root.addEventListener("pointerdown", handlePointerDown)
  root.addEventListener("pointerup", clearLongPress)
  root.addEventListener("pointercancel", clearLongPress)
  root.addEventListener("pointerleave", clearLongPress)
  root.addEventListener("click", handleClick, true)

  return () => {
    clearLongPress()
    root.removeEventListener("contextmenu", handleContextMenu)
    root.removeEventListener("pointerdown", handlePointerDown)
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

function contextMenuStateFromTarget(
  target: EventTarget | null,
  anchor: BcGridContextMenuState["anchor"],
): BcGridContextMenuState | null {
  const targetElement = target instanceof Element ? target : null
  const rowId = targetElement?.closest<HTMLElement>("[data-bc-grid-row-kind='data']")?.dataset.rowId
  if (!rowId) return null
  return {
    anchor,
    columnId: targetElement?.closest<HTMLElement>("[data-column-id]")?.dataset.columnId,
    rowId,
  }
}
