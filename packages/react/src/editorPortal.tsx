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
  /**
   * Pixel position of the cell being edited. `null` when the active
   * editor is in-cell (audit `in-cell-editor-mode-rfc.md` §3) — the
   * portal only mounts popup-mode editors, which is when this rect is
   * load-bearing. `<BcGrid>`'s `editorCellRect` `useMemo` returns
   * `null` for in-cell editors so the DOM lookup + invalidation deps
   * only fire when a popup editor is active.
   */
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
  /**
   * Show the visible inline validation popover under the editor on
   * rejection. AT contract (assertive announce + `aria-invalid`) is
   * unchanged when this is false. Audit P1-W3 / vanilla-and-context-
   * menu RFC View → "Show validation messages" toggle.
   */
  showValidationMessages?: boolean
  /**
   * Render the F2 / Enter / Esc / Tab keyboard-hints caption at the
   * bottom of the editor portal. Off by default; opt-in via
   * `BcGridProps.showEditorKeyboardHints`.
   */
  showKeyboardHints?: boolean
  blurAction?: "commit" | "reject" | "ignore"
  escDiscardsRow?: boolean
}

/**
 * Mounts a popup-mode editor at the cell position determined by the
 * controller's state. After audit `in-cell-editor-mode-rfc.md` v0.6,
 * this component only fires when the active editor sets
 * `popup: true`; in-cell editors mount inline inside the cell DOM via
 * `bodyCells.tsx`'s `renderInCellEditor` slot. Both paths share the
 * same `<EditorMount>` component — the only difference is the wrapper
 * style (positioned overlay vs. cell-content-fill).
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
  showValidationMessages = true,
  showKeyboardHints = false,
  blurAction = "commit",
  escDiscardsRow = false,
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

  // Per `in-cell-editor-mode-rfc.md` §3: only popup-mode editors mount
  // through this overlay path. In-cell editors (`popup !== true`,
  // default) are handled by `bodyCells.tsx`'s `renderInCellEditor` slot
  // — the EditorMount renders inside the cell DOM with no positioning
  // wrapper. Returning `null` here when the active editor is in-cell
  // is what makes the portal cost (DOM lookup, useMemo invalidation
  // deps) entirely skipped for the common case.
  if (editorSpec.popup !== true) return null

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
      mountStyle="popup"
      showValidationMessages={showValidationMessages}
      showKeyboardHints={showKeyboardHints}
      blurAction={blurAction}
      escDiscardsRow={escDiscardsRow}
      editScrollOutAction="commit"
      {...(virtualizer ? { virtualizer } : {})}
      {...(typeof rowIndex === "number" ? { rowIndex } : {})}
      {...(typeof colIndex === "number" ? { colIndex } : {})}
    />
  )
}

export interface EditorMountProps<TRow> {
  controller: EditingController<TRow>
  cell: BcCellPosition
  /**
   * Pixel position of the cell. Required for popup mode (drives the
   * absolute-positioning wrapper); ignored for in-cell mode (the cell
   * already positions itself).
   */
  cellRect?: { top: number; left: number; width: number; height: number } | null
  column: ResolvedColumn<TRow>
  rowEntry: DataRowEntry<TRow>
  editor: BcCellEditor<TRow>
  /**
   * `"in-cell"` (default for non-popup editors): renders the editor
   * inline inside the cell DOM with no positioning wrapper.
   * `"popup"` (only for editors with `popup: true`): renders the
   * editor inside the overlay sibling, positioned via `cellRect`.
   * Per `in-cell-editor-mode-rfc.md` §3.
   */
  mountStyle: "in-cell" | "popup"
  /**
   * Virtualizer retention is acquired in `"popup"` mode only —
   * popup editors live outside the row's DOM and need the row+col
   * indices held alive across scroll. `"in-cell"` editors deliberately
   * skip retention so the cell DOM unmount triggers the configured
   * `editScrollOutAction` (audit RFC §5).
   */
  virtualizer?: Virtualizer
  rowIndex?: number
  colIndex?: number
  showValidationMessages: boolean
  showKeyboardHints: boolean
  blurAction: "commit" | "reject" | "ignore"
  escDiscardsRow: boolean
  /**
   * What happens to an in-flight in-cell edit when the cell unmounts
   * under it (typically from virtualizer scroll-out). Per RFC §5.
   * Ignored in popup mode (popup editors live outside the row's DOM).
   */
  editScrollOutAction: "commit" | "cancel" | "preserve"
}

export function EditorMount<TRow>({
  controller,
  cell,
  cellRect,
  column,
  rowEntry,
  editor,
  mountStyle,
  virtualizer,
  rowIndex,
  colIndex,
  showValidationMessages,
  showKeyboardHints,
  blurAction,
  escDiscardsRow,
  editScrollOutAction,
}: EditorMountProps<TRow>) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const focusRef = useRef<HTMLElement | null>(null)
  const {
    editState,
    commit,
    cancel,
    discardRowEdits,
    dispatchMounted,
    dispatchUnmounted,
    getOverlayValue,
    getEditMode,
  } = controller

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

  // Stable ref so the scroll-out cleanup branch picks up the latest
  // editor's tag-dispatch / getValue contract instead of the closure
  // captured at mount.
  const editorRef = useRef(editor)
  editorRef.current = editor
  // Stable ref for handleCommit / cancel so the cleanup-time
  // scroll-out path runs the latest closures, not the mount-time
  // ones (the controller's commit closure may have re-bound on each
  // render due to rowEntry / column changes).
  const scrollOutCommitRef = useRef<
    | ((opts: {
        rowId: BcCellPosition["rowId"]
        row: TRow
        columnId: BcCellPosition["columnId"]
        column: typeof column.source
        value: unknown
        previousValue: unknown
      }) => void)
    | null
  >(null)
  const scrollOutCancelRef = useRef(cancel)
  scrollOutCancelRef.current = cancel

  // Move DOM focus to the editor's `focusRef` after mount, then dispatch
  // `mounted` to advance the state machine to Editing. Cleanup releases
  // the focus back to the grid root via `unmounted`.
  //
  // Retention contract per `editing-rfc §Virtualizer retention contract`
  // is acquired in `"popup"` mount style ONLY. In-cell editors
  // deliberately skip retention so the cell's natural unmount on
  // virtualizer scroll-out triggers the configured
  // `editScrollOutAction` (audit `in-cell-editor-mode-rfc.md` §5).
  useLayoutEffect(() => {
    focusRef.current?.focus({ preventScroll: true })
    dispatchMounted()
    const handles: InFlightHandle[] = []
    if (mountStyle === "popup" && virtualizer && typeof rowIndex === "number" && rowIndex >= 0) {
      handles.push(virtualizer.beginInFlightRow(rowIndex))
    }
    if (mountStyle === "popup" && virtualizer && typeof colIndex === "number" && colIndex >= 0) {
      handles.push(virtualizer.beginInFlightCol(colIndex))
    }
    return () => {
      for (const handle of handles) handle.release()

      // Scroll-out detection (in-cell mode only). Per RFC §5: if the
      // controller is still in an editing-active mode at cleanup
      // time, the cell unmounted under an in-flight edit (the
      // virtualizer dropped the row from its render window). For an
      // intentional unmount (commit / cancel / discardRow), the
      // controller will already be in `committing` / `cancelling`
      // / `unmounting` so this branch is skipped. `getEditMode()`
      // reads the live mode from the controller's ref — captured
      // closures here would see stale state.
      if (mountStyle === "in-cell") {
        const liveMode = getEditMode()
        const inFlight =
          liveMode === "editing" || liveMode === "mounting" || liveMode === "validating"
        if (inFlight) {
          if (editScrollOutAction === "cancel") {
            scrollOutCancelRef.current?.()
          } else {
            // Default + "preserve" both fall through to commit for
            // v0.6.0; "preserve" (auto-promote-to-popup-mid-edit)
            // is reserved for v0.7 per RFC.
            const commitFn = scrollOutCommitRef.current
            if (commitFn) {
              const value = readEditorInputValue(
                focusRef.current,
                editorRef.current as BcCellEditor<unknown>,
              )
              commitFn({
                rowId: cell.rowId,
                row: rowEntry.row,
                columnId: cell.columnId,
                column: column.source,
                value,
                previousValue: initialValue,
              })
            }
          }
        }
      }

      dispatchUnmounted()
    }
  }, [
    dispatchMounted,
    dispatchUnmounted,
    virtualizer,
    rowIndex,
    colIndex,
    mountStyle,
    editScrollOutAction,
    getEditMode,
    cell.rowId,
    cell.columnId,
    rowEntry.row,
    column.source,
    initialValue,
  ])

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
  // Bind the scroll-out commit ref to the live commit closure so the
  // useLayoutEffect cleanup can fire `commit({...source: "scroll-out"})`
  // without re-binding the cleanup on every render. `"stay"` move
  // semantics — the user scrolled away; we shouldn't tug the active
  // cell to a new position they didn't ask for.
  scrollOutCommitRef.current = (opts) => {
    void commit({ ...opts, source: "scroll-out" }, "stay")
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
  // Same stable-ref pattern for cancel — used by the blurAction
  // `"reject"` path.
  const cancelRef = useRef(cancel)
  cancelRef.current = cancel

  // Portal-aware click-outside per `editing-rfc §Portal click-outside rules`.
  // Pointerdown anywhere outside the editor or any descendant marked
  // `data-bc-grid-editor-root` / `data-bc-grid-editor-portal` commits
  // the current value with `stay` move semantics — the user picked the
  // outside target, so don't drift the active cell on top of that.
  // Clicks on the editor's wrapper or on portaled popovers (date/select/
  // autocomplete) are ignored — the editor still has focus.
  //
  // The `blurAction` prop chooses what click-outside means:
  //   - `"commit"` (default): commit the current value (today's behaviour).
  //   - `"reject"`: cancel the edit (mirror Escape) — for forms-style
  //     ERPs that want explicit Tab/Enter commit and treat blur as cancel.
  //   - `"ignore"`: do nothing — for high-stakes edits where accidental
  //     commits would be costly.
  // Stable ref so the listener bound at mount sees the latest value
  // without re-binding (each new prop value would race with mid-edit
  // state churn).
  const blurActionRef = useRef(blurAction)
  blurActionRef.current = blurAction
  useEffect(() => {
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest("[data-bc-grid-editor-root], [data-bc-grid-editor-portal]")) return
      const action = blurActionRef.current
      if (action === "ignore") return
      if (action === "reject") {
        cancelRef.current?.()
        return
      }
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
      // `escDiscardsRow` (audit P1-W3-3 follow-up to #381): in
      // BcEditGrid (or any consumer that opts in), Esc rolls back
      // the row's prior overlay patches in addition to cancelling
      // the active editor. `discardRowEdits` already handles the
      // active-editor cancel internally when its target row matches
      // the editing row (which it always does here, since the
      // editor portal mounted for a cell on this row). So we call
      // discardRowEdits OR cancel — never both, to avoid a double
      // dispatch (the state machine absorbs the second event but
      // the redundant work is silly).
      if (escDiscardsRow) {
        discardRowEdits(cell.rowId)
      } else {
        cancel()
      }
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

  // Wrapper style branches on mount style. Popup mode keeps the
  // absolute-positioning overlay anchored to `cellRect` (rendered as a
  // sibling to the body row container in `grid.tsx`). In-cell mode
  // drops the positioning entirely — the cell is the wrapper's
  // containing block, and the cell already owns its position via the
  // virtualizer's row + col offsets. The validation popover (a child
  // of this wrapper) anchors against the wrapper's own positioning,
  // so in-cell mode sets `position: relative` to keep the popover's
  // `position: absolute` math anchored to the cell box. Per
  // `in-cell-editor-mode-rfc.md` §3.
  const wrapperStyle: CSSProperties =
    mountStyle === "popup" && cellRect ? popupWrapperStyle(cellRect) : inCellWrapperStyle()

  const wrapperEditState = editorStateAttribute({ error, pending })
  return (
    <div
      ref={wrapperRef}
      className={mountStyle === "popup" ? "bc-grid-editor-portal" : "bc-grid-editor-in-cell"}
      data-bc-grid-editor-root="true"
      data-bc-grid-editor-mount={mountStyle}
      data-bc-grid-edit-state={wrapperEditState}
      // Legacy alias from v0.5; preserved for one release. Removal
      // scheduled for v0.7. Per `docs/migration/v0.6.md` (planning
      // doc §4 visual contract consolidation).
      data-bc-grid-editor-state={wrapperEditState}
      onKeyDown={handleKeyDown}
      style={wrapperStyle}
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
      {showValidationMessages ? <EditorValidationPopover error={error} /> : null}
      {showKeyboardHints ? <EditorKeyboardHints /> : null}
    </div>
  )
}

/**
 * Subtle keyboard-hints caption rendered at the bottom of the editor
 * portal when the consumer opts in via
 * `BcGridProps.showEditorKeyboardHints`. Off by default; intended for
 * teams onboarding new ERP users to the bc-grid edit model. The
 * caption is `aria-hidden` because the AT contract is already covered
 * by the input's ARIA role + `aria-keyshortcuts` would be the right
 * AT path (followup) — this surface exists for sighted discovery
 * only.
 */
export function EditorKeyboardHints(): ReactNode {
  return (
    <div
      className="bc-grid-editor-keyboard-hints"
      data-bc-grid-editor-keyboard-hints="true"
      aria-hidden="true"
    >
      <kbd>F2</kbd> edit · <kbd>Enter</kbd> commit · <kbd>Esc</kbd> cancel · <kbd>Tab</kbd> next
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

function popupWrapperStyle(rect: {
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
 * Wrapper style for in-cell editor mounts. The cell itself is
 * absolutely positioned by the virtualizer; the in-cell wrapper just
 * needs to fill its containing block and provide a positioning
 * context for the validation popover (which is `position: absolute`
 * anchored to the wrapper). No coordinates needed — the cell already
 * owns its on-screen position. Per `in-cell-editor-mode-rfc.md` §3.
 */
function inCellWrapperStyle(): CSSProperties {
  return {
    position: "relative",
    width: "100%",
    height: "100%",
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
      data-bc-grid-edit-state={editorStateAttribute({ error, pending })}
      // Legacy alias from v0.5; preserved for one release.
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
