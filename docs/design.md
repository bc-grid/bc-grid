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

The 2-year target is **not** 100% AG Grid feature parity. It is a focused product that does the 80-90% of features 95% of users need, **better than AG Grid does them** on the dimensions we care about (perf, animation, DX, theme).

## 2. Non-goals (initial release)

- Frameworks beyond React. Vue/Solid/Angular bindings deferred indefinitely.
- Charts integration depth. Chart libraries are better at this; out-of-scope until 1.0+.
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
| Bundle size — `core` + `virtualizer` + `animations` + `react` | < 60KB gzipped | rollup output |
| Edit-cell paint (commit → next paint) | < 16ms | RAF cycle |

#### Nightly (against `main`)

| Metric | Target | Measured against |
|---|---|---|
| Sort (100k rows) | < 100ms | end-to-end |
| Scroll FPS (100k rows × 30 cols) | ≥ 58 (target 60) | sustained over 2s scroll |
| Filter (100k rows) | < 100ms | end-to-end |
| **Grid overhead memory** (100k rows × 30 cols of typical width) | **< 30MB above raw dataset size** | heap snapshot diff (with grid mounted vs same data without) |
| **Animation visible+retained budget** | ≤ 200 rows in flight at once | viewport rows + animation handoff queue |

The memory metric measures grid *overhead* — the cost of having a bc-grid in your app vs the raw data sitting in JS. Total heap minus baseline-without-grid. This is what users actually experience.

The animation budget caps the number of rows we ever animate concurrently. We never animate 100k rows; we animate the rows in the viewport plus those still in transit (off-screen but holding their DOM node until the animation completes). 200 is a hard ceiling.

Benchmark harness in `apps/benchmarks/`. Smoke results logged to PR comments. Nightly results published to a perf-tracker service (Y1).

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

#### Future split (Y2)

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
Pagination + sort + filter on server. Each page swap = one fetch. Uses TanStack's `manualPagination + manualSorting + manualFiltering`.

```tsx
<BcServerGrid
  columns={columns}
  loadRows={async ({ page, pageSize, sort, filter }) => ...}
  totalRowsHint={total}
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
| 2026-04-29 | Initial design | Foundation laid for 2-year build | JohnC + Claude |
| 2026-04-29 | **Engine vs React adapter split**: `aggregations`, `filters`, `export`, `server-row-model` move from "feature packages depending on react" to engine packages depending on `core` only. React adapters live in `@bc-grid/react`. | Engine packages are unit-testable without DOM (Vitest in Node); doubles parallelism on heavy packages; preserves engine surface for non-React bindings later. | Codex review |
| 2026-04-29 | **`useVirtualizer` hook moves to `@bc-grid/react`**, `virtualizer` package keeps only the framework-agnostic `Virtualizer` class. | The original §4.2 was self-contradictory: virtualizer claimed no React but exported a hook. Resolution keeps the package framework-free. | Codex review |
| 2026-04-29 | **Naming standardised on `@bc-grid/*`**: every package is `@bc-grid/<name>`. Consumer-facing import is `@bc-grid/react`. README/api docs aligned. | Earlier doc mixed `bc-grid/react` and `@bc-grid/*` — inconsistent. | Codex review |
| 2026-04-29 | **Performance bars split into smoke (every PR) + nightly**. Memory metric becomes "grid overhead above raw dataset" not total heap. Animation budget capped at ≤200 rows in flight. | Original bars were directionally right but underspecified. Smoke vs nightly keeps PR latency low; overhead-vs-heap is what users actually experience; explicit animation cap prevents pathological case of "animate 100k rows." | Codex review |
| 2026-04-29 | **Accessibility moves to Q1 RFC**, not Q7 audit. | Virtualization + pinned panes are architectural; aria-rowindex / focus retention / treegrid role choices can't be retrofit. | Codex review |
| 2026-04-29 | **Server-row-model RFC happens in Q1**, implementation still Q4. | The server query contract is the hardest API surface for ERP and informs row identity, edits, selection, export — Q4 is too late to design. | Codex review |
| 2026-04-29 | **Q1 scope reduced**: from "feature-complete read-only grid" to a hardened vertical slice (typed columns + row identity + virtualized body + pinned columns + keyboard focus + basic sort + theming + CI/perf gates). Filter, search, group-by, server-paged grid, full column-state move to Q2. | Original Q1 was too broad to deliver in 12 weeks at quality. Vertical slice proves architecture on one real bc-next screen. | Codex review |
| 2026-04-29 | **Real `api.md` spec written in Q1, not deferred to Q1 end.** New task `api-rfc-v0` ready to claim. | Spec defines BcGridColumn shape, row ID rules, controlled/uncontrolled state, event names, query objects, value getter/formatter/parser contracts, editor protocol, public exports. Agents need this stable before building. | Codex review |

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
