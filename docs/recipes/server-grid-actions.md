# Server Grid Actions Column

`<BcServerGrid>` (in all three row models — paged, infinite, tree) supports the same actions-column abstraction `<BcEditGrid>` has had since v0.4. Wire `onEdit` / `onDelete` / `onDiscardRowEdits` / `extraActions` and the grid auto-injects a pinned-right `__bc_actions` column with Edit / Delete / Discard / extras rendered per row.

Doc-driven by the bsncraft 2026-05-03 P1: their `apps/web/components/edit-grid.tsx` wrapper hand-rolled `createActionsColumn` against `<BcServerGrid>` because the actions surface was edit-grid-only. ~150 LOC of consumer code that should live in the framework. This recipe is the migration path.

## Public surface

`BcActionsColumnProps<TRow>` is now shared by `BcEditGridProps` and `BcServerGridProps`:

```ts
interface BcActionsColumnProps<TRow> {
  onEdit?: (row: TRow) => void
  onDelete?: (row: TRow) => void
  canEdit?: (row: TRow) => boolean
  canDelete?: (row: TRow) => boolean
  onDiscardRowEdits?: (rowId: RowId, row: TRow) => void
  extraActions?: BcEditGridAction<TRow>[] | ((row: TRow) => BcEditGridAction<TRow>[])
  hideActions?: boolean
  editLabel?: string
  deleteLabel?: string
  discardLabel?: string
}
```

`<BcServerGrid>` injects the column when at least one handler is supplied AND `hideActions !== true`. The column id is fixed at `__bc_actions`; pinned right; not sortable / filterable / groupable / column-menu-able / editable.

## Pattern: paged server grid with edit + delete

```tsx
import { BcServerGrid, useBcGridApi } from "@bc-grid/react"

function CustomersGrid() {
  const apiRef = useBcGridApi<Customer>()
  const router = useRouter()

  return (
    <BcServerGrid<Customer>
      apiRef={apiRef}
      rowModel="paged"
      loadPage={loadCustomers}
      columns={customerColumns}
      rowId={(row) => row.id}
      // Auto-injected actions column:
      onEdit={(row) => router.push(`/customers/${row.id}/edit`)}
      onDelete={async (row) => {
        if (await confirm(`Delete ${row.name}?`)) {
          await deleteCustomer(row.id)
          apiRef.current?.refresh?.()
        }
      }}
      onDiscardRowEdits={(rowId) => apiRef.current?.discardRowEdits(rowId)}
    />
  )
}
```

The actions column appears as the rightmost pinned column. Edit/Delete fire your handlers; Discard surfaces only when the row is dirty (any cell has uncommitted overlay edits).

## Pattern: extra actions

`extraActions` accepts either a flat array or a function for per-row gating:

```tsx
<BcServerGrid<Order>
  // ...
  extraActions={(row) => [
    {
      label: "Approve",
      onSelect: (r) => approveOrder(r.id),
      disabled: row.status !== "pending",
    },
    {
      label: "Cancel",
      onSelect: (r) => cancelOrder(r.id),
      destructive: true,
      disabled: row.status === "completed",
    },
  ]}
/>
```

Destructive actions (`destructive: true`) are styled with the destructive variant and disabled while the row has any pending commit (per `editing-rfc §Server commit + optimistic UI` — letting the user delete a row mid-commit risks dropping a pending edit silently).

## Pattern: per-row gating

`canEdit` and `canDelete` disable the built-ins per row without unwiring the handlers:

```tsx
<BcServerGrid<Customer>
  // ...
  onEdit={editCustomer}
  canEdit={(row) => row.status !== "archived"}
  onDelete={deleteCustomer}
  canDelete={(row) => row.invoiceCount === 0}
/>
```

Disabled buttons stay rendered (so the layout is consistent across rows) but become non-interactive. Consumer-supplied tooltips on the row are typically the right place to explain why.

## Pattern: hideActions opt-out

A parent route can suppress the actions column without unwiring the handlers — useful when the same component is reused in a "view-only" context where the handlers are still wired for other surfaces (context menu, keyboard shortcut, etc.):

```tsx
<BcServerGrid<Customer>
  onEdit={...}
  onDelete={...}
  hideActions={isViewOnlyMode}
/>
```

## Migrating from a hand-rolled wrapper

If you have a `ServerEditGrid` wrapper that imports `createActionsColumn` from `@bc-grid/react` and appends it manually:

```tsx
// BEFORE: ~150 LOC wrapper
function ServerEditGrid<TRow>(props: ServerEditGridProps<TRow>) {
  const columns = useMemo(() => {
    if (!props.onEdit && !props.onDelete) return props.columns
    return [
      ...props.columns,
      createActionsColumn({
        onEdit: props.onEdit,
        onDelete: props.onDelete,
        // ... 10 more props
      }),
    ]
  }, [props.columns, props.onEdit, props.onDelete /* ... */])

  return <BcServerGrid {...props} columns={columns} />
}
```

Becomes:

```tsx
// AFTER: 0 LOC wrapper
import { BcServerGrid } from "@bc-grid/react"
// Use <BcServerGrid> directly; pass actions handlers as props.
```

The grid auto-injects the column with the same gating (`shouldRenderActionsColumn` predicate) and the same per-row affordances. Bsncraft alone deletes ~150 LOC of wrapper code with this migration.

## When NOT to use

- **Custom action layout that doesn't fit the buttons-in-a-row pattern.** If you need a kebab menu, a popover with sub-options, or a multi-row action layout, build your own column with `cellRenderer` and skip the auto-injection (don't wire `onEdit` / `onDelete`). The pattern of leaving the column off the framework and letting the consumer compose is the right escape hatch.
- **Read-only grids.** Skip the props entirely — no actions column will render.
- **Grids with custom column ordering that needs the actions column elsewhere than the right edge.** The auto-injected column is fixed at `pinned: "right"`. Custom placement requires the explicit `cellRenderer` route above.
