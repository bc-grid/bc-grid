# bc-grid — Architecture & Design v1

**Status:** Draft. The architect's bible.
**Last updated:** 2026-04-29
**Owner:** JohnC + lead architect agent
**Review cadence:** every Q1 sprint, then quarterly

This document is **the** source of truth for bc-grid's architecture. Every parallel agent must read it before writing code. Decisions in here are binding; changing them requires architect sign-off and a documented rationale appended to §13 (Decision Log).

---

## 1. Mission

Build a React data grid that can replace AG Grid Enterprise for ERP-class workloads:

- 60fps scroll at 100k rows × 30 columns on a mid-tier laptop
- 60fps animations on every state transition (sort, filter, group, insert, remove, expand, collapse, edit-commit)
- Excel-feel cell editing with full keyboard model
- Range selection with paste-from-Excel
- Server-side row model with infinite scroll, lazy tree children, block caching
- Native shadcn/Radix theming (not retrofit)
- Clean, semver-stable public API
- Zero AG Grid source code; clean-room implementation only from public docs and the user's own usage

**Timeline:** the v1.0 target is delivered in a **2-week parallel sprint** with 4 max-tier agents (compressed from the original 2-year plan; see §13 decision log entry 2026-04-29 for the scope+timeline pivot). v0.1-alpha (read-only, client-side, today's `main`) ships first; v1.0 covers the full feature parity scope.

**Goal shape:** functional parity with AG Grid Enterprise on the features 95% of ERP users need, **better than AG Grid does them** on the dimensions we care about (perf, animation, DX, theme). Bug-for-bug AG Grid parity (test-suite-level edge-case match) is not a v1.0 gate; that's a continuous post-1.0 backlog.

## 2. Non-goals (initial release)

- Frameworks beyond React. Vue/Solid/Angular bindings deferred indefinitely.
- Charts integration depth. Chart libraries are better at this; out-of-scope until post-1.0.
- Pivots in the AG Grid sense (full spreadsheet-like pivot UI). Aggregations + grouping at 1.0; pivot UI in 1.1+.
- Right-to-left languages. Q4 minimum.
- Mobile-first interactions. Desktop-first; touch fallback at 1.0+.
- Backwards compatibility with AG Grid's API. We're a competitor, not a polyfill.
- Bundling our own chart library, date library, or icon set. Use peer deps where appropriate.

## 3. Constraints

### 3.1 Browser support
- Chromium (Chrome, Edge, Opera, Brave) — current and current-1
- Firefox — current and current-1
- Safari — current and current-1
- No IE11. No legacy Edge.

### 3.2 Performance bars (CI-enforced)

These are the bars. Two tiers: **smoke** runs on every PR (must pass to merge); **nightly** runs heavier benchmarks against `main` (regressions block the next release).

#### Smoke (every PR)

| Metric | Target | Measured against |
|---|---|---|
| Cold mount (1k rows × 10 cols) | < 200ms | first contentful paint |
| Sort (10k rows) | < 50ms | end-to-end (click to next paint) |
| Scroll FPS (10k rows × 20 cols) | ≥ 58 | sustained over 1s scroll |
| Bundle size — `core` + `virtualizer` + `animations` + `react` | < 100KB gzipped, plus 10% per-PR drift guard from latest release baseline | rollup output |
| Edit-cell paint (commit → next paint) | < 16ms | RAF cycle |

#### Nightly (against `main`)

| Metric | Target | Measured against |
|---|---|---|
| Sort (100k rows) | < 100ms | end-to-end |
| Scroll FPS (100k rows × 30 cols) | ≥ 58 (target 60) | sustained over 2s scroll |
| Filter (100k rows) | < 100ms | end-to-end |
| **Grid overhead memory** (100k rows × 30 cols of typical width) | **< 30MB above raw dataset size** | heap snapshot diff (with grid mounted vs same data without) |
| **Animation visible+retained budget** | **100 rows in flight (default); 200 hard cap only with a Chrome trace proving it sustains 60fps in production** | viewport rows + animation handoff queue |

The memory metric measures grid *overhead* — the cost of having a bc-grid in your app vs the raw data sitting in JS. Total heap minus baseline-without-grid. This is what users actually experience.

The animation budget caps the number of rows we ever animate concurrently. We never animate 100k rows; we animate the rows in the viewport plus those still in transit (off-screen but holding their DOM node until the animation completes). The default ceiling is **100 rows** based on the animation-perf-spike measurements (`docs/design/animation-perf-spike-report.md`): 1,000 rows = 45 FPS (fail), 200 rows = 57 FPS (borderline), 100 rows = 60 FPS (pass on a 2024 M-series Mac in headless Chrome). Raising the cap to 200 requires a fresh Chrome trace on the target hardware showing sustained 60fps; otherwise, we hold at 100.

Benchmark harness in `apps/benchmarks/`. Smoke results logged to PR comments. Nightly results published to a perf-tracker service post-v1.0.

### 3.3 Dependency policy

**Allowed:**
- React 19+ as peer dep
- `@tanstack/react-table` (MIT) — state engine for Q1-Q2; reviewable after
- shadcn/Radix primitives — copied in via shadcn CLI, not runtime dep
- Lucide React — icon library, peer dep
- date-fns or similar (MIT) — for date utilities, peer dep
- TypeScript, Vite, Vitest, Bun — build/test tooling

**Forbidden:**
- GPL, AGPL, or any copyleft licence (we want commercial flexibility)
- AG Grid source code, derivatives, or paraphrased translations
- CSS-in-JS runtime libraries (styled-components, emotion). All styling via Tailwind + CSS variables.
- Animation libraries that would constrain our perf budget. We build our own FLIP utility.

**TanStack policy:** Use as peer dep, never expose its types in our public API. Adapter layer in `core/columns.ts` translates `BcGridColumn → TanStack ColumnDef`. If we ever want to swap the state engine, only the adapter changes; consumers see no diff.

### 3.4 Accessibility constraints (Q1 RFC required)

Accessibility informs architecture. The DOM-structure decisions made by the virtualizer determine what's possible for screen readers; adding ARIA after the fact means rebuilding the engine. So the WCAG 2.1 AA target shapes Q1 design choices, not Q7 polish.

Key constraints that need a Q1 RFC (`docs/design/accessibility-rfc.md`) before virtualizer implementation:

- **Role choice**: `role="grid"` vs `role="treegrid"` for grouped/tree data. Affects how AT announces row hierarchy.
- **`aria-rowcount` semantics**: total dataset (including unloaded server rows) vs rendered rows. AG Grid uses total. We need to declare.
- **`aria-rowindex` on partial sets**: the virtualizer renders ~50 of 100k rows; how does the screen reader know "row 47 of 100,000"?
- **Focus retention across virtualization**: when a focused row scrolls out of viewport, does focus stay on the row (and the row stays in DOM) or hand off to a placeholder?
- **Pinned rows/columns + ARIA**: order of announcement when pinned-left + center + pinned-right are visually adjacent but DOM-separate.
- **Keyboard navigation**: full grid-pattern keyboard model from WAI-ARIA Authoring Practices.

The accessibility RFC blocks `virtualizer-impl` and `react-impl-v0`. Land it in Q1 weeks 1-3.

## 4. Package architecture

### 4.1 Package boundaries (binding — enforced by CI)

Two layers: **engine** (framework-agnostic, depends only on `core`) and **React** (the consumer surface, brings everything together).

```
ENGINE LAYER (no React)
core ─┬─> virtualizer
      ├─> animations
      ├─> theming
      ├─> aggregations          (pure functions: sum/avg/count/min/max + custom)
      ├─> filters               (predicates, parsers, serializers)
      ├─> export                (CSV/Excel/PDF serializers, no DOM)
      └─> server-row-model      (state machine, fetcher contracts, cache, LRU)

REACT LAYER (consumes engines)
react (depends on every engine package + TanStack)
  └─ editors                    (React components: cell editors)
  └─ enterprise                 (pivots, master-detail — split engine vs React TBD)
```

Rules:
- `core` depends on **nothing** internal. Pure types + state contracts. No React, no DOM.
- **Engine packages** (`virtualizer`, `animations`, `theming`, `aggregations`, `filters`, `export`, `server-row-model`) depend on `core` only. No React. No DOM in `core`/`aggregations`/`filters`/`export`/`server-row-model`. The `virtualizer` and `animations` packages touch DOM but only via raw APIs (no React).
- `react` depends on `core` + every engine package + TanStack. Public API surface lives here.
- `editors` is React-only (cell editors are React components by definition); depends on `react`.
- `enterprise` is split: pivots + master-detail will have engine + React layers (Q5+ work).
- Feature packages **never depend on sibling feature packages**.
- CI lint enforces these boundaries with `dependency-cruiser` (or equivalent). PR fails on boundary violation.

**Why engine vs React adapter split:** every engine package is unit-testable without a DOM (Vitest in Node). React adapters have integration tests. Splitting the layers doubles parallelism on the heavy packages — one agent on the engine, one on the React adapter, no merge conflicts. It also means the engine surface stays useful if we ever ship Vue/Solid bindings.

### 4.2 What each package owns

#### `core`
- Public types: `BcGridColumn`, `BcGridApi`, `BcGridProps`, `BcRow`, `BcCellPosition`, `BcRange`, etc.
- State machines (sort, filter, group, expand, selection, edit) — protocol level only, no implementation
- Adapter to TanStack: `toTanStackColumnDef(col)`, `fromTanStackRow(row)`
- Event types and dispatchers
- No DOM, no React.

#### `virtualizer`
- Row virtualization (variable heights, pinned rows)
- Column virtualization (variable widths, pinned columns)
- Scroll-to-row, scroll-to-cell APIs
- Layout calculation (which rows / cells are in viewport at this scroll position)
- DOM scroll synchronization (via `requestAnimationFrame`)
- **NOT** TanStack Virtual — own implementation, because we need:
  - Variable row heights with pinned rows in the same viewport
  - Coordination with the animation system (a row animating out of viewport needs handoff)
  - Sub-pixel scroll precision for smooth animations
- **Single export**: a `Virtualizer` class. Framework-agnostic. The React hook (`useVirtualizer`) lives in `@bc-grid/react` and consumes this class — keeps `virtualizer` framework-free.

#### `animations`
- FLIP utility built on Web Animations API (`element.animate()`)
- Animation primitives: `flip(elements, options)`, `flash(element, options)`, `slide(element, direction, options)`
- Animation budget tracking (drops frames if budget exceeded; falls back to no-animation)
- Disables itself when `prefers-reduced-motion` is set
- ~500 LOC target. No external animation libraries.

#### `theming`
- CSS variables: `--bc-grid-bg`, `--bc-grid-fg`, `--bc-grid-border`, etc.
- Light/dark theme tokens
- Tailwind preset for consumer apps
- Density modes: compact / normal / comfortable
- Zero runtime CSS-in-JS. All styling via classes + variables.

#### `react`
- The public component surface: `<BcGrid>`, `<BcEditGrid>`, `<BcServerGrid>`
- Hooks: `useBcGrid()`, `useBcGridApi()`, `useCellEditor()`
- Public API frozen after Q1 (semver-stable from v0.1)
- Renders the chrome (header, footer, toolbar) with shadcn primitives

#### Engine packages (no React, depend on `core`)

- `aggregations` — pure functions for sum, avg, count, min, max + custom-aggregation contract. Returns `BcAggregationResult`. No DOM.
- `filters` — predicates + parsers + serializers (URL state, localStorage). For each filter type: a predicate (`(value, criteria) => boolean`) + a serialize/parse pair. UI components live in `@bc-grid/react`.
- `export` — pure serializers: `toCsv(rows, columns)`, `toExcel(rows, columns)` (via ExcelJS), `toPdf(rows, columns)` (via jsPDF or react-pdf). No React.
- `server-row-model` — state machine for paged / infinite / tree modes. Block cache + LRU eviction. Server fetcher contracts (`ServerQuery`, `ServerBlockResult`, `ServerTreeQuery`). No React. React adapters in `@bc-grid/react`.

#### React-only packages

- `editors` — built-in cell editor components: text, number, date, datetime, select, multi-select, autocomplete, custom. Depend on `react`. Each editor is a folder.

#### Future split (post-v1.0)

- `enterprise/pivots` — engine layer (pivot computation) + React layer (drag-to-pivot UI). Split TBD when work starts (Q5).
- `enterprise/master-detail` — mostly React; engine surface is small.

Each engine package is independently ownable by an agent. Strict interface to `core`; never depends on a sibling.

## 5. State management split

**Decision: TanStack Table v8 for state, wrapped behind our adapter.**

What TanStack handles:
- Sort state + sorted row model
- Filter state + filtered row model
- Pagination state + paginated row model
- Grouping state + grouped row model
- Expansion state
- Column state (visibility, order, sizing, pinning)
- Manual modes for server-side data
- Row selection state

What we add on top:
- Edit state (which cell is editing, dirty state, validation state) — bespoke
- Range selection state — bespoke
- Animation coordination — bespoke
- Server orchestration (block fetching, caching) — bespoke

What we wrap:
- TanStack types never appear in public API. Consumers see `BcGridColumn`, not `ColumnDef`.
- Adapter in `core/columns.ts` is the only place TanStack types appear in our codebase outside `react/internal`.

**Why TanStack and not custom:**
- 5 years of battle-tested state machines
- Saves 2-3 months of foundation work
- MIT licensed, no business risk
- Tanner Linsley's track record + active maintenance
- Easy to swap if we ever outgrow it (the adapter layer is the swap point)

**When we'd swap:**
- TanStack performance becomes a bottleneck (unlikely; the bottleneck will be DOM, not state)
- A specific feature requires bending TanStack internals in a way the API doesn't expose
- Licence change (extremely unlikely)

## 6. Virtualization strategy

**Decision: own implementation in `virtualizer/`. Not TanStack Virtual.**

### 6.1 Why not TanStack Virtual

TanStack Virtual is good for simple lists. It's not designed for:
- Variable row heights coordinated with pinned (frozen) rows in the same viewport
- Pinned columns that don't scroll while center columns do
- Animation handoff (rows that animate out of the viewport need to keep their DOM node briefly)
- Sub-pixel scroll for smooth animations

We could fork it and extend, but at that point we're maintaining the fork without the upstream's work helping us. Cleaner to write our own from first principles for our specific case.

### 6.2 Virtualization model

- **Row windowing**: track scroll position; calculate which row indexes are in viewport ± overscan; render only those rows.
- **Variable row heights**: we cache measured row heights in a sparse array. Unknown rows estimated from average height; corrected on render.
- **Pinned rows**: a fixed set of rows always rendered at top/bottom of the viewport. They're separate from the windowed body rows; rendered into separate DOM containers.
- **Column virtualization**: similar to rows but for columns. Less critical (most grids have < 100 columns) but needed for wide grids.
- **Pinned columns**: rendered into a `position: sticky` container that doesn't scroll horizontally while the center scrolls.
- **Scroll**: tracked via the body container's `scrollTop` / `scrollLeft`. State updated on scroll event throttled to RAF.

### 6.3 Layout (DOM structure)

```
.bc-grid                              (CSS Grid: rows = header / body / footer)
├── .bc-grid-header                   (sticky top, contains pinned + center column header)
│   ├── .bc-grid-header-pinned-left
│   ├── .bc-grid-header-center
│   └── .bc-grid-header-pinned-right
├── .bc-grid-body                     (scrollable container)
│   ├── .bc-grid-body-pinned-top      (sticky)
│   ├── .bc-grid-body-rows            (the virtualized scroll area)
│   │   ├── .bc-grid-row              (one per visible row)
│   │   │   └── .bc-grid-cell         (one per visible cell in this row)
│   │   └── ...
│   └── .bc-grid-body-pinned-bottom   (sticky)
└── .bc-grid-footer                   (sticky bottom, optional)
```

CSS Grid for the macro structure; absolute positioning for the virtualized rows inside `.bc-grid-body-rows`. Pinned columns via `position: sticky`.

### 6.4 Performance targets (covered in §3.2)

The Q1 perf spike must hit the bars before any feature work begins. If the spike misses, the architecture is wrong and we re-design before proceeding.

## 7. Animation strategy

**Decision: FLIP (First, Last, Invert, Play) on Web Animations API. Own implementation.**

### 7.1 What animates

- **Sort**: rows transition to their new positions. FLIP on row containers.
- **Filter**: rows that newly match fade in; rows that no longer match fade out.
- **Group expand/collapse**: child rows slide in/out from under the group header.
- **Row insert / remove**: new rows slide in; deleted rows slide out (with optional flash).
- **Cell flash**: when a cell value changes due to update (e.g., server push), the cell background flashes briefly.
- **Column move / resize**: column headers and cells transition smoothly.
- **Selection**: range selection grows/shrinks smoothly.

### 7.2 The FLIP pattern

For row reorder on sort:
1. **First**: capture each row's current position before the change.
2. **Last**: apply the change. New positions take effect.
3. **Invert**: for each row, calculate the delta; apply it as a `transform: translate(...)` so visually the row appears unchanged.
4. **Play**: animate the transform back to zero with `element.animate()` over ~250ms.

The Web Animations API runs on the compositor thread, off the main thread. As long as we only animate `transform` and `opacity`, animations stay 60fps.

### 7.3 Coordination with virtualization

A row that animates out of the viewport needs its DOM node retained until the animation finishes — but virtualization wants to remove out-of-viewport rows. Coordination protocol:

- The animation system registers "in-flight" row IDs.
- The virtualizer's "should this row be in the DOM?" decision becomes: `rowInViewport(id) || animationInFlight(id)`.
- When the animation finishes, the animation system unregisters the row; on the next layout, if it's still out of viewport, the virtualizer removes it.

### 7.4 Budget enforcement

If frame time exceeds 16ms during an animation, the animation system flags a performance regression. CI captures this; perf budget violations fail the build.

### 7.5 Reduced motion

`prefers-reduced-motion: reduce` disables all animations. Transitions become instant.

## 8. Theming

**Decision: CSS variables + Tailwind preset. shadcn-aligned tokens. Density modes.**

### 8.1 CSS variable tokens

```css
.bc-grid {
  --bc-grid-bg: hsl(var(--background));
  --bc-grid-fg: hsl(var(--foreground));
  --bc-grid-border: hsl(var(--border));
  --bc-grid-row-hover: hsl(var(--accent) / 0.5);
  --bc-grid-row-selected: hsl(var(--accent));
  --bc-grid-header-bg: hsl(var(--muted));
  --bc-grid-header-fg: hsl(var(--muted-foreground));
  --bc-grid-row-height: 36px;
  --bc-grid-header-height: 40px;
  --bc-grid-cell-padding-x: 12px;
}

.bc-grid--compact { --bc-grid-row-height: 28px; --bc-grid-cell-padding-x: 8px; }
.bc-grid--comfortable { --bc-grid-row-height: 44px; --bc-grid-cell-padding-x: 16px; }
```

Consumers override the standard shadcn tokens (`--background`, `--foreground`, etc.) once for their app; bc-grid picks them up automatically.

### 8.2 Custom theming

For consumers who want bc-grid's chrome to look different from the rest of their app: override the `--bc-grid-*` variables directly. Documented in `apps/docs/theming.md`.

### 8.3 No runtime CSS-in-JS

Reasoning: every JS-driven style insertion costs us frame time. With CSS variables we get full theming flexibility without a single runtime cost.

## 9. Public API surface (sketched — to be locked in `docs/api.md` end of Q1)

```tsx
import { BcGrid, BcEditGrid, BcServerGrid } from "@bc-grid/react"
import type { BcGridColumn, BcGridApi } from "@bc-grid/core"

const columns: BcGridColumn<Customer>[] = [
  { field: "code", header: "Code", width: 80, sortable: true, pin: "left" },
  { field: "name", header: "Name", flex: 1, filter: { type: "text" } },
  { field: "balance", header: "Balance", width: 120, align: "right",
    aggregation: "sum", format: "currency" },
]

// Read-only grid
<BcGrid
  data={rows}
  columns={columns}
  rowId={(row) => row.id}
  density="normal"
  pagination={{ pageSize: 50 }}
  groupBy="region"
/>

// Edit grid (composes BcGrid + actions column)
<BcEditGrid
  data={rows}
  columns={columns}
  detailPath="/customers"
  onEdit={(row) => ...}
  onDelete={(row) => ...}
/>

// Server grid (server-side row model)
<BcServerGrid
  columns={columns}
  loadRows={async (query) => fetchRows(query)}
  totalRowsHint={5000}
  pageSize={100}
  // or: rowModel="infinite" for infinite scroll
/>
```

API design principles:
- **Composition over flags**: features come from sub-components and slots, not boolean props.
- **Convention over config**: defaults that work for 80% of cases; opt-in for the rest.
- **Type-safe everywhere**: `<BcGrid<Customer>>` is parameterized; column `field` autocompletes against keys of `Customer`.
- **No imperative API except where necessary**: most state via props/callbacks; imperative `BcGridApi` ref for things that genuinely need it (scroll-to, focus-cell, get-selected).
- **No render props for hot paths**: cells render via the column's `render` function (memoized), not slot composition.
- **Stable across versions**: every API addition reviewed for "is this consistent with the rest of the surface?"

## 10. Server-side row model (Q4 deliverable)

Three modes:

### 10.1 Server-paged (simple)
Pagination + sort + filter on server. Each page swap = one fetch. `loadPage`
receives `pageIndex`, `pageSize`, and the `ServerViewState` (`sort`, `filter`,
`search`, `groupBy`, `visibleColumns`). It returns the current page rows plus
`totalRows`; the React adapter uses that server total for page count and does
not client-slice the returned page.

```tsx
<BcServerGrid
  columns={columns}
  loadPage={async ({ pageIndex, pageSize, view }, { signal }) => ...}
  pageSize={50}
  rowModel="paged"
/>
```

### 10.2 Server-infinite (block-cached)
Infinite scroll. Rows fetched in blocks (e.g., 100 rows at a time). Blocks cached; eviction via LRU when memory budget exceeded. Virtualization renders from cache.

```tsx
<BcServerGrid
  columns={columns}
  loadBlock={async ({ blockStart, blockSize, sort, filter }) => ...}
  rowModel="infinite"
  blockSize={100}
  cacheBlocks={20}
/>
```

### 10.3 Server-tree (lazy children)
Tree data with on-demand children fetch. Expanding a parent fetches its immediate children.

```tsx
<BcServerGrid
  columns={columns}
  loadRoots={async (query) => ...}
  loadChildren={async (parentId, query) => ...}
  rowModel="tree"
/>
```

All three modes share the underlying state machine; only the row-fetching strategy differs.

## 11. Editing model (Q2 deliverable)

### 11.1 Cell-edit lifecycle

1. **Activation**: user double-clicks cell, presses F2, or starts typing on a focused cell.
2. **Editor mounts**: the column's `editor` component renders in place of the cell. Original value passed in.
3. **User edits**: editor fully owns the input UI. Standard editors provide validation hooks.
4. **Commit**: Enter or Tab → editor calls `commit(newValue)`. Or Esc → `cancel()`.
5. **Pre-commit validation**: the column's optional `validate(newValue, row)` runs. Returns `{ valid: true }` or `{ valid: false, error: string }`.
6. **Persist**: if valid, the new value is set in the row model. If `onCellEdit` is provided, it's called (consumer can persist to server, return a Promise for "in-flight" UI).
7. **Editor unmounts**: cell goes back to display mode. Focus moves to the next cell per the keyboard model.

### 11.2 Keyboard state machine

| Mode | Key | Action |
|---|---|---|
| Cell focused | Enter / F2 | enter edit mode |
| Cell focused | Type any character | enter edit mode, character becomes first input |
| Cell focused | Arrow keys | move focus |
| Cell focused | Tab / Shift+Tab | move focus right/left, wrap at row edge |
| Cell focused | Ctrl+Arrow | jump to data edge |
| Editing | Enter | commit, move focus down |
| Editing | Tab / Shift+Tab | commit, move focus right/left |
| Editing | Esc | cancel, return to cell-focused mode |
| Editing | F2 | toggle to "select inside editor" sub-mode (advanced) |

### 11.3 Editor framework

```tsx
interface CellEditor<TValue> {
  initialValue: TValue
  row: TRow
  column: BcGridColumn<TRow>
  commit(newValue: TValue): void
  cancel(): void
  // ... refs for focus, etc.
}

// Each editor is a React component that receives these props and renders.
// Built-in editors: text, number, date, datetime, select, multi-select, autocomplete.
// Custom editors: any component that implements the interface.
```

Editor framework lives in `core/editor.ts` (the protocol) and `react/editor.tsx` (the React adapter). Each individual editor lives in `editors/text`, `editors/date`, etc.

## 12. Range selection (Q3 deliverable)

The hardest single thing. Excel-feel.

- **Click + drag**: starts a single range from anchor to current.
- **Shift+click**: extends current range to clicked cell.
- **Ctrl+click**: starts a new range, accumulating multi-range.
- **Shift+Arrow**: extends range one cell.
- **Ctrl+Shift+Arrow**: extends range to data edge.
- **Copy** (Ctrl+C): serialize selection to TSV (and HTML) on the clipboard.
- **Paste** (Ctrl+V): parse clipboard TSV; apply to anchored cell extending right and down. Validate per-column. Atomic apply — either all cells valid or rollback (with error toast).
- **Fill handle**: small drag-square at bottom-right of the active range. Drag to extend; release to fill (linear / copy / smart-fill).

Implemented as a state machine in `core/range.ts` consumed by `react/range.tsx`. The visual rendering (selection rectangle, fill handle) is a layer on top of the cell grid, positioned absolutely.

## 13. Decision log

Any architectural change to this document must:
1. Append a row to this log: date, decision, rationale, who.
2. Get architect sign-off before merging.

| Date | Decision | Rationale | Who |
|---|---|---|---|
| 2026-04-29 | Initial design | Foundation laid; original timeline 2-year build (compressed to 2-week parallel sprint per the 2026-04-29 scope+timeline pivot below) | JohnC + Claude |
| 2026-04-29 | **Engine vs React adapter split**: `aggregations`, `filters`, `export`, `server-row-model` move from "feature packages depending on react" to engine packages depending on `core` only. React adapters live in `@bc-grid/react`. | Engine packages are unit-testable without DOM (Vitest in Node); doubles parallelism on heavy packages; preserves engine surface for non-React bindings later. | Codex review |
| 2026-04-29 | **`useVirtualizer` hook moves to `@bc-grid/react`**, `virtualizer` package keeps only the framework-agnostic `Virtualizer` class. | The original §4.2 was self-contradictory: virtualizer claimed no React but exported a hook. Resolution keeps the package framework-free. | Codex review |
| 2026-04-29 | **Naming standardised on `@bc-grid/*`**: every package is `@bc-grid/<name>`. Consumer-facing import is `@bc-grid/react`. README/api docs aligned. | Earlier doc mixed `bc-grid/react` and `@bc-grid/*` — inconsistent. | Codex review |
| 2026-04-29 | **Performance bars split into smoke (every PR) + nightly**. Memory metric becomes "grid overhead above raw dataset" not total heap. Animation budget capped at ≤200 rows in flight. | Original bars were directionally right but underspecified. Smoke vs nightly keeps PR latency low; overhead-vs-heap is what users actually experience; explicit animation cap prevents pathological case of "animate 100k rows." | Codex review |
| 2026-04-29 | **Accessibility moves to Q1 RFC**, not Q7 audit. | Virtualization + pinned panes are architectural; aria-rowindex / focus retention / treegrid role choices can't be retrofit. | Codex review |
| 2026-04-29 | **Server-row-model RFC happens in Q1**, implementation still Q4. | The server query contract is the hardest API surface for ERP and informs row identity, edits, selection, export — Q4 is too late to design. | Codex review |
| 2026-04-29 | **Q1 scope reduced**: from "feature-complete read-only grid" to a hardened vertical slice (typed columns + row identity + virtualized body + pinned columns + keyboard focus + basic sort + theming + CI/perf gates). Filter, search, group-by, server-paged grid, full column-state move to Q2. | Original Q1 was too broad to deliver in 12 weeks at quality. Vertical slice proves architecture on one real bc-next screen. | Codex review |
| 2026-04-29 | **Real `api.md` spec written in Q1, not deferred to Q1 end.** New task `api-rfc-v0` ready to claim. | Spec defines BcGridColumn shape, row ID rules, controlled/uncontrolled state, event names, query objects, value getter/formatter/parser contracts, editor protocol, public exports. Agents need this stable before building. | Codex review |
| 2026-04-29 | **Virtualized focus uses `aria-activedescendant`**, not roving `tabindex` on individual cells. | DOM focus stays stable on the grid root while the virtualizer retains the active cell element, which avoids focus loss when rows scroll out of the normal render window. | accessibility-rfc review |
| 2026-04-29 | **Tab exits the grid in navigation mode.** | bc-grid follows the WAI-ARIA grid pattern for read-only navigation; editor-specific Tab commit/move behavior is deferred to the Q2 editor contract. | accessibility-rfc review |
| 2026-04-29 | **Virtualizer must expose accessibility retention hooks.** `Virtualizer` needs retained row/column inputs, `scrollToCell`, and a visibility query for active cells. | The React layer cannot maintain valid `aria-activedescendant`, `aria-rowindex`, pinned-column DOM order, or focus-retention behavior without explicit virtualizer support. | accessibility-rfc review |
| 2026-04-29 | **Animation in-flight cap lowered: 100 default, 200 hard cap only with measured proof.** Replaces the original "≤200 rows in flight" bar. | `animation-perf-spike` (#11) measured FLIP perf on a 2024 M-series Mac in headless Chrome: 1,000 rows = 45 FPS, 200 rows = 57 FPS, 100 rows = 60 FPS. 200 was directionally close but borderline; 100 is the safe default. Raising the cap requires fresh hardware-specific evidence rather than asserting it on the original assumption. | animation-perf-spike review |
| 2026-04-29 | **CSS class convention: kebab-case for elements, `data-*` for state, `--` only for top-level density modifiers.** Elements: `.bc-grid`, `.bc-grid-scroller`, `.bc-grid-canvas`, `.bc-grid-row`, `.bc-grid-cell`. Cell variants: `.bc-grid-cell-pinned-left`, `.bc-grid-cell-pinned-right`, `.bc-grid-cell-pinned-top`, `.bc-grid-cell-pinned-bottom`. State: `data-density="compact|normal|comfortable"`, `data-bc-grid-active-cell="true"`, `aria-selected`, `aria-invalid`. Density modifiers retain `.bc-grid--compact` etc. for back-compat with the spike but `data-density` is preferred. **Forbidden:** BEM `__` element separator (e.g., `.bc-grid__row`). | The virtualizer (PR #9) and theming-impl (PR #15) drifted to different conventions during parallel work — virtualizer to kebab, theming to BEM. Without a single rule, react-impl-v0 would mount virtualizer DOM that the theming CSS doesn't style. Kebab matches AG Grid's `.ag-row` / `.ag-cell` (the precedent for data-grid CSS users will recognise), the shadcn / Tailwind ecosystem, and is shorter (matters at scale — hundreds of cells per grid). The `bc-grid-` prefix already disambiguates "grid-block, row-element" without needing `__`. | virtualizer-impl-plan review |
| 2026-04-29 | **Cumulative offsets backed by Fenwick tree.** The virtualizer stores row heights / column widths in a `FenwickTree` (`Float64Array`-backed, 0-indexed public API, 1-indexed internal). `prefixSum(i)`, `set(i, v)`, `add(i, delta)`, `upperBound(target)` are all O(log N). Replaces the spike's flat-array cumulative cache with O(N) rebuild. | The flat-array rebuild dominated cost when row heights changed frequently (editable grids re-measuring on commit; auto-sized rows). Fenwick trades O(1) lookup for O(log N) lookup but kills the rebuild — at 100k rows, log N ≈ 17 ops vs the rebuild's 100k ops on every height change. | virtualizer-impl review |
| 2026-04-29 | **In-flight retention is reference-counted, index-keyed, idempotent.** `Virtualizer.beginInFlightRow(i): InFlightHandle` increments a per-index counter; `release()` decrements; `computeWindow()` emits any row with count > 0 regardless of scroll position. Multiple concurrent handles per index compose. Calling `release()` twice has no effect. | Animation primitives (`flip()` from `@bc-grid/animations`) need a way to hold a row's DOM node steady through animations that start in viewport but end outside. Without this, the renderer's free-list recycles the node mid-flight and the animation fails. Reference counting handles concurrent animations on the same row; idempotent release survives `Promise.finally` double-invocations. | virtualizer-impl review |
| 2026-04-29 | **Pinned cells use JS-driven `translate3d`, not CSS sticky.** Every cell is `position: absolute` at its column offset; pinned cells additionally apply `transform: translate3d(scrollLeft, 0, 0)` (left) or `translate3d(scrollLeft + viewportWidth - totalWidth, 0, 0)` (right) to cancel the canvas's horizontal scroll. Pinned rows mirror this on the Y axis. Transforms are recomputed synchronously in the scroll handler so pinned regions don't lag a frame. | CSS sticky has a layout bug here: cells without explicit absolute positioning fall into block flow and stack vertically. Setting `position: sticky` plus an inset value also doesn't compose cleanly when the row is itself absolute and full canvas width. JS-driven translate sidesteps all of that and is portable across Chromium / Firefox / WebKit (all 35 e2e tests pass). | virtualizer-impl review |
| 2026-04-29 | **Pinned rows render at z-index 3, pinned cells at z-index 2.** Body rows + cells use the default. | Stacking corner cells (pinned row × pinned col) above all body content + body-row pinned cells. The cell's z-index is relative to siblings inside the row; the row's z-index 3 raises the entire row (including the corner cell) above content at z-index 2 elsewhere. | virtualizer-impl review |
| 2026-04-29 | **`ResizeObserver` coalesces to one render per RAF.** A `resizePending` flag guards the actual work; the first observed change schedules a single `requestAnimationFrame`, subsequent changes within the same frame are dropped. | Without this, continuous drag-resize fires the observer at sub-frame frequency, compounding the linear-in-cell-count re-render cost unboundedly. The Playwright test fires 10 rapid synchronous size changes and asserts render count grows by ≤ 3 (vs unthrottled 10). | virtualizer-impl review |
| 2026-04-29 | **Index ↔ row ID translation is the React layer's responsibility, not the engine's.** The virtualizer's retention sets remain index-keyed; the React layer translates `RowId` → index at the boundary. | Index-keyed sets are O(1) lookup with no allocation; rowId-keyed would force a `Map<RowId, Set<unknown>>` and an extra hop per render. Row-identity invariants under sort/filter/edit are a React-layer concern (it knows the row model); the engine can stay row-model-agnostic. If post-mutation row identity invariants force the engine to be rowId-aware, that's a v0.2 migration — `VirtualOptions` is already named to anticipate the deprecation cycle. | virtualizer-impl review |
| 2026-04-29 | **Scope + timeline pivot for v1.0:** functional parity with AG Grid Enterprise for ERP workloads, delivered in a **2-week parallel sprint with 4 max-tier agents** instead of the original 8-quarter (24-month) calendar. Velocity demonstrated: ~10-20% of the original 2-year scope shipped in day 0 (Q1 vertical-slice gate cleared via #42). **What changes:** Q5-Q7 feature scope (aggregations, pivots, status-bar, sidebar/tool-panels, context menu, CSV/XLSX/PDF export, streaming row updates, mobile/touch fallback, WCAG deep pass) pulled forward into the same sprint as Q2-Q4 (editing, range selection, server-row-model). **What stays:** every architectural decision in this §13 log; engine vs React split; kebab-case CSS; api.md v0.1 freeze; `accessibility-rfc` ARIA contracts; perf bars from §3.2; AGENTS.md golden rules. **What's still out:** charts integration (post-1.0 peer-dep adapter), RTL (post-1.0), spreadsheet-class formula editing (deferred), bug-for-bug AG Grid edge-case parity (we ship feature parity, not test-suite parity), mobile-first (touch fallback only). Active orchestration plan is `docs/coordination/v1-parity-sprint.md`. | JohnC + c2 (auditor) |
| 2026-04-30 | **Bundle-size per-PR regression cap raised 5% → 10% for the v1 parity sprint.** The 60 KB total budget (`§3.2 Smoke`) is unchanged. Rationale: the `@bc-grid/react` surface is *intentionally* growing during Tracks 1-7 (editor framework, filters, aggregations, server row model, pivot/chrome UI, etc.). At the previous +5%-per-PR cap, legitimate feature PRs were getting blocked by sub-kilobyte regressions despite ~18 KB of total-budget headroom remaining (#136 column-reorder blocked at +538 B / 1.7%). The total budget is the real perf bar; the per-PR cap is a drift-prevention proxy that fires too aggressively when the API surface is supposed to be growing. | JohnC + c5 (reviewer) |
| 2026-05-01 | **Charts clarified as post-1.0.** Earlier sprint text temporarily treated charts as a v1.0 peer-dep adapter. That was over-scoped for the ERP grid 1.0 target. v1.0 now excludes chart adapter work; `docs/design/charts-rfc.md` remains as a post-1.0 planning draft. | JohnC + Codex coordinator |
| 2026-04-30 | **Bundle-size hard cap raised 60 KB → 100 KB after `v0.1.0-alpha.2`.** Alpha.2 shipped at 57.75 KiB gzip for `core+virtualizer+animations+react`, leaving too little room for deliberate v1 parity features such as pivot/group UI without blocking the merge train. The hard cap is now 100 KiB, but baselines reset to alpha.2 exact package sizes and the 10% per-PR drift guard remains. This lets substantial features land while still forcing review of sudden multi-KiB jumps. | JohnC + Codex coordinator |

## 14. Quality bars (full list)

### 14.1 Code quality (every PR)
- TypeScript strict, no `any` outside the TanStack adapter
- Public API additions need a doc comment with a usage example
- Public API breakages require version bump + changelog entry
- Test coverage gates: 90% on `core`, 85% on `virtualizer` and `animations`, 75% on `react`, 70% on feature packages
- No `console.log` in shipped code; use the logger contract from `core/log.ts`

### 14.2 Performance (every PR)
- See §3.2. Benchmarks fail builds.

### 14.3 Visual regression (animations)
- Each animation type has a recorded reference. Visual snapshots compared per PR. Drift > threshold flags review.

### 14.4 Accessibility
- ARIA roles: `grid`, `row`, `gridcell`, `columnheader`, etc.
- Keyboard-navigable for every interaction
- Screen reader testing in CI (axe + manual passes per phase)
- WCAG 2.1 AA target

## 15. Test strategy

- **Unit** (per-package): Vitest. Covers state machines, adapters, utilities.
- **Integration** (cross-package): Vitest + React Testing Library. Covers `react` package's component composition.
- **E2E** (whole grid): Playwright. Covers user flows (sort, filter, edit, range, export).
- **Performance**: custom harness in `apps/benchmarks/`. Runs in CI; numbers reported.
- **Visual regression**: Playwright screenshots + animation recording. Diffs flag review.
- **Accessibility**: axe-core in CI; manual screen-reader passes per phase.

Test infrastructure (CI, runners, reporters) is itself the work of one of the Q1 agents.

## 16. Open questions (resolve in Q1)

- **Virtualization rendering: DOM or canvas?** Default plan: DOM (better DX, accessibility, easier debug). Canvas only if DOM can't hit perf bars at 100k rows. Q1 spike will decide.
- **Animation library: Web Animations API or Motion One?** Default: Web Animations directly. Motion One is a thin wrapper; may save us code if it's fast enough. Q1 spike will decide.
- **Bundler: Vite + Rollup, or tsup, or unbuild?** Default: tsup (simplest config for libraries). Vite for `apps/docs` and `apps/examples`.
- **Test runner: Vitest or Bun test?** Default: Vitest (better React integration). Bun test for `core` (no React needed).
- **Monorepo tool: bare bun workspaces or Turborepo?** Default: bare bun workspaces (simpler). Add Turborepo if build orchestration becomes painful.

## 17. References

- AG Grid documentation: https://www.ag-grid.com/react-data-grid/ (read public docs only, never source)
- TanStack Table v8: https://tanstack.com/table/v8
- TanStack Virtual: https://tanstack.com/virtual/v3 (we don't use, but study)
- FLIP technique: https://aerotwist.com/blog/flip-your-animations/
- Web Animations API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API
- Excel keyboard model: https://support.microsoft.com/en-us/office/keyboard-shortcuts-in-excel-1798d9d5-842a-42b8-9c99-9b7213f0040f

---

**This is a living document. Every architectural decision touches it. Update it when you decide; review it when you start.**
