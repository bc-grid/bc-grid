import type { BcSelection, RowId } from "@bc-grid/core"
import { type CSSProperties, useCallback, useEffect, useRef } from "react"
import { clearSelection, headerCheckboxState, selectAllRows, toggleRow } from "./selection"
import type { BcReactGridColumn } from "./types"

/**
 * Synthetic ID for the pinned-left selection checkbox column. Reserved —
 * consumers must not use this columnId for their own columns. (Convention
 * mirrors `__bc_actions` from BcEditGrid.)
 */
export const SELECTION_COLUMN_ID = "__bc_select"

interface CreateSelectionColumnArgs<TRow> {
  selectionState: BcSelection
  setSelectionState: (next: BcSelection) => void
  /**
   * Currently-visible rows in display order. The header checkbox toggles
   * exactly these rows; the body checkboxes operate on the row's id.
   */
  visibleRowIds: readonly RowId[]
  /** Rows for which this returns true render a disabled checkbox. */
  rowIsDisabled?: ((row: TRow) => boolean) | undefined
}

/**
 * Build a synthetic pinned-left column that renders a master checkbox in
 * its header and a per-row checkbox in each body cell. Wired by the grid
 * when `BcGridProps.checkboxSelection` is true.
 *
 * The cellRenderer closes over the live selectionState + setter; each
 * grid render produces a fresh column with a fresh closure so the toggle
 * always operates on the current selection.
 */
export function createSelectionCheckboxColumn<TRow>(
  args: CreateSelectionColumnArgs<TRow>,
): BcReactGridColumn<TRow> {
  const { selectionState, setSelectionState, visibleRowIds, rowIsDisabled } = args
  const headerState = headerCheckboxState(selectionState, visibleRowIds)

  const handleHeaderToggle = (next: boolean): void => {
    setSelectionState(next ? selectAllRows(visibleRowIds) : clearSelection())
  }

  return {
    columnId: SELECTION_COLUMN_ID,
    header: <SelectionHeaderCheckbox state={headerState} onChange={handleHeaderToggle} />,
    pinned: "left",
    width: 44,
    sortable: false,
    resizable: false,
    filter: false,
    align: "center",
    cellRenderer(params) {
      const { rowId, rowState, row } = params
      const disabled = rowIsDisabled ? rowIsDisabled(row) : false
      const handleChange = (): void => {
        if (disabled) return
        setSelectionState(toggleRow(selectionState, rowId))
      }
      return (
        <SelectionCellCheckbox
          rowId={rowId}
          checked={rowState.selected}
          disabled={disabled}
          onChange={handleChange}
        />
      )
    },
  }
}

interface SelectionHeaderCheckboxProps {
  state: "all" | "some" | "none"
  onChange: (next: boolean) => void
}

function SelectionHeaderCheckbox({ state, onChange }: SelectionHeaderCheckboxProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  // HTML's `indeterminate` is a JS-only property — not an HTML attribute —
  // so it has to be set imperatively after mount. We sync it whenever the
  // state changes.
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = state === "some"
  }, [state])

  return (
    <input
      ref={inputRef}
      type="checkbox"
      className="bc-grid-cell-checkbox"
      data-bc-grid-selection-header="true"
      data-bc-grid-selection-state={state}
      aria-label="Select all rows on this page"
      checked={state === "all"}
      onChange={(event) => onChange(event.currentTarget.checked)}
      onClick={stopPropagation}
      onKeyDown={stopGridKeyboardNav}
      style={checkboxStyle}
    />
  )
}

interface SelectionCellCheckboxProps {
  rowId: RowId
  checked: boolean
  disabled: boolean
  onChange: () => void
}

function SelectionCellCheckbox({ rowId, checked, disabled, onChange }: SelectionCellCheckboxProps) {
  const handleChange = useCallback(() => onChange(), [onChange])
  // The wrapper fills the cell so clicks anywhere in the synthetic
  // checkbox column don't bubble to the row's selection-by-click handler.
  // Without this, a click on the cell padding (outside the input) would
  // run the existing shift/ctrl/plain selection algebra AND emit a stray
  // active-cell change for the synthetic column.
  return (
    <span
      className="bc-grid-cell-checkbox-wrap"
      data-bc-grid-selection-cell="true"
      onClick={stopPropagation}
      onKeyDown={stopGridKeyboardNav}
      style={cellWrapStyle}
    >
      <input
        type="checkbox"
        className="bc-grid-cell-checkbox"
        data-bc-grid-selection-row={rowId}
        aria-label={`Select row ${rowId}`}
        checked={checked}
        disabled={disabled}
        onChange={handleChange}
        onClick={stopPropagation}
        style={checkboxStyle}
      />
    </span>
  )
}

function stopPropagation(event: { stopPropagation: () => void }): void {
  event.stopPropagation()
}

// Keyboard activation of the checkbox uses Space (browser default); the
// grid's own keyboard handler intercepts Space for row-select-keyboard
// (Phase 5.5). We stopPropagation so the focused-checkbox Space goes to
// the input, not to the grid root.
function stopGridKeyboardNav(event: { key: string; stopPropagation: () => void }): void {
  if (event.key === " " || event.key === "Enter") event.stopPropagation()
}

const checkboxStyle: CSSProperties = {
  cursor: "pointer",
  margin: 0,
  // Sized to the conventional 16x16 a11y minimum + extra hit padding via
  // the cell's flex centering. Theming can override.
  width: 16,
  height: 16,
}

const cellWrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  // Filling the cell ensures every click on the synthetic column's cell
  // surface is captured by the wrapper, not the parent body cell.
  width: "100%",
  height: "100%",
  cursor: "pointer",
}
