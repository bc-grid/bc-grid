import { type ReactNode, useMemo } from "react"
import { BcGrid } from "./grid"
import { classNames, defaultMessages } from "./gridInternals"
import type { BcEditGridAction, BcEditGridProps, BcGridColumn } from "./types"

export function BcEditGrid<TRow>(props: BcEditGridProps<TRow>): ReactNode {
  const {
    columns,
    detailPath,
    linkField,
    hideActions,
    onEdit,
    onDelete,
    onDiscardRowEdits,
    canEdit,
    canDelete,
    extraActions,
    editLabel = defaultMessages.editLabel,
    deleteLabel = defaultMessages.deleteLabel,
    discardLabel = defaultMessages.discardLabel,
  } = props

  const editColumns = useMemo(() => {
    const nextColumns = columns.map((column) => {
      if (!detailPath || !linkField || column.field !== linkField) return column
      return {
        ...column,
        cellRenderer(params) {
          const href = `${detailPath}/${encodeURIComponent(params.rowId)}`
          return (
            <a className="bc-grid-link" href={href}>
              {params.formattedValue}
            </a>
          )
        },
      } satisfies BcGridColumn<TRow>
    })

    const hasActions = Boolean(onEdit || onDelete || onDiscardRowEdits || extraActions)
    if (hideActions || !hasActions) return nextColumns

    return [
      ...nextColumns,
      createActionsColumn({
        canDelete,
        canEdit,
        deleteLabel,
        discardLabel,
        editLabel,
        extraActions,
        onDelete,
        onDiscardRowEdits,
        onEdit,
      }),
    ]
  }, [
    canDelete,
    canEdit,
    columns,
    deleteLabel,
    detailPath,
    discardLabel,
    editLabel,
    extraActions,
    hideActions,
    linkField,
    onDelete,
    onDiscardRowEdits,
    onEdit,
  ])

  // BcEditGrid defaults `escDiscardsRow` to true since the row-discard
  // surface already lives in its action column — the keyboard
  // shortcut completes the symmetry. Consumers can opt out with
  // `escDiscardsRow={false}` to get cell-only Esc. Spread BEFORE
  // the default so `props.escDiscardsRow === false` wins; if the
  // prop is `undefined` (default), our `?? true` kicks in.
  return <BcGrid {...props} escDiscardsRow={props.escDiscardsRow ?? true} columns={editColumns} />
}

export function createActionsColumn<TRow>(options: {
  canDelete: ((row: TRow) => boolean) | undefined
  canEdit: ((row: TRow) => boolean) | undefined
  deleteLabel: string
  discardLabel: string
  editLabel: string
  extraActions: BcEditGridProps<TRow>["extraActions"]
  onDelete: ((row: TRow) => void) | undefined
  onDiscardRowEdits: BcEditGridProps<TRow>["onDiscardRowEdits"]
  onEdit: ((row: TRow) => void) | undefined
}): BcGridColumn<TRow> {
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
    cellRenderer(params) {
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
      // typically forwards to `apiRef.current?.discardRowEdits(rowId)`
      // — see BcEditGridProps docs.
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
      // commit. Per `editing-rfc §Server commit + optimistic UI`:
      // letting the user delete a row mid-commit risks dropping a
      // pending edit silently. Non-destructive actions (Edit, custom
      // extras) stay enabled — re-edit is always allowed.
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
