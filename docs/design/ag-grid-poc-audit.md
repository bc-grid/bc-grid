# RFC: AG Grid POC Audit (ag-grid-poc-audit)

**Status:** Not started
**Owner:** TBD (claim from `docs/queue.md`)
**Reviewer:** fresh agent
**Purpose:** ground bc-grid's scope in what bc-next actually uses, not in AG Grid's full feature surface.

---

bc-grid risks becoming a generic AG Grid clone. The antidote: enumerate what the bc-next POC actually exercises, and scope bc-grid to *that*, with growing room.

## Method

For each of the following bc-next files (and any others using AG Grid):

- `apps/web/components/data-grid.tsx` — the AG Grid wrapper
- `apps/web/components/edit-grid.tsx` — DataGrid + actions column
- `apps/web/components/server-edit-grid.tsx` — server-paged variant
- Every file that imports from `@/components/data-grid` or `@/components/edit-grid`

Walk the source. For every prop, callback, column-def property, API call, theme variable used, AG Grid module enabled — record it.

## Output

Write to this file (replacing the current placeholder structure) with sections:

### A. Column-def properties used
List every property that appears on a `ColDef` anywhere in bc-next. Frequency count.

### B. Grid-level props used
Every `AgGridReactProps` prop the bc-next code passes through.

### C. Callbacks used
Every callback (`onGridReady`, `onCellClicked`, etc.) and what bc-next does in response.

### D. AG Grid API calls
Every imperative call against `GridApi` in bc-next code.

### E. Themes / CSS overrides
The `themeQuartz.withParams({...})` invocation; what gets overridden.

### F. Modules enabled
`AllEnterpriseModule` is registered at top of `data-grid.tsx`. Note which specific modules within enterprise are actually load-bearing (vs vestigial).

### G. Features absent from bc-next
Things AG Grid offers that bc-next doesn't use today (status bar, sidebar, tool panels, charts, range selection, pivots, etc.). These are bc-grid scope-deferral candidates — only build them if bc-next adopts them later.

### H. Recommendations for bc-grid scope

Cross-reference findings to bc-grid's package boundaries:

- Properties that map to `@bc-grid/core` types (column definition surface)
- Callbacks that map to `@bc-grid/react` events
- API calls that map to `BcGridApi` methods
- Modules / features that map to specific bc-grid packages (or are scope cuts)

End with a verdict: "Q1 vertical slice features needed = X, Y, Z." That list should be a strict subset of the Q1 milestone deliverables.

## Why this matters

The risk: bc-grid implements every AG Grid feature on autopilot, takes 3 years, and competes head-on with a 10-year incumbent. The opportunity: bc-grid implements exactly what bc-next (and similar ERPs) actually use, ships in 2 years with deeper polish on a smaller surface.

This audit is the difference.

## Estimated effort

1-2 days. Mostly mechanical: grep, count, summarise. Reading time + table-building.

## Acceptance criteria

- Every `data-grid.tsx` consumer enumerated
- Every prop / callback / API call / column property listed with frequency
- Cross-referenced to bc-grid packages
- Q1 scope reduced or confirmed based on findings
- Reviewer (fresh agent) signs off
