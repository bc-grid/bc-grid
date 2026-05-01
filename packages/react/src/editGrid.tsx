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
    canEdit,
    canDelete,
    extraActions,
    editLabel = defaultMessages.editLabel,
    deleteLabel = defaultMessages.deleteLabel,
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

    const hasActions = Boolean(onEdit || onDelete || extraActions)
    if (hideActions || !hasActions) return nextColumns

    return [
      ...nextColumns,
      createActionsColumn({
        canDelete,
        canEdit,
        deleteLabel,
        editLabel,
        extraActions,
        onDelete,
        onEdit,
      }),
    ]
  }, [
    canDelete,
    canEdit,
    columns,
    deleteLabel,
    detailPath,
    editLabel,
    extraActions,
    hideActions,
    linkField,
    onDelete,
    onEdit,
  ])

  return <BcGrid {...props} columns={editColumns} />
}

export function createActionsColumn<TRow>(options: {
  canDelete: ((row: TRow) => boolean) | undefined
  canEdit: ((row: TRow) => boolean) | undefined
  deleteLabel: string
  editLabel: string
  extraActions: BcEditGridProps<TRow>["extraActions"]
  onDelete: ((row: TRow) => void) | undefined
  onEdit: ((row: TRow) => void) | undefined
}): BcGridColumn<TRow> {
  return {
    columnId: "__bc_actions",
    header: defaultMessages.actionColumnLabel,
    pinned: "right",
    width: 180,
    sortable: false,
    resizable: false,
    columnMenu: false,
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
