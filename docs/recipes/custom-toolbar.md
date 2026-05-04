# Custom Toolbar

Use the `toolbar` render prop when the host app needs ERP-specific toolbar
layout while still reusing grid-owned controls.

```tsx
import { BcGrid, type BcToolbarContext } from "@bc-grid/react"

function CustomersToolbar(ctx: BcToolbarContext<Customer>) {
  return (
    <div className="customers-toolbar">
      <div className="customers-toolbar-primary">
        {ctx.quickFilterInput}
        {ctx.groupByDropdown}
        {ctx.densityPicker}
        {ctx.clearFiltersButton}
      </div>
      <div className="customers-toolbar-secondary">
        <SavedViewPicker api={ctx.api} />
        <button type="button" onClick={() => exportRows(ctx.api.getSelection())}>
          Export
        </button>
        {ctx.selectedRowCount > 0 ? <span>{ctx.selectedRowCount} selected</span> : null}
      </div>
    </div>
  )
}

export function CustomersGrid({ rows, columns }: CustomersGridProps) {
  return (
    <BcGrid
      gridId="customers"
      data={rows}
      columns={columns}
      rowId={(row) => row.id}
      groupableColumns={[
        { columnId: "region", header: "Region" },
        { columnId: "status", header: "Status" },
      ]}
      quickFilter={{ placeholder: "Search customers" }}
      toolbar={(ctx) => <CustomersToolbar {...ctx} />}
    />
  )
}
```

`ctx.quickFilterInput` appears when the grid's `quickFilter` prop is enabled
and drives the grid's `searchText` state after the configured debounce.
`ctx.searchInput` is the immediate, non-debounced search input for hosts that
want to provide their own search affordance but still reuse grid-owned wiring.
If the host already owns search state, keep passing `searchText` /
`onSearchTextChange`; both sub-slots call the controlled callback.

`ctx.savedViewPicker` is intentionally `null` today because saved views are
consumer-owned. Place the app's saved-view picker next to the grid-owned slots
and use `ctx.api` or controlled `layoutState` to apply selections.
