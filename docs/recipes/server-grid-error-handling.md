# Server Grid Error Handling

When a `<BcServerGrid>` loader rejects (`loadPage` / `loadBlock` / `loadChildren`), the grid surfaces the failure two ways:

1. **`BcServerGridProps.renderServerError`** — declarative slot. Receives `{ error, retry }` and returns the JSX to render in place of the row body. Recommended for app-wide error chrome (theme, retry copy, support links).
2. **`BcServerGridApi.getLastError()`** — imperative read. Returns the latest rejected error or `null`. Useful for telemetry, banner notifications, or composing alerts outside the grid frame.

Both paths surface the same value. The default fallback (when `renderServerError` is unset) renders a minimal "Failed to load. / Retry" button using `--bc-grid-edit-state-error-*` tokens for theme consistency.

## Default fallback

```tsx
<BcServerGrid<Customer>
  rowId={(row) => row.id}
  rowModel="paged"
  loadPage={loadCustomerPage}
  columns={customerColumns}
/>
```

If `loadCustomerPage` rejects, the grid renders:

```
┌────────────────────────────────┐
│  Failed to load.               │
│  ┌──────────┐                  │
│  │  Retry   │                  │
│  └──────────┘                  │
└────────────────────────────────┘
```

The Retry button calls `apiRef.refreshServerRows({ purge: true })` internally — same code path as a manual refresh.

## Custom error slot

Pass `renderServerError` to take over the layout entirely:

```tsx
<BcServerGrid<Customer>
  rowId={(row) => row.id}
  rowModel="paged"
  loadPage={loadCustomerPage}
  columns={customerColumns}
  renderServerError={({ error, retry }) => (
    <ErrorState
      title="Couldn't load customers"
      message={error instanceof Error ? error.message : "Unknown error"}
      cta={
        <Button onClick={retry} intent="primary">
          Retry
        </Button>
      }
      secondaryCta={<a href="/support">Contact support</a>}
    />
  )}
/>
```

The slot receives:

| Field | Type | Notes |
|---|---|---|
| `error` | `unknown` | The rejected loader value. Usually `Error`, but consumers can throw anything; narrow before reading. |
| `retry` | `() => void` | Re-fires the active mode's loader (paged refetches the current page; infinite refetches the last visible block; tree refetches the last expanded children). |

## Imperative access

```tsx
const apiRef = useRef<BcServerGridApi<Customer> | null>(null)

useEffect(() => {
  const interval = setInterval(() => {
    const error = apiRef.current?.getLastError()
    if (error) {
      analytics.track("server_grid_error", {
        gridId: "customers",
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }, 30_000)
  return () => clearInterval(interval)
}, [])

return (
  <BcServerGrid<Customer>
    apiRef={apiRef}
    rowId={(row) => row.id}
    rowModel="paged"
    loadPage={loadCustomerPage}
    columns={customerColumns}
  />
)
```

`getLastError()` clears on the next successful response, so the polled value reflects the most recent failure that hasn't yet been resolved by a retry.

## Companion: `errorOverlay` on `BcGridProps`

`<BcServerGrid>` populates `BcGridProps.errorOverlay` automatically from the `renderServerError` slot. If you mount `<BcGrid>` directly (no server-row-model), you can pass `errorOverlay` yourself:

```tsx
<BcGrid<Customer>
  data={rows}
  columns={customerColumns}
  loading={false}
  errorOverlay={
    error ? (
      <ErrorState message={error.message} cta={<Button onClick={retry}>Retry</Button>} />
    ) : undefined
  }
/>
```

Precedence: `loading` wins over `errorOverlay` wins over the no-rows fallback.

## What counts as an error

The active mode's `error` state surfaces here:

- **Paged** — last `loadPage` rejection (network failure, server 5xx, validation throw).
- **Infinite** — last `loadBlock` rejection.
- **Tree** — last `loadChildren` rejection.

`AbortError`s (from request supersedure during fast-typing or mode switches) are explicitly NOT surfaced — those are routine cancellations, not consumer-visible failures.

## Recovery semantics

Retry doesn't carry "what was loading when it failed" because the orchestration's request-id supersedure may have already advanced. `retry()` re-fires the loader with whatever the active view + page state is at the moment of the click — typically what the user wants (they've likely scrolled / filtered while the error was on screen). If you need to re-attempt the original failed request specifically, capture the query in `loadPage` itself and re-issue from your error handler.
