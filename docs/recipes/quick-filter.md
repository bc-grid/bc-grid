# Quick Filter

Use `quickFilter` for the ERP-style search box that scans every searchable
column at once. It is intentionally separate from the per-column filter row:
quick filter is broad discovery, column filters are precise predicates.

```tsx
function CustomersGrid({ rows, columns }: CustomersGridProps) {
  return (
    <BcGrid
      gridId="customers"
      data={rows}
      columns={columns}
      rowId={(row) => row.id}
      quickFilter={{
        placeholder: "Search customers, invoices, owners...",
        debounceMs: 200,
      }}
      searchHotkey
    />
  )
}
```

The input drives the existing `searchText` channel. Rows still match by joining
the formatted values for columns where `column.filter !== false`, and matching
text is highlighted by the default cell renderer.

## Custom Toolbar Placement

`quickFilter` renders a default toolbar when `toolbar` is omitted. For a custom
layout, place `ctx.quickFilterInput` where the search field belongs.

```tsx
<BcGrid
  // ...
  quickFilter={{ placeholder: "Search AR customers" }}
  toolbar={(ctx) => (
    <div className="ar-toolbar">
      {ctx.quickFilterInput}
      {ctx.groupByDropdown}
      {ctx.clearFiltersButton}
      <SavedViewPicker api={ctx.api} />
    </div>
  )}
/>
```

## Choosing The Right Filter

Use quick filter when a clerk knows a fragment such as an invoice number,
customer name, owner, or note and wants the matching rows immediately.

Use column filters when the condition is structured: "status is Past Due",
"balance greater than 5000", "owner is me", or "due date this month".

Both channels compose with AND semantics: a row must pass the quick-filter
search and the active column filters to remain visible.
