# Saved View Persistence

Saved views are host-owned records around `BcSavedView`. The grid provides the DTO and migration helpers; the host decides where named views live, who can see them, and how default/favorite permissions work.

Use this companion recipe with `docs/recipes/saved-views.md` when a grid needs named queues such as "My Past Due", "Team Escalations", or "Unassigned This Month".

```ts
import {
  BcGrid,
  type BcGridLayoutState,
  type BcSavedView,
  type BcSavedViewInput,
  createSavedView,
  migrateSavedViewLayout,
} from "@bc-grid/react"
```

## Store Boundary

Keep the store interface small and app-owned:

```ts
interface SavedViewStore<TRow = unknown> {
  list(gridId: string): Promise<readonly BcSavedView<TRow>[]>
  getDefault(gridId: string): Promise<BcSavedView<TRow> | null>
  upsert(view: BcSavedViewInput<TRow>): Promise<BcSavedView<TRow>>
  remove(viewId: string): Promise<void>
}
```

Persist `BcSavedView`, not raw `BcGridLayoutState`, once the user names a view. `migrateSavedViewLayout` should run at every read boundary so older records normalize before the toolbar or grid sees them.

## URL Boundary

`urlStatePersistence` carries the current ad-hoc layout blob. Saved views live beside it in host storage, keyed by `gridId`.

```txt
?grid=<layout-json>&activeSavedViewId=view-open-invoices
```

Use the grid-owned `grid` parameter for the current layout. Use a host-owned parameter such as `activeSavedViewId` only when the app needs to reopen the same named view. Do not put saved-view identity inside the grid layout payload; renamed, deleted, or private views should not make bookmarked ad-hoc layouts unreadable.

## localStorage Adapter

Use this for single-user or single-browser tools. It is synchronous underneath but returns promises so the toolbar can swap to IndexedDB or server storage later without changing call sites.

```ts
function createLocalStorageSavedViewStore<TRow = unknown>(
  namespace = "bc-grid:saved-views",
): SavedViewStore<TRow> {
  const readAll = (): readonly BcSavedView<TRow>[] => {
    if (typeof window === "undefined") return []
    const raw = window.localStorage.getItem(namespace)
    if (!raw) return []
    const parsed = JSON.parse(raw) as readonly BcSavedViewInput<TRow>[]
    return parsed.map((view) => migrateSavedViewLayout(view))
  }

  const writeAll = (views: readonly BcSavedView<TRow>[]) => {
    window.localStorage.setItem(namespace, JSON.stringify(views))
  }

  return {
    async list(gridId) {
      return readAll().filter((view) => view.gridId === gridId)
    },
    async getDefault(gridId) {
      return readAll().find((view) => view.gridId === gridId && view.isDefault) ?? null
    },
    async upsert(input) {
      const view = migrateSavedViewLayout(input)
      const next = readAll().filter((item) => item.id !== view.id)
      writeAll([...next, view])
      return view
    },
    async remove(viewId) {
      writeAll(readAll().filter((view) => view.id !== viewId))
    },
  }
}
```

When users can open the same grid in multiple tabs, subscribe to the browser `storage` event and refresh the toolbar list when `event.key === namespace`.

## IndexedDB Adapter

Use IndexedDB when the saved-view list can grow, when layouts carry larger filter payloads, or when the app needs async browser storage. The adapter below keeps one object store keyed by `id` and an index by `gridId`.

```ts
const DB_NAME = "bc-grid-saved-views"
const STORE_NAME = "views"

function openSavedViewDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      const store = db.createObjectStore(STORE_NAME, { keyPath: "id" })
      store.createIndex("gridId", "gridId")
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

function txStore(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
    tx.oncomplete = () => resolve()
  })
}

function createIndexedDbSavedViewStore<TRow = unknown>(): SavedViewStore<TRow> {
  return {
    async list(gridId) {
      const db = await openSavedViewDb()
      const index = txStore(db, "readonly").index("gridId")
      const rows = await requestValue(index.getAll(gridId))
      return (rows as readonly BcSavedViewInput<TRow>[]).map((view) =>
        migrateSavedViewLayout(view),
      )
    },
    async getDefault(gridId) {
      const views = await this.list(gridId)
      return views.find((view) => view.isDefault) ?? null
    },
    async upsert(input) {
      const view = migrateSavedViewLayout(input)
      const db = await openSavedViewDb()
      const tx = db.transaction(STORE_NAME, "readwrite")
      tx.objectStore(STORE_NAME).put(view)
      await transactionDone(tx)
      return view
    },
    async remove(viewId) {
      const db = await openSavedViewDb()
      const tx = db.transaction(STORE_NAME, "readwrite")
      tx.objectStore(STORE_NAME).delete(viewId)
      await transactionDone(tx)
    },
  }
}
```

If your toolbar supports team/global views in IndexedDB, include `scope` in the record and filter in `list()` according to the active user's permissions.

## Server Adapter

Use server storage when saved views are shared across devices, teams, roles, or tenants. The server should store the DTO as JSON and enforce authorization around `scope`, `ownerId`, `isDefault`, and `isFavorite`.

```ts
function createServerSavedViewStore<TRow = unknown>(
  baseUrl: string,
  fetchJson = window.fetch.bind(window),
): SavedViewStore<TRow> {
  const jsonHeaders = { "content-type": "application/json" }

  return {
    async list(gridId) {
      const res = await fetchJson(`${baseUrl}?gridId=${encodeURIComponent(gridId)}`)
      if (!res.ok) throw new Error(`Saved views request failed: ${res.status}`)
      const views = (await res.json()) as readonly BcSavedViewInput<TRow>[]
      return views.map((view) => migrateSavedViewLayout(view))
    },
    async getDefault(gridId) {
      const views = await this.list(gridId)
      return views.find((view) => view.isDefault) ?? null
    },
    async upsert(input) {
      const view = migrateSavedViewLayout(input)
      const res = await fetchJson(`${baseUrl}/${encodeURIComponent(view.id)}`, {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify(view),
      })
      if (!res.ok) throw new Error(`Saved view save failed: ${res.status}`)
      return migrateSavedViewLayout((await res.json()) as BcSavedViewInput<TRow>)
    },
    async remove(viewId) {
      const res = await fetchJson(`${baseUrl}/${encodeURIComponent(viewId)}`, {
        method: "DELETE",
      })
      if (!res.ok && res.status !== 404) {
        throw new Error(`Saved view delete failed: ${res.status}`)
      }
    },
  }
}
```

For multi-tenant products, the endpoint should derive tenant/user/team identity from the session rather than trusting client-supplied `ownerId` or `scope`.

For shared team/global views that need concurrent-edit protection, prefer the
`createServerSyncedSavedViewStore` helper and conflict flow in
`docs/recipes/saved-view-server-sync.md`.

## Toolbar Wiring

The storage adapter owns persistence; `BcGrid` still owns layout application through controlled `layoutState`.

```tsx
function CustomerGrid({ rows, columns, store }: CustomerGridProps) {
  const gridId = "ar.customers"
  const [views, setViews] = useState<readonly BcSavedView[]>([])
  const [layoutState, setLayoutState] = useState<BcGridLayoutState | undefined>()

  useEffect(() => {
    let active = true
    store.list(gridId).then((next) => {
      if (active) setViews(next)
    })
    store.getDefault(gridId).then((view) => {
      if (active && view) setLayoutState(view.layout)
    })
    return () => {
      active = false
    }
  }, [store])

  const saveCurrentView = async (name: string) => {
    if (!layoutState) return
    const view = createSavedView({ gridId, name, layout: layoutState })
    await store.upsert(view)
    setViews(await store.list(gridId))
  }

  const loadView = (view: BcSavedView) => {
    setLayoutState(migrateSavedViewLayout(view).layout)
  }

  return (
    <>
      <SavedViewToolbar
        views={views}
        onLoad={loadView}
        onSave={saveCurrentView}
        onDelete={async (id) => {
          await store.remove(id)
          setViews(await store.list(gridId))
        }}
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

The same toolbar can use any adapter above because all three implement the same `SavedViewStore` boundary.
