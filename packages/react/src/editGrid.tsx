import { type ReactNode, useMemo } from "react"
import { createActionsColumn, shouldRenderActionsColumn } from "./actionsColumn"
import { BcGrid } from "./grid"
import { defaultMessages } from "./gridInternals"
import type { BcEditGridProps, BcGridColumn } from "./types"

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

    if (
      !shouldRenderActionsColumn({ onEdit, onDelete, onDiscardRowEdits, extraActions, hideActions })
    )
      return nextColumns

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

// `createActionsColumn` lives in `./actionsColumn.tsx` so both
// `<BcEditGrid>` and `<BcServerGrid>` can call it. Re-exported here
// for backward compatibility (consumer code that imported
// `createActionsColumn` from `./editGrid` keeps working). Per
// `v06-server-grid-actions-column`.
export { createActionsColumn } from "./actionsColumn"
