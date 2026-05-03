# Saved Views

Saved views are consumer-owned named snapshots around `BcGridLayoutState`. The grid provides the DTO and helpers; host apps own the toolbar UI, storage, permissions, and delete/rename flows.

Use this pattern when users need saved queues such as "My Past Due", "South Region Disputed", or "Unassigned This Week".

For persistence adapters, see `docs/recipes/saved-view-persistence.md`; for
team/global server conflict handling, see
`docs/recipes/saved-view-server-sync.md`.

```ts
import {
  type BcGridLayoutState,
  type BcSavedView,
  BcGrid,
  createSavedView,
  migrateSavedViewLayout,
} from "@bc-grid/react"
```

## State Shape

`BcSavedView` wraps the live layout snapshot instead of duplicating sort, filter, column, grouping, pagination, or density fields.

```ts
interface BcSavedView<TRow = unknown> {
  id: string
  name: string
  gridId: string
  version: number
  layout: BcGridLayoutState
  scope: "user" | "team" | "global"
  ownerId?: string
  isDefault?: boolean
  isFavorite?: boolean
  createdAt?: string
  updatedAt?: string
  description?: string
}
```

`createSavedView` pins the current schema version, generates an id when omitted, defaults `scope` to `"user"`, and stamps `createdAt` / `updatedAt`.

## Toolbar Pattern

Keep the current layout controlled by the host so loading a saved view is just a state update.

```tsx
function CustomerGrid({ rows, columns, storage }: CustomerGridProps) {
  const [views, setViews] = useState<readonly BcSavedView[]>(() =>
    storage.listSavedViews("ar.customers"),
  )
  const [layoutState, setLayoutState] = useState<BcGridLayoutState | undefined>(() => {
    const defaultView = storage.getDefaultSavedView("ar.customers")
    return defaultView ? migrateSavedViewLayout(defaultView).layout : undefined
  })

  const loadView = (view: BcSavedView) => {
    setLayoutState(migrateSavedViewLayout(view).layout)
  }

  const saveView = (name: string) => {
    if (!layoutState) return
    const next = createSavedView({
      gridId: "ar.customers",
      name,
      layout: layoutState,
      scope: "user",
    })
    storage.upsertSavedView(next)
    setViews(storage.listSavedViews("ar.customers"))
  }

  const deleteView = (viewId: string) => {
    storage.deleteSavedView(viewId)
    setViews(storage.listSavedViews("ar.customers"))
  }

  return (
    <>
      <SavedViewToolbar views={views} onLoad={loadView} onSave={saveView} onDelete={deleteView} />
      <BcGrid
        gridId="ar.customers"
        columns={columns}
        data={rows}
        layoutState={layoutState}
        onLayoutStateChange={(next) => setLayoutState(next)}
        urlStatePersistence={{ searchParam: "grid" }}
      />
    </>
  )
}
```

The toolbar should normally expose:

- saved-view select / command menu
- save current layout
- rename or duplicate
- favorite / default toggles
- delete with host confirmation
- scope indicator when team or global views are present

## Applying Through apiRef

Prefer controlled `layoutState` for full-fidelity loading. `applySavedViewLayout(api, view)` exists for imperative host actions and applies the fields backed by `BcGridApi` today: column state, sort, and filter. Pass optional setters for controlled-only fields.

```ts
applySavedViewLayout(apiRef.current, view, {
  setGroupBy,
  setSearchText,
  setPagination,
  setDensity,
  setSidebarPanel,
})
```

## URL Boundary

Use `urlStatePersistence` for the current layout blob only. Do not put `activeSavedViewId` inside the grid-owned URL payload; if a host app needs to round-trip the active named view, add its own search parameter next to the grid payload.

```txt
?grid=<layout-json>&activeSavedViewId=view-open-invoices
```

This keeps bookmarked ad-hoc layouts useful even after a saved view is renamed, deleted, or made private.
