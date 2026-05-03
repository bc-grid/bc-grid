import type { ReactNode } from "react"
import { classNames, defaultMessages } from "./gridInternals"
import type { BcActionsColumnProps, BcEditGridAction, BcGridColumn } from "./types"

/**
 * Shared actions-column factory used by both `<BcEditGrid>` and
 * `<BcServerGrid>` (when actions props are wired). Lifted out of
 * `editGrid.tsx` 2026-05-03 so server grids can present the same
 * row-action affordances without forcing consumers to hand-roll the
 * column. Per `v06-server-grid-actions-column` (bsncraft P1).
 *
 * The column id is fixed at `__bc_actions`; pinned right; not
 * sortable / filterable / groupable / column-menu-able / editable.
 * The cell renderer composes Edit / Delete / Discard built-ins
 * (gated by which handler the consumer wired) followed by any
 * `extraActions`.
 *
 * Destructive actions (Delete + any extra with `destructive: true`)
 * disable while the row has any in-flight commit per
 * `editing-rfc §Server commit + optimistic UI`. Non-destructive
 * actions (Edit, custom extras) stay enabled — re-edit is always
 * allowed.
 */
export interface CreateActionsColumnOptions<TRow> {
  canDelete: ((row: TRow) => boolean) | undefined
  canEdit: ((row: TRow) => boolean) | undefined
  deleteLabel: string
  discardLabel: string
  editLabel: string
  extraActions: BcEditGridAction<TRow>[] | ((row: TRow) => BcEditGridAction<TRow>[]) | undefined
  onDelete: ((row: TRow) => void) | undefined
  onDiscardRowEdits: ((rowId: string, row: TRow) => void) | undefined
  onEdit: ((row: TRow) => void) | undefined
}

// `BcActionsColumnProps` is defined in `./types.ts` so consumers can
// reference it from the public surface (re-exported via the
// `@bc-grid/react` index). Lives in types.ts to avoid a circular
// import: this module imports `BcEditGridAction` + `BcGridColumn`
// from types, so types can't also import a type defined here.

/**
 * `true` when at least one actions handler is wired AND `hideActions`
 * is not opt-out. Mirrors the gate `<BcEditGrid>` has used since v0.4
 * — keeping the predicate centralised so the server-grid wrapper
 * applies the same rule. Per `v06-server-grid-actions-column`.
 */
export function shouldRenderActionsColumn<TRow>(props: BcActionsColumnProps<TRow>): boolean {
  if (props.hideActions === true) return false
  return Boolean(props.onEdit || props.onDelete || props.onDiscardRowEdits || props.extraActions)
}

export function createActionsColumn<TRow>(
  options: CreateActionsColumnOptions<TRow>,
): BcGridColumn<TRow> {
  return {
    columnId: "__bc_actions",
    header: defaultMessages.actionColumnLabel,
    align: "center",
    pinned: "right",
    width: 180,
    filter: false,
    sortable: false,
    resizable: false,
    columnMenu: false,
    groupable: false,
    editable: false,
    cellClassName: "bc-grid-actions-cell",
    cellRenderer(params): ReactNode {
      const actions: BcEditGridAction<TRow>[] = []
      if (options.onEdit) {
        actions.push({
          label: options.editLabel,
          onSelect: options.onEdit,
          disabled: options.canEdit ? !options.canEdit(params.row) : false,
        })
      }
      if (options.onDelete) {
        actions.push({
          label: options.deleteLabel,
          onSelect: options.onDelete,
          destructive: true,
          disabled: options.canDelete ? !options.canDelete(params.row) : false,
        })
      }
      // Row-level multi-cell discard (audit P1-W3-3). Surfaced only
      // when the consumer wired `onDiscardRowEdits` AND the row
      // actually has uncommitted edits to roll back. The handler
      // typically forwards to `apiRef.current?.discardRowEdits(rowId)`.
      if (options.onDiscardRowEdits && params.rowState.dirty === true) {
        const discardHandler = options.onDiscardRowEdits
        actions.push({
          label: options.discardLabel,
          onSelect: (row) => discardHandler(params.rowState.rowId, row),
        })
      }
      const extra =
        typeof options.extraActions === "function"
          ? options.extraActions(params.row)
          : (options.extraActions ?? [])

      // Disable destructive actions while the row has any in-flight
      // commit. Non-destructive actions (Edit, custom extras) stay
      // enabled — re-edit is always allowed. Per
      // `editing-rfc §Server commit + optimistic UI`.
      const rowPending = params.rowState.pending === true
      return (
        <div className="bc-grid-actions">
          {[...actions, ...extra].map((action) => (
            <button
              key={action.label}
              type="button"
              className={classNames(
                "bc-grid-action",
                action.destructive ? "bc-grid-action-destructive" : undefined,
              )}
              data-bc-grid-action="true"
              data-variant={action.destructive ? "destructive" : "default"}
              disabled={
                params.rowState.disabled ||
                (rowPending && action.destructive === true) ||
                isActionDisabled(action, params.row)
              }
              onClick={(event) => {
                event.stopPropagation()
                action.onSelect(params.row)
              }}
            >
              {action.icon ? <action.icon className="bc-grid-action-icon" /> : null}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )
    },
  }
}

function isActionDisabled<TRow>(action: BcEditGridAction<TRow>, row: TRow): boolean {
  return typeof action.disabled === "function" ? action.disabled(row) : (action.disabled ?? false)
}
