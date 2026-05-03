# Grid State Persistence

The full pattern for persisting and restoring every aspect of bc-grid state across navigation: layout (column widths, sort, filter, pagination, density, sidebar), selection, range selection, expansion, and scroll position. The maintainer ask 2026-05-03 was: "would it be possible for a consumer to maintain the state of bc-grid, such as where it is scrolled at, and what child panels are open, so when they click back onto a page containing a bc-grid, it looks exactly the same as when navigating away?" This recipe is the complete answer.

The grid does not own storage — every persistable surface is exposed via initial-prop + change-callback pairs so the consumer chooses where state lives (localStorage, URL, server, in-memory route store).

## What's persistable

| State | Initial / restore prop | Change event | Getter on `apiRef` |
|---|---|---|---|
| Layout (columns, sort, filter, search, groupBy, density, pagination, sidebar) | `initialLayout` | `onLayoutChange` | `getColumnState`, `getFilter`, etc. |
| Selection | `defaultSelection` / `selection` | `onSelectionChange` | `getSelection` |
| Range selection | `defaultRangeSelection` / `rangeSelection` | `onRangeSelectionChange` | `getRangeSelection` |
| Expansion | `defaultExpansion` / `expansion` | `onExpansionChange` | — |
| Active cell | `defaultActiveCell` / `activeCell` | `onActiveCellChange` | `getActiveCell` |
| Scroll position | `initialScrollOffset` | `onScrollChange` | `getScrollOffset` |
| Editing cell | `editingCell` | `onEditingCellChange` | — (mid-edit state on `editController`) |

`initialScrollOffset` + `onScrollChange` + `getScrollOffset` shipped in v0.6.0-alpha.1 to close the scroll gap. `editingCell` + `onEditingCellChange` shipped in the same release to close the editor gap — the user can leave a cell mid-edit, navigate away, and return to find the editor restored on the same cell.

### Editing cell — restore semantics

The editor's lifecycle is async (prepare → mount → editing → validating → committing → unmounting), so `editingCell` is a **one-time-restore** prop, not a fully bidirectional controlled prop. The grid reads it once at mount, calls `editController.start(...)` if the cell is valid (row exists, column is editable, editing is enabled), then ignores subsequent prop updates. For programmatic mid-session control, use `apiRef.current?.startEdit(rowId, columnId)` instead.

`onEditingCellChange(next, prev)` fires on every editing-cell change (entering / leaving / moving via Tab/Enter). Use it to persist the cell so a later mount can restore via `editingCell`.

```tsx
<BcGrid
  // ...
  editingCell={persistedState.editingCell ?? null}
  onEditingCellChange={(next) => persist({ editingCell: next })}
/>
```

If the row id was unknown when restore fires (e.g. the consumer's server data hasn't loaded yet), the restore is a no-op — re-trigger via `apiRef.current?.startEdit(...)` once data lands.

## Pattern: round-trip through localStorage

```tsx
import {
  useBcGridApi,
  type BcCellPosition,
  type BcGridLayoutState,
  type BcSelection,
} from "@bc-grid/react"
import { useCallback, useEffect, useRef, useState } from "react"

interface PersistedGridState {
  layout?: BcGridLayoutState
  selection?: BcSelection
  scrollOffset?: { top: number; left: number }
  expansion?: string[]
  editingCell?: BcCellPosition | null
}

const STORAGE_KEY = "my-app:customers-grid"

function useGridStatePersistence() {
  const [restored] = useState<PersistedGridState>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
    } catch {
      return {}
    }
  })
  const stateRef = useRef<PersistedGridState>(restored)

  const persist = useCallback((patch: Partial<PersistedGridState>) => {
    stateRef.current = { ...stateRef.current, ...patch }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateRef.current))
  }, [])

  return { restored, persist }
}

function CustomersGrid() {
  const apiRef = useBcGridApi<Customer>()
  const { restored, persist } = useGridStatePersistence()

  // Reconstruct expansion as a Set if present.
  const initialExpansion = restored.expansion ? new Set(restored.expansion) : undefined

  return (
    <BcGrid
      apiRef={apiRef}
      data={customers}
      columns={columns}
      rowId={(row) => row.id}
      // Layout (column state, sort, filter, search, density, etc.)
      initialLayout={restored.layout}
      onLayoutChange={(layout) => persist({ layout })}
      // Selection (uncontrolled with persistence)
      defaultSelection={restored.selection}
      onSelectionChange={(selection) => persist({ selection })}
      // Expansion
      defaultExpansion={initialExpansion}
      onExpansionChange={(expansion) =>
        persist({ expansion: [...expansion] })
      }
      // Scroll position — the v0.6.0-alpha.1 addition.
      initialScrollOffset={restored.scrollOffset}
      onScrollChange={(scrollOffset) => persist({ scrollOffset })}
      // Editing cell — restore on mount + persist on change.
      editingCell={restored.editingCell ?? null}
      onEditingCellChange={(editingCell) => persist({ editingCell })}
    />
  )
}
```

When the user navigates away and back, the grid restores to the exact pixel scroll position they left it at, with the same column widths, sort, filter, expansion, and selection.

## Pattern: snapshot on unmount instead of streaming

For consumers who prefer to write storage once when the user leaves rather than on every change, snapshot via `apiRef` on unmount:

```tsx
function CustomersGrid() {
  const apiRef = useBcGridApi<Customer>()

  useEffect(() => {
    return () => {
      const api = apiRef.current
      if (!api) return
      const snapshot = {
        // layout: derived from getColumnState + getFilter + ...
        scrollOffset: api.getScrollOffset(),
        selection: api.getSelection(),
      }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    }
  }, [apiRef])

  // ... initialScrollOffset / defaultSelection from sessionStorage
}
```

The streaming pattern (the first example) is what most apps want — it keeps storage current even on hard navigation (browser back, full reload, tab close). Snapshot-on-unmount is a fallback for consumers who can't afford to write on every scroll tick. The grid debounces `onScrollChange` to ~120ms internally so streaming is already cheap.

## Pattern: URL-backed state for shareable views

`urlStatePersistence` (existing — see `BcGridProps.urlStatePersistence`) writes layout state into the URL. Combine with `onScrollChange` + `getScrollOffset` for full URL-restored views — though encoding scroll position in the URL is usually not what you want (sharing a grid URL shouldn't pin the recipient to your scroll position). Most apps URL-persist layout but use storage for scroll + selection.

## What `onScrollChange` debounces

The callback fires ~120ms after the last scroll event (a single user-driven scroll action, no matter how long, fires `onScrollChange` exactly once). This:

- Coalesces a continuous scroll into one persist call.
- Stays short enough that a refresh mid-scroll restores within ~one tick of where the user actually was.
- Bounds the persist write rate so consumers using synchronous storage (localStorage, sessionStorage) don't degrade scroll FPS.

The 120ms interval is a constant in the grid; consumers wanting a different rate should debounce in their own callback (the grid's debounce is the floor, additional debounce stacks).

## What's NOT in the matrix

- **In-flight cell edits / overlay patches** — these are per-cell uncommitted state. Persisting them across navigation isn't useful (the user expects to see canonical row data on return; uncommitted edits should either be committed or discarded). If your app has long-lived edit drafts, persist them as your own canonical data, not as overlay state.
- **Editor portal mount state** — the editor unmounts on navigation. There's no useful "restore the open editor" surface.
- **Filter popup open state** — popups are transient; restoring "filter popup was open" on remount would be confusing UX.
- **Context menu open state** — same.

If a consumer wants any of these, file an issue with the use case — they're deliberately excluded so consumers don't accidentally restore confusing transient UI.
