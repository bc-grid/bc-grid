# Saved View Server Sync

Use server sync when saved views are shared across devices, teams, roles, or tenants. The grid still owns only the DTO and migration helpers; the host owns the endpoint, permissions, toolbar, and conflict policy.

```ts
import {
  createServerSyncedSavedViewStore,
  createSavedView,
  migrateSavedViewLayout,
  type BcGridLayoutState,
  type BcSavedView,
} from "@bc-grid/react"
```

## Endpoint Contract

The starter helper expects a conventional REST shape:

```txt
GET    /saved-views?gridId=<gridId>       -> BcSavedView[]
GET    /saved-views/:id                   -> BcSavedView | 404
PUT    /saved-views/:id                   -> BcSavedView | 409 BcSavedView
DELETE /saved-views/:id                   -> 204 | 404
```

The server should set `updatedAt` on every successful save. Before pushing, the helper fetches the current remote record; if `remote.updatedAt` is newer than the local `updatedAt`, `upsert` returns `{ status: "conflict", local, remote }` and does not write. If timestamps match, or the remote record is missing, it pushes the local view. A server-side `409` should return the current remote view and is surfaced as the same conflict result.

## Store

```ts
const savedViewStore = createServerSyncedSavedViewStore({
  endpoint: "/api/saved-views",
  gridId: "ar.customers",
})
```

The returned store has:

```ts
interface BcServerSyncedSavedViewStore<TRow = unknown> {
  list(): Promise<readonly BcSavedView<TRow>[]>
  getDefault(): Promise<BcSavedView<TRow> | null>
  upsert(view: BcSavedViewInput<TRow>): Promise<
    | { status: "saved"; view: BcSavedView<TRow> }
    | { status: "conflict"; local: BcSavedView<TRow>; remote: BcSavedView<TRow> }
  >
  remove(viewId: string): Promise<void>
}
```

## Toolbar Flow

```tsx
function CustomerGrid({ rows, columns }: CustomerGridProps) {
  const gridId = "ar.customers"
  const store = useMemo(
    () => createServerSyncedSavedViewStore({ endpoint: "/api/saved-views", gridId }),
    [],
  )
  const [views, setViews] = useState<readonly BcSavedView[]>([])
  const [layoutState, setLayoutState] = useState<BcGridLayoutState | undefined>()
  const [conflict, setConflict] = useState<BcSavedView | null>(null)

  useEffect(() => {
    let active = true
    store.list().then((next) => {
      if (active) setViews(next)
    })
    store.getDefault().then((view) => {
      if (active && view) setLayoutState(migrateSavedViewLayout(view).layout)
    })
    return () => {
      active = false
    }
  }, [store])

  const saveCurrentView = async (name: string) => {
    if (!layoutState) return
    const result = await store.upsert(
      createSavedView({
        gridId,
        name,
        layout: layoutState,
        scope: "team",
      }),
    )

    if (result.status === "conflict") {
      setConflict(result.remote)
      return
    }

    setViews(await store.list())
  }

  return (
    <>
      <SavedViewToolbar
        views={views}
        conflict={conflict}
        onReloadConflict={() => {
          if (!conflict) return
          setLayoutState(migrateSavedViewLayout(conflict).layout)
          setConflict(null)
        }}
        onSave={saveCurrentView}
        onLoad={(view) => setLayoutState(migrateSavedViewLayout(view).layout)}
      />
      <BcGrid
        gridId={gridId}
        columns={columns}
        data={rows}
        rowId={(row) => row.id}
        layoutState={layoutState}
        onLayoutStateChange={setLayoutState}
        urlStatePersistence={{ searchParam: "grid" }}
      />
    </>
  )
}
```

## Conflict Policy

The default recommendation is reload-on-conflict: show the user that another tab or teammate changed the saved view, then reload the remote view before saving again. Last-write-wins is possible, but should be an explicit host choice because team/global saved views are shared operational state.

For multi-tenant products, derive tenant, user, and team identity from the authenticated session. Treat client-supplied `scope`, `ownerId`, `isDefault`, and `isFavorite` as requested metadata, not authorization.
