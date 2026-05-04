# Server Grids Without `<BcServerGrid>`

The turnkey hooks `useServerPagedGrid`, `useServerInfiniteGrid`, and `useServerTreeGrid` ship two outputs:

- **`serverProps`** (alias `props`): `<BcServerGrid>`-shaped. Spread into `<BcServerGrid {...result.serverProps} columns={…} />`. Recommended path; the `<BcServerGrid>` component owns orchestration, error chrome, default context menu, status bar, and the rest.
- **`bound`** (NEW in v0.6.0): `<BcGrid>`-shaped. Spread into `<BcGrid {...result.bound} columns={…} />`. For consumers who wrap `<BcGrid>` in their own chrome (e.g. host-owned toolbar, custom error states, app-wide layout primitives) and don't want to switch to `<BcServerGrid>`.

Bsncraft is the canonical case: their `ServerEditGrid` wrapper renders `<BcGrid>` directly with custom chrome around it. They want hook orchestration without restructuring the wrapper.

## v0.6.0 status

| Hook | `serverProps` | `bound` |
|---|---|---|
| `useServerPagedGrid` | ✅ shipped | ✅ shipped |
| `useServerInfiniteGrid` | ✅ shipped | ⏳ v0.6.x follow-up |
| `useServerTreeGrid` | ✅ shipped | ⏳ v0.6.x follow-up |

Per `docs/design/server-grid-hooks-dual-output-rfc.md`. Infinite + tree dual-output land as separate PRs after the paged path stabilises in alpha.

## Picking an output

```ts
const grid = useServerPagedGrid<Customer>({
  gridId: "customers",
  rowId: (row) => row.id,
  loadPage: loadCustomerPage,
  outputs: "bound", // ← opt into bound output
})
```

The `outputs` option gates the hook's internal orchestration loop:

- `outputs: "server"` (default): existing behaviour. The hook does NOT call `loadPage` internally — `<BcServerGrid>` does. `result.bound.data` is empty.
- `outputs: "bound"`: the hook fires `loadPage` directly on every view-defining change. `result.bound.data` is populated with the latest page's rows. The consumer mounts `<BcGrid {...result.bound}>`.

**Don't mount `<BcServerGrid {...result.serverProps}>` AND use `result.bound` simultaneously.** Both would dispatch the loader, doubling network traffic. Pick exactly one output per hook instance.

## Bound mode example

```tsx
import { BcGrid, type BcGridColumn, useServerPagedGrid } from "@bc-grid/react"

interface Customer {
  id: string
  name: string
  status: "active" | "inactive"
  balance: number
}

const customerColumns: BcGridColumn<Customer>[] = [
  { columnId: "name", field: "name", header: "Name", width: 240 },
  { columnId: "status", field: "status", header: "Status", width: 120 },
  { columnId: "balance", field: "balance", header: "Balance", width: 140, align: "right" },
]

function MyCustomerGrid() {
  const grid = useServerPagedGrid<Customer>({
    gridId: "customers",
    rowId: (row) => row.id,
    loadPage: async (query) => {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(query),
      })
      return await res.json()
    },
    outputs: "bound",
  })

  return (
    <MyCustomChrome
      title="Customers"
      pagination={
        <MyCustomPaginator
          page={grid.state.page}
          pageSize={grid.state.pageSize}
          totalRows={grid.state.lastResult?.totalRows ?? 0}
          onChange={(next) => grid.actions.setPage(next.page)}
        />
      }
    >
      <BcGrid<Customer> {...grid.bound} columns={customerColumns} />
    </MyCustomChrome>
  )
}
```

The hook handles:
- Sort / filter / search / pagination state (controlled).
- Debouncing (default 200ms; `debounceMs` option to tune).
- Page reset on view change (back to page 0 when filter / sort / search changes).
- Loader dispatch + AbortController on view change (stale results never overwrite).
- `loading` / `error` state (surfaced via `result.bound.loading` and `result.bound.errorOverlay`).
- Optimistic edits (via `actions.applyOptimisticEdit`).

The consumer renders `<BcGrid>` with the spread + their own column array.

## Custom error chrome

`bound.errorOverlay` defaults to a simple "Failed to load." string when the loader rejects. Override with a richer fallback:

```tsx
<BcGrid<Customer>
  {...grid.bound}
  columns={customerColumns}
  errorOverlay={
    grid.state.error ? (
      <ErrorBanner
        message={grid.state.error instanceof Error ? grid.state.error.message : "Unknown"}
        onRetry={grid.actions.reload}
      />
    ) : undefined
  }
/>
```

The grid's overlay precedence: `loading > errorOverlay > no-rows`. Both `bound.loading` and `bound.errorOverlay` are spread by `...grid.bound`; the explicit `errorOverlay` override wins via spread order.

## Migrating from `serverProps`

```diff
 function MyCustomerGrid() {
   const grid = useServerPagedGrid<Customer>({
     gridId: "customers",
     rowId: (row) => row.id,
     loadPage,
+    outputs: "bound",
   })
   return (
-    <BcServerGrid<Customer> {...grid.serverProps} columns={customerColumns} />
+    <BcGrid<Customer> {...grid.bound} columns={customerColumns} />
   )
 }
```

Two changes — the `outputs` option flip + the component swap. State and actions are unchanged.

## When NOT to use bound

The default `<BcServerGrid>` path is recommended. Use `bound` only when:

1. You wrap `<BcGrid>` in your own chrome that you can't easily migrate to `<BcServerGrid>` (bsncraft case).
2. You need to inject layout primitives between the grid and the data fetching (e.g. server-side caching layer the grid shouldn't know about).
3. You need to swap the loader at runtime in ways that `<BcServerGrid>` doesn't support cleanly.

Otherwise, prefer `<BcServerGrid>` — it owns the default context menu wiring, default error overlay, status bar integration, and the polymorphic mode-switch (per `docs/design/server-mode-switch-rfc.md`). The `bound` path is the escape hatch, not the recommended default.

## Caveats

- **No double-mount.** Mounting `<BcServerGrid {...serverProps}>` AND using `bound` doubles network traffic. The hook orchestrates internally when `outputs === "bound"`; `<BcServerGrid>` orchestrates when mounted. There's no marker-prop dedup in v0.6.0 — pick one output.
- **`apiRef` shape differs.** `bound` consumers mount `<BcGrid>` so the apiRef is `BcGridApi`, not `BcServerGridApi`. The hook's `actions.reload()` no-ops if `apiRef.current` lacks `refreshServerRows` — bound consumers should call `actions.reload()` only after the hook has run at least one fetch.
- **No saved-view persistence in bound mode.** The hook doesn't currently persist `sort` / `filter` / `pagination` to `gridId` localStorage when `outputs === "bound"` — that path lives in `<BcGrid>`'s internal `usePersistedGridStateWriter` which the hook doesn't reach. Consumers wanting persistence should mount via `serverProps` + `<BcServerGrid>`. Closing this gap is queued for v0.6.x follow-up.
