import type { BcCellPosition, BcGridApi, BcRange, BcSelection, RowId } from "@bc-grid/core"
import { type ReactNode, type RefObject, useCallback, useEffect, useState } from "react"
import {
  type BcGridContextMenuState,
  attachContextMenuEvents,
  contextMenuStateFromKeyboard,
} from "../contextMenuEvents"
import type { ResolvedColumn, RowEntry } from "../gridInternals"
import type { BcContextMenuItems } from "../types"
import { BcGridContextMenu } from "./context-menu"

export type BcGridContextMenuLayerArgs<TRow> = readonly [
  activeCell: BcCellPosition | null,
  api: BcGridApi<TRow>,
  contextMenuItems: BcContextMenuItems<TRow> | undefined,
  clearSelection: () => void,
  copyRangeToClipboard: (
    requestedRange: BcRange | undefined,
    gridApi: BcGridApi<TRow>,
    options?: { includeHeaders?: boolean },
  ) => Promise<void>,
  keyboardEnabled: boolean,
  onCellFocus: ((position: BcCellPosition) => void) | undefined,
  resolvedColumns: readonly ResolvedColumn<TRow>[],
  rowEntries: readonly RowEntry<TRow>[],
  rowsById: ReadonlyMap<RowId, RowEntry<TRow>>,
  rootRef: RefObject<HTMLDivElement | null>,
  selection: BcSelection,
  setActiveCell: (position: BcCellPosition | null) => void,
]

export interface BcGridContextMenuLayerProps<TRow> {
  args: BcGridContextMenuLayerArgs<TRow>
}

export function BcGridContextMenuLayer<TRow>({
  args,
}: BcGridContextMenuLayerProps<TRow>): ReactNode {
  const [
    activeCell,
    api,
    contextMenuItems,
    clearSelection,
    copyRangeToClipboard,
    keyboardEnabled,
    onCellFocus,
    resolvedColumns,
    rowEntries,
    rowsById,
    rootRef,
    selection,
    setActiveCell,
  ] = args
  const [contextMenu, setContextMenu] = useState<BcGridContextMenuState | null>(null)
  const closeContextMenu = useCallback(() => setContextMenu(null), [])
  const applyContextMenuState = useCallback(
    (next: BcGridContextMenuState | null) => {
      if (!next) return
      if (next.columnId) {
        const position = { rowId: next.rowId, columnId: next.columnId }
        setActiveCell(position)
        onCellFocus?.(position)
      }
      setContextMenu(next)
    },
    [onCellFocus, setActiveCell],
  )

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const detachContextMenu = attachContextMenuEvents(root, applyContextMenuState)
    const scroller = root.querySelector(".bc-grid-scroller")
    scroller?.addEventListener("scroll", closeContextMenu)
    return () => {
      detachContextMenu()
      scroller?.removeEventListener("scroll", closeContextMenu)
    }
  }, [applyContextMenuState, closeContextMenu, rootRef])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!keyboardEnabled) return
      if (!event.shiftKey || event.key !== "F10") return
      if (isEditableKeyTarget(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      applyContextMenuState(
        contextMenuStateFromKeyboard({
          activeCell,
          firstColumnId: resolvedColumns[0]?.columnId,
          root,
          rowEntries,
        }),
      )
    }
    root.addEventListener("keydown", handleKeyDown, true)
    return () => root.removeEventListener("keydown", handleKeyDown, true)
  }, [activeCell, applyContextMenuState, keyboardEnabled, resolvedColumns, rootRef, rowEntries])

  if (!contextMenu) return null

  return (
    <BcGridContextMenu
      api={api}
      anchor={contextMenu.anchor}
      columnId={contextMenu.columnId}
      contextMenuItems={contextMenuItems}
      clearSelection={clearSelection}
      copyRangeToClipboard={copyRangeToClipboard}
      onClose={closeContextMenu}
      resolvedColumns={resolvedColumns}
      rowId={contextMenu.rowId}
      rowsById={rowsById}
      selection={selection}
    />
  )
}

export default BcGridContextMenuLayer

function isEditableKeyTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  )
}
