import type { BcCellPosition } from "@bc-grid/core"
import type { InFlightHandle, Virtualizer } from "@bc-grid/virtualizer"
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
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

  // The column type widens `cellEditor` to `BcCellEditor<TRow> | BcCellEditor<unknown>`
  // so consumers can drop in the row-agnostic built-in editors (textEditor,
  // numberEditor, etc., declared with TRow=unknown) without casting at every
  // column site. Cast back to `BcCellEditor<TRow>` here: at runtime props.row
  // is the actual TRow regardless of which arm we pulled, and the editor that
  // declared TRow=unknown structurally treats it as unknown anyway. Safe.
  const editorSpec = (column.source.cellEditor ?? defaultEditor) as BcCellEditor<TRow> | undefined
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
      const value = readEditorInputValue(focusRef.current, editor as BcCellEditor<unknown>)
      handleCommitRef.current?.(value, "stay", "pointer")
    }
    document.addEventListener("pointerdown", handlePointerDown, true)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true)
    }
  }, [editor])

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
      const value = readEditorInputValue(focusRef.current, editor as BcCellEditor<unknown>)
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
    seedKey?: string
    pointerHint?: { x: number; y: number }
    prepareResult?: unknown
    pending?: boolean
    required?: boolean
    readOnly?: boolean
    disabled?: boolean
  }>

  // Resolve column-level ARIA states once per render so default
  // editors can stamp `aria-required` / `aria-readonly` /
  // `aria-disabled` without re-reading the column themselves.
  // Audit P1-W3-7. `readOnly` is currently always false here — the
  // grid only mounts editors on cells where `editable` resolves to
  // true. The prop stays in the contract for future "edit a cell
  // with read-only sub-fields" use cases.
  const requiredFlag = resolveColumnRequired(column.source.required, rowEntry.row)
  const disabledFlag = pending

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
        {...(seedKey != null ? { seedKey } : {})}
        {...(pointerHint ? { pointerHint } : {})}
        {...(prepareResult !== undefined ? { prepareResult } : {})}
        {...(error != null ? { error } : {})}
        {...(pending ? { pending } : {})}
        {...(requiredFlag ? { required: true } : {})}
        {...(disabledFlag ? { disabled: true } : {})}
      />
      <EditorValidationPopover error={error} />
    </div>
  )
}

/**
 * Resolve `column.required` (boolean | row-fn) against the row.
 * Defaults to `false` so editors don't stamp `aria-required` on
 * inputs whose column never declared it. Audit P1-W3-7.
 */
function resolveColumnRequired<TRow>(
  required: boolean | ((row: TRow) => boolean) | undefined,
  row: TRow,
): boolean {
  if (typeof required === "function") return required(row)
  return required === true
}

/**
 * Visible validation surface anchored below the editor input. Audit
 * P0 #1 (`docs/coordination/audit-2026-05/worker3-findings.md`):
 * before this, the `error` string lived only in a visually-hidden
 * `<span>` referenced via `aria-describedby`. Sighted users got a red
 * border and nothing else — they could not learn *why* the value was
 * rejected, which broke any Tab-driven entry workflow with 80+ rows.
 *
 * Rendered as an inline popover positioned below the cell. Marked
 * `aria-hidden="true"` because the editor's existing visually-hidden
 * span (linked by `aria-describedby`) plus the controller's assertive
 * live-region announce already cover the AT path; we don't want
 * double-announcement on every keystroke that re-runs validation.
 *
 * Lives inside `data-bc-grid-editor-root`, so the document-level
 * pointerdown click-outside handler treats clicks on it as
 * "still in the editor" and does not commit-and-dismiss.
 */
export function EditorValidationPopover({ error }: { error?: string | undefined }): ReactNode {
  if (!error) return null
  return (
    <div
      className="bc-grid-editor-error-popover"
      data-bc-grid-editor-error-popover="true"
      aria-hidden="true"
    >
      {error}
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
}

function DefaultTextEditor({
  initialValue,
  focusRef,
  seedKey,
  error,
  pending,
}: DefaultTextEditorProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
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

  return (
    <input
      ref={inputRef}
      className="bc-grid-editor-input"
      type="text"
      defaultValue={seeded}
      disabled={pending}
      aria-invalid={error ? true : undefined}
      data-bc-grid-editor-input="true"
      data-bc-grid-editor-kind="text-default"
      data-bc-grid-editor-state={editorStateAttribute({ error, pending })}
    />
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

/**
 * Locate the currently-mounted editor input element inside the supplied
 * root (typically the grid's `rootRef.current`). The editor chrome stamps
 * `data-bc-grid-editor-input="true"` on the active input/select/textarea
 * regardless of editor kind, so `commitEdit()` can read the value through
 * the public API surface without needing access to `EditorMount`'s
 * private focusRef. Returns `null` when no editor is mounted; the api
 * method falls through to a no-op in that case.
 *
 * Audit P0-7. Pure DOM traversal; SSR-safe (returns `null` for `null` root).
 */
export function findActiveEditorInput(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null
  return root.querySelector<HTMLElement>("[data-bc-grid-editor-input='true']")
}

export function readEditorInputValue(
  focusRefCurrent: HTMLElement | null,
  editor?: BcCellEditor<unknown> | undefined,
): unknown {
  // Custom-editor escape hatch (audit P1-W3-6). Editors that don't
  // expose a standard `<input>` / `<select>` / `<textarea>` / shadcn
  // Combobox `<button>` via `focusRef` (e.g. a `<div role="combobox">`,
  // a popover-anchored editor whose focused element is some other
  // tag, a typed wrapper holding its value in module state) supply
  // `getValue?` on their `BcCellEditor` spec. We call it first; if
  // it returns `undefined` we fall through to the built-in
  // tag-dispatch path so consumers can opt-in selectively.
  if (editor?.getValue) {
    const custom = editor.getValue(focusRefCurrent)
    if (custom !== undefined) return custom
  }
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
  if (tagName === "BUTTON") {
    // shadcn-native Combobox primitive (audit P0-4 / synthesis P0-4).
    // The combobox stashes its typed value on the trigger button via
    // `__bcGridComboboxValue` so click-outside / Tab commit can read
    // it without going through `column.valueParser`. Mirrors the
    // `__bcGridSelectOptionValues` contract above.
    const button = focusRefCurrent as BcGridComboboxButton
    return button[bcGridComboboxValueKey]
  }
  return undefined
}

const bcGridSelectOptionValuesKey = "__bcGridSelectOptionValues" as const

type BcGridSelectElement = HTMLSelectElement & {
  [bcGridSelectOptionValuesKey]?: readonly unknown[]
}

const bcGridComboboxValueKey = "__bcGridComboboxValue" as const

type BcGridComboboxButton = HTMLButtonElement & {
  [bcGridComboboxValueKey]?: unknown
}
