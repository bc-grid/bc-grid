# React Impl v0 - Plan

**Status:** Draft, initial scaffold in progress
**Owner:** x1 (Codex)
**Branch:** `agent/x1/react-impl-v0`
**Depends on:** `core-types` (merged), `virtualizer` public surface alignment (merged in #20), `animations-impl` (merged), `theming-impl` (#15, review)
**Effort:** 1 week per `queue.md`

---

## 1. Scope

`react-impl-v0` creates the first consumer-facing React package. The goal is a working read-only `<BcGrid>` that proves the package boundary, public types, imperative API, accessibility skeleton, and virtualizer integration can converge before the feature tasks add sort, keyboard focus, pinned-column polish, and the Q1 demo.

This task ships:

- `@bc-grid/react` exports matching `docs/api.md` sections 1.3, 5, 6, 7, and 9.
- A read-only `<BcGrid>` that renders client-side rows and columns through `@bc-grid/virtualizer`.
- `BcEditGrid` and `BcServerGrid` shells with the frozen prop surfaces, forwarding to `<BcGrid>` where implementation is not ready.
- `useBcGridApi()` plus `apiRef` population for scroll, focus, lookup, and state access.
- The root ARIA grid skeleton: one tab stop, `aria-rowcount`, `aria-colcount`, header/body rowgroups, `aria-rowindex`, `aria-colindex`, and `aria-activedescendant`.
- Kebab-case renderer classes aligned with `design.md §13` and PR #18.

This task does not ship:

- TanStack-backed sort/filter/group/pagination row models. Those land in follow-up feature tasks.
- Full keyboard model. `q1-keyboard-focus` owns the WAI-ARIA key matrix and screen-reader verification.
- Pinned column final behavior. The scaffold passes pinned counts to the virtualizer; `q1-pinned-cols` owns the UX hardening.
- Editing, range selection, master-detail, or server-row-model behavior.
- Animation integration beyond leaving the API boundary ready for `@bc-grid/animations`.

## 2. Preconditions and Current State

Merged prerequisites:

- `core-types` (#14): public framework-agnostic types live in `@bc-grid/core`.
- `animations-impl` (#16): animation primitives are available for later feature integration.
- `virtualizer-spike-v2` (#9) and surface alignment (#20): the stable `Virtualizer`, `VirtualOptions`, `VirtualRow`, `VirtualCol`, and ARIA metadata names are available.

Parallel prerequisite:

- `theming-impl` (#15): React will use the agreed kebab-case classes now. Until #15 merges, the component also carries enough inline layout style to mount and exercise virtualization.

## 3. Implementation Slices

### 3.1 Public Types and Exports

Create `packages/react/src/types.ts` with:

- `BcReactGridColumn` exported as consumer-facing `BcGridColumn`.
- `BcCellRendererParams`.
- `BcGridProps`, `BcEditGridProps`, `BcServerGridProps`.
- Editor protocol types from `api.md §7`.
- React filter UI protocol types from `api.md §4.4`.
- Selected `@bc-grid/core` re-exports from `api.md §9`.

Acceptance:

- Consumers can import every name listed under `@bc-grid/react` in `api.md §9`.
- No TanStack types appear in the public surface.
- `@bc-grid/core` remains React-free.

### 3.2 `<BcGrid>` Shell

Implement `BcGrid` with:

- Required `data`, `columns`, and `rowId`.
- Visible-column resolution: `columnId`, hidden columns, pinned ordering, width defaults, and column state width overrides.
- Row identity maps for `rowId -> index` and `columnId -> index`.
- Virtualizer-backed body rendering using `computeWindow()`.
- Header rendering with synced horizontal scroll.
- Default value pipeline: `valueGetter`, `valueFormatter`, `format`, `cellRenderer`, `cellClass`, `cellClassName`, and `cellStyle`.
- Click-to-focus cell state, `onCellFocus`, and `aria-activedescendant`.
- `apiRef` methods required by `BcGridApi`.

Acceptance:

- A grid with 1k rows and 10 columns mounts and scrolls with bounded DOM nodes.
- `scrollToRow`, `scrollToCell`, `focusCell`, `isCellVisible`, `getRowById`, `getActiveCell`, `getSelection`, and `getColumnState` behave for the scaffold row model.
- Controlled and uncontrolled state pairs reject mixed usage at runtime.

### 3.3 `BcEditGrid` Shell

Compose `BcGrid` and add only Q1-safe behavior:

- Optional detail-link rendering for `detailPath` + `linkField`.
- Optional pinned-right actions column for edit/delete/extra actions.
- Keep in-grid editing reserved for Q2.

Acceptance:

- Existing `BcGridProps` pass through unchanged.
- `onCellEditCommit` is typed but unused until Q2.

### 3.4 `BcServerGrid` Shell

Expose the frozen server prop surface without implementing the row model:

- Paged mode renders `initialResult.rows` when provided.
- Infinite and tree modes render an empty loading grid until the server-row-model package is implemented.
- `apiRef` exposes `BcServerGridApi` methods as no-op or delegated scaffold methods.

Acceptance:

- The server loader types come from `@bc-grid/core` and are re-exported through `@bc-grid/react`.
- No network fetching happens in the shell.

## 4. Integration Contracts

### 4.1 With `@bc-grid/virtualizer`

React owns row IDs and column IDs. The virtualizer owns indexes and geometry. The React layer translates:

- `RowId` -> row index before calling `scrollOffsetForRow` or `isCellVisible`.
- `ColumnId` -> column index before calling `scrollOffsetForCol` or `isCellVisible`.
- Active cell -> retained row/column indexes while the grid has focus.

The scaffold uses the stable surface from #20 and must not depend on Claude's Fenwick/in-flight/ResizeObserver internals.

### 4.2 With `@bc-grid/theming`

React emits these selectors:

- `.bc-grid`
- `.bc-grid-scroller`
- `.bc-grid-canvas`
- `.bc-grid-header`
- `.bc-grid-row`
- `.bc-grid-cell`
- `.bc-grid-cell-right`

Theming owns final visual styling. React owns only geometry-critical inline styles required for virtualization.

### 4.3 With Future Feature Tasks

Follow-up tasks build on the shell without changing the frozen public surface:

- `q1-sort`: wire TanStack/manual sort state, header affordances, and FLIP animation.
- `q1-keyboard-focus`: complete the WAI-ARIA keyboard matrix.
- `q1-pinned-cols`: harden pinned-left/right rendering and screen-reader order.
- `q1-vertical-slice-demo`: replace one bc-next screen with the package.

## 5. Risks

- The server grid shell is intentionally shallow. It must not imply that cache, invalidation, block loading, or optimistic edits work yet.
- The initial React renderer duplicates some layout math that `DOMRenderer` also knows. If the DOMRenderer gains a React-friendly adapter later, this can collapse behind the same public component.
- `theming-impl` is still in review while this starts. Kebab-case is already the design decision, so this branch should not revive BEM selectors.

## 6. Acceptance Criteria

- `bun run type-check`, `bun run lint`, `bun run build`, and `bun test` pass from a clean branch.
- `@bc-grid/react` builds declarations for all public types.
- `<BcGrid>` renders a virtualized read-only grid without requiring any unmerged virtualizer internals.
- The plan explicitly marks deferred work so reviewers can block on missing scaffold details, not on future feature scope.
