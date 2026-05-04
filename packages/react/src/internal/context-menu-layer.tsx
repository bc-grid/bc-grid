import type { BcCellPosition, BcGridApi, BcRange, BcSelection, RowId } from "@bc-grid/core"
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import {
  type BcGridContextMenuState,
  attachContextMenuEvents,
  contextMenuStateFromKeyboard,
} from "../contextMenuEvents"
import type { ResolvedColumn, RowEntry } from "../gridInternals"
import { ContextMenu, ContextMenuTrigger } from "../shadcn/context-menu"
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
  const [contextMenuRootKey, setContextMenuRootKey] = useState(0)
  const radixTriggerRef = useRef<HTMLSpanElement | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
    setContextMenuRootKey((key) => key + 1)
  }, [])
  const applyContextMenuState = useCallback(
    (next: BcGridContextMenuState | null) => {
      if (!next) return
      if (typeof document !== "undefined") {
        const active = document.activeElement
        restoreFocusRef.current = active instanceof HTMLElement ? active : null
      }
      setContextMenuRootKey((key) => key + 1)
      if (next.rowId != null && next.columnId) {
        const position = { rowId: next.rowId, columnId: next.columnId }
        setActiveCell(position)
        onCellFocus?.(position)
      }
      setContextMenu(next)
    },
    [onCellFocus, setActiveCell],
  )
  const handleOpenChange = useCallback((next: boolean) => {
    if (!next) setContextMenu(null)
  }, [])
  const handleCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault()
    restoreFocusRef.current?.focus({ preventScroll: true })
    restoreFocusRef.current = null
  }, [])

  useEffect(() => {
    if (!contextMenu) return
    const trigger = radixTriggerRef.current
    if (!trigger || typeof MouseEvent === "undefined") {
      return
    }
    trigger.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: contextMenu.anchor.x,
        clientY: contextMenu.anchor.y,
      }),
    )
  }, [contextMenu])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const detachContextMenu = attachContextMenuEvents(root, applyContextMenuState)
    // `.bc-grid-viewport` is the post-layout-pass single scroll
    // container (was `.bc-grid-scroller`; hard-renamed in #415 per
    // RFC §10 Q2 ratification — no alias). Keep the legacy selector
    // as a fallback so consumers on the deprecated class through
    // their own theming overrides keep working through v0.6.
    const viewport = root.querySelector(".bc-grid-viewport, .bc-grid-scroller")
    viewport?.addEventListener("scroll", closeContextMenu)
    return () => {
      detachContextMenu()
      viewport?.removeEventListener("scroll", closeContextMenu)
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

  return (
    <ContextMenu key={contextMenuRootKey} onOpenChange={handleOpenChange}>
      <ContextMenuTrigger
        aria-hidden="true"
        ref={radixTriggerRef}
        style={hiddenContextMenuTriggerStyle}
      />
      {contextMenu ? (
        <BcGridContextMenu
          api={api}
          anchor={contextMenu.anchor}
          columnId={contextMenu.columnId}
          contextMenuItems={contextMenuItems}
          clearSelection={clearSelection}
          copyRangeToClipboard={copyRangeToClipboard}
          onClose={closeContextMenu}
          onCloseAutoFocus={handleCloseAutoFocus}
          resolvedColumns={resolvedColumns}
          rowId={contextMenu.rowId}
          rowsById={rowsById}
          selection={selection}
        />
      ) : null}
    </ContextMenu>
  )
}

export default BcGridContextMenuLayer

function isEditableKeyTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  )
}

const hiddenContextMenuTriggerStyle: CSSProperties = {
  position: "fixed",
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  overflow: "hidden",
}
