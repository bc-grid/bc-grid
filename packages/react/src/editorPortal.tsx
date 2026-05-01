import type { BcCellPosition } from "@bc-grid/core"
import type { InFlightHandle, Virtualizer } from "@bc-grid/virtualizer"
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from "react"
import type { MoveOnSettle } from "./editingStateMachine"
import { getEditorEditModeKeyboardIntent } from "./editorKeyboard"
import type { DataRowEntry, ResolvedColumn } from "./gridInternals"
import type { BcCellEditor } from "./types"
import type { EditingController } from "./useEditingController"

interface EditorPortalProps<TRow> {
  controller: EditingController<TRow>
  /** Resolved cell position; null when not editing. */
  activeCell: BcCellPosition | null
  /** Current row entries (for resolving the row from an active cell). */
  rowEntries: readonly DataRowEntry<TRow>[]
  /** Resolved columns (for resolving the column from a columnId). */
  resolvedColumns: readonly ResolvedColumn<TRow>[]
  /** Pixel position of the cell being edited. */
  cellRect: { top: number; left: number; width: number; height: number } | null
  /**
   * Virtualizer + index lookup for in-flight retention while editing.
   * The editor portal acquires `beginInFlightRow(rowIndex) +
   * beginInFlightCol(colIndex)` on mount so scroll / sort / filter
   * during edit doesn't unmount the editor element. Released on
   * unmount via the InFlightHandle pair. Per
   * `editing-rfc §Virtualizer retention contract`.
   */
  virtualizer?: Virtualizer
  rowIndexById?: Map<BcCellPosition["rowId"], number>
  columnIndexById?: Map<BcCellPosition["columnId"], number>
  /**
   * Default editor used when a column doesn't supply its own
   * `cellEditor`. v0.1 default is a text input.
   */
  defaultEditor?: BcCellEditor<TRow>
}

/**
 * Mounts the active editor at the cell position determined by the
 * controller's state. Handles:
 *   - Real DOM focus shift to `focusRef`
 *   - Tab / Shift+Tab / Enter / Shift+Enter / Escape interception
 *   - Lifecycle dispatch (`mounted` / `unmounted`)
 *
 * Defers actual input rendering to `column.cellEditor.Component` (or
 * `defaultEditor.Component` when the column doesn't supply one).
 */
export function EditorPortal<TRow>({
  controller,
  activeCell,
  rowEntries,
  resolvedColumns,
  cellRect,
  virtualizer,
  rowIndexById,
  columnIndexById,
  defaultEditor,
}: EditorPortalProps<TRow>): ReactNode {
  const { editState } = controller

  // The editor's DOM lives only through Mounting / Editing / Validating.
  // Once the state machine reaches Committing or Cancelling, we unmount
  // so the useLayoutEffect cleanup dispatches `unmounted` and the
  // machine advances to Unmounting → Navigation.
  if (
    editState.mode !== "mounting" &&
    editState.mode !== "editing" &&
    editState.mode !== "validating"
  ) {
    return null
  }
  if (!activeCell || !cellRect) return null

  const rowEntry = rowEntries.find((entry) => entry.rowId === activeCell.rowId)
  const column = resolvedColumns.find((c) => c.columnId === activeCell.columnId)
  if (!rowEntry || !column) return null

  const editorSpec: BcCellEditor<TRow> | undefined = column.source.cellEditor ?? defaultEditor
  if (!editorSpec) return null

  // Resolve indices for in-flight retention. If the lookup maps weren't
  // supplied, retention is a no-op — the editor still works for the
  // common case where the row + column are inside the viewport, but
  // scrolling them out mid-edit will unmount the editor.
  const rowIndex = rowIndexById?.get(activeCell.rowId)
  const colIndex = columnIndexById?.get(activeCell.columnId)

  return (
    <EditorMount
      controller={controller}
      cell={activeCell}
      cellRect={cellRect}
      column={column}
      rowEntry={rowEntry}
      editor={editorSpec}
      {...(virtualizer ? { virtualizer } : {})}
      {...(typeof rowIndex === "number" ? { rowIndex } : {})}
      {...(typeof colIndex === "number" ? { colIndex } : {})}
    />
  )
}

interface EditorMountProps<TRow> {
  controller: EditingController<TRow>
  cell: BcCellPosition
  cellRect: { top: number; left: number; width: number; height: number }
  column: ResolvedColumn<TRow>
  rowEntry: DataRowEntry<TRow>
  editor: BcCellEditor<TRow>
  virtualizer?: Virtualizer
  rowIndex?: number
  colIndex?: number
}

function EditorMount<TRow>({
  controller,
  cell,
  cellRect,
  column,
  rowEntry,
  editor,
  virtualizer,
  rowIndex,
  colIndex,
}: EditorMountProps<TRow>) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const focusRef = useRef<HTMLElement | null>(null)
  const { editState, commit, cancel, dispatchMounted, dispatchUnmounted, getOverlayValue } =
    controller

  // editState is narrowed to Mounting / Editing / Validating here.
  const seedKey =
    editState.mode === "mounting" || editState.mode === "editing" ? editState.seedKey : undefined
  const pointerHint =
    editState.mode === "mounting" || editState.mode === "editing"
      ? editState.pointerHint
      : undefined
  const prepareResult =
    editState.mode === "mounting" || editState.mode === "editing"
      ? editState.prepareResult
      : undefined
  const error = editState.mode === "editing" ? editState.error : undefined
  const pending = editState.mode === "validating"
  const validationMessageId = useId()

  // Initial value for the editor. Read from the overlay first (so a
  // re-edit of a previously-committed cell keeps the latest value), else
  // raw row[field].
  const overlayValue = getOverlayValue(cell.rowId, cell.columnId)
  const initialValue =
    overlayValue !== undefined
      ? overlayValue
      : column.source.field
        ? (rowEntry.row as Record<string, unknown>)[column.source.field]
        : undefined

  // Move DOM focus to the editor's `focusRef` after mount, then dispatch
  // `mounted` to advance the state machine to Editing. Cleanup releases
  // the focus back to the grid root via `unmounted`.
  //
  // Per `editing-rfc §Virtualizer retention contract`, also acquire
  // row + column retention so scroll / sort / filter during edit doesn't
  // unmount the editor's DOM. The retained row + col are held until
  // either handle is released.
  useLayoutEffect(() => {
    focusRef.current?.focus({ preventScroll: true })
    dispatchMounted()
    const handles: InFlightHandle[] = []
    if (virtualizer && typeof rowIndex === "number" && rowIndex >= 0) {
      handles.push(virtualizer.beginInFlightRow(rowIndex))
    }
    if (virtualizer && typeof colIndex === "number" && colIndex >= 0) {
      handles.push(virtualizer.beginInFlightCol(colIndex))
    }
    return () => {
      for (const handle of handles) handle.release()
      dispatchUnmounted()
    }
  }, [dispatchMounted, dispatchUnmounted, virtualizer, rowIndex, colIndex])

  const handleCommit = (
    newValue: unknown,
    moveOnSettle: MoveOnSettle = "down",
    source: "keyboard" | "pointer" | "api" = "keyboard",
  ) => {
    void commit(
      {
        rowId: cell.rowId,
        row: rowEntry.row,
        columnId: cell.columnId,
        column: column.source,
        value: newValue,
        previousValue: initialValue,
        source,
      },
      moveOnSettle,
    )
  }
  // Stable ref to handleCommit so the document-level pointerdown
  // listener can invoke the latest closure without re-binding the
  // handler on every render (re-binding would race with mid-edit
  // state churn).
  const handleCommitRef =
    useRef<(value: unknown, move: MoveOnSettle, source: "keyboard" | "pointer" | "api") => void>(
      handleCommit,
    )
  handleCommitRef.current = handleCommit

  // Portal-aware click-outside per `editing-rfc §Portal click-outside rules`.
  // Pointerdown anywhere outside the editor or any descendant marked
  // `data-bc-grid-editor-root` / `data-bc-grid-editor-portal` commits
  // the current value with `stay` move semantics — the user picked the
  // outside target, so don't drift the active cell on top of that.
  // Clicks on the editor's wrapper or on portaled popovers (date/select/
  // autocomplete) are ignored — the editor still has focus.
  useEffect(() => {
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest("[data-bc-grid-editor-root], [data-bc-grid-editor-portal]")) return
      const value = readEditorInputValue(focusRef.current)
      handleCommitRef.current?.(value, "stay", "pointer")
    }
    document.addEventListener("pointerdown", handlePointerDown, true)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true)
    }
  }, [])

  // Wrapper-level keyboard intercepts. The editor input handles printable
  // keys / arrow keys / Backspace via browser default; only the Q1
  // commit/cancel keys are intercepted here. Per editing-rfc §Keyboard
  // model in edit mode.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const intent = getEditorEditModeKeyboardIntent({
      key: event.key,
      shiftKey: event.shiftKey,
    })
    if (intent.type === "commit") {
      event.preventDefault()
      const value = readEditorInputValue(focusRef.current)
      handleCommit(value, intent.moveOnSettle, "keyboard")
      return
    }
    if (intent.type === "cancel") {
      event.preventDefault()
      cancel()
      return
    }
  }

  const Component = editor.Component as React.ComponentType<{
    initialValue: unknown
    row: TRow
    rowId: typeof cell.rowId
    column: typeof column.source
    commit: (next: unknown, opts?: { moveOnSettle?: MoveOnSettle }) => void
    cancel: () => void
    error?: string
    focusRef?: RefObject<HTMLElement | null>
    validationMessageId?: string
    seedKey?: string
    pointerHint?: { x: number; y: number }
    prepareResult?: unknown
    pending?: boolean
  }>

  return (
    <div
      ref={wrapperRef}
      className="bc-grid-editor-portal"
      data-bc-grid-editor-root="true"
      data-bc-grid-editor-state={editorStateAttribute({ error, pending })}
      onKeyDown={handleKeyDown}
      style={editorWrapperStyle(cellRect)}
    >
      <Component
        initialValue={initialValue}
        row={rowEntry.row}
        rowId={cell.rowId}
        column={column.source}
        commit={(next, opts) => handleCommit(next, opts?.moveOnSettle ?? "down", "keyboard")}
        cancel={cancel}
        focusRef={focusRef}
        validationMessageId={validationMessageId}
        {...(seedKey != null ? { seedKey } : {})}
        {...(pointerHint ? { pointerHint } : {})}
        {...(prepareResult !== undefined ? { prepareResult } : {})}
        {...(error != null ? { error } : {})}
        {...(pending ? { pending } : {})}
      />
      {error ? (
        <div
          id={validationMessageId}
          className="bc-grid-editor-validation"
          data-bc-grid-editor-validation="true"
        >
          {error}
        </div>
      ) : null}
    </div>
  )
}

function editorWrapperStyle(rect: {
  top: number
  left: number
  width: number
  height: number
}): CSSProperties {
  return {
    position: "absolute",
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    zIndex: 5,
  }
}

/**
 * Default text editor used when a column doesn't supply its own
 * `cellEditor`. Renders a single `<input>` whose value is committed on
 * the grid's commit-keys (Enter / Tab / Esc). Dedicated `editor-text`
 * task will replace this with a full shadcn `Input` integration.
 */
export const defaultTextEditor: BcCellEditor<unknown> = {
  Component: DefaultTextEditor,
  kind: "text-default",
}

interface DefaultTextEditorProps {
  initialValue: unknown
  commit: (next: unknown) => void
  cancel: () => void
  focusRef?: RefObject<HTMLElement | null>
  seedKey?: string
  error?: string
  pending?: boolean
  validationMessageId?: string
}

function DefaultTextEditor({
  initialValue,
  focusRef,
  seedKey,
  error,
  pending,
  validationMessageId,
}: DefaultTextEditorProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const localErrorId = useId()
  // Hand the focusRef back up to the controller — it's the element the
  // grid will focus after mount.
  useEffect(() => {
    if (focusRef && inputRef.current) {
      ;(focusRef as { current: HTMLElement | null }).current = inputRef.current
    }
  }, [focusRef])

  // Seed value: if activated by typing a printable char, replace content
  // with that char; else default to the formatted current value. Native
  // input maintains its own state from this point.
  const seeded = seedKey != null ? seedKey : initialValue == null ? "" : String(initialValue)
  const describedBy = error ? (validationMessageId ?? localErrorId) : undefined

  return (
    <>
      <input
        ref={inputRef}
        className="bc-grid-editor-input"
        type="text"
        defaultValue={seeded}
        disabled={pending}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        data-bc-grid-editor-input="true"
        data-bc-grid-editor-kind="text-default"
        data-bc-grid-editor-state={editorStateAttribute({ error, pending })}
      />
      {error && !validationMessageId ? (
        <span id={localErrorId} style={visuallyHiddenEditorErrorStyle}>
          {error}
        </span>
      ) : null}
    </>
  )
}

function editorStateAttribute({
  error,
  pending,
}: {
  error?: string | undefined
  pending?: boolean | undefined
}): "idle" | "pending" | "error" {
  if (pending) return "pending"
  if (error) return "error"
  return "idle"
}

export function readEditorInputValue(focusRefCurrent: HTMLElement | null): unknown {
  const tagName = focusRefCurrent?.tagName.toUpperCase()
  if (tagName === "INPUT") {
    const input = focusRefCurrent as HTMLInputElement
    return input.type === "checkbox" ? input.checked : input.value
  }
  if (tagName === "TEXTAREA") return (focusRefCurrent as HTMLTextAreaElement).value
  if (tagName === "SELECT") {
    const select = focusRefCurrent as HTMLSelectElement
    const typedValues = (select as BcGridSelectElement)[bcGridSelectOptionValuesKey]
    if (select.multiple) {
      // Per `editing-rfc §editor-multi-select`: iterate every selected
      // option and map each to the typed value via the option-keyed
      // lookup that the editor populated. Returning a typed array bypasses
      // `column.valueParser` (typed editor) — same contract as `select`.
      const selectedOptions = Array.from(select.selectedOptions)
      if (typedValues) {
        return selectedOptions.map((option) => {
          const idx = option.index
          return idx >= 0 && idx < typedValues.length ? typedValues[idx] : option.value
        })
      }
      return selectedOptions.map((option) => option.value)
    }
    const selectedIndex = select.selectedIndex
    if (typedValues && selectedIndex >= 0 && selectedIndex < typedValues.length) {
      return typedValues[selectedIndex]
    }
    return select.value
  }
  return undefined
}

const bcGridSelectOptionValuesKey = "__bcGridSelectOptionValues" as const

type BcGridSelectElement = HTMLSelectElement & {
  [bcGridSelectOptionValuesKey]?: readonly unknown[]
}

const visuallyHiddenEditorErrorStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
}
