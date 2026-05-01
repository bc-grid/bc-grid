# Coordinator Findings — bc-grid Audit 2026-05

**Author:** Claude coordinator (`~/work/bc-grid`)
**Lane:** cross-cutting — public API ergonomics, package boundaries, type discipline, bsncraft integration, ERP comparison. Visual-quality cross-check on worker2's lane is **deferred** to the synthesis pass once worker2's findings land.
**Date:** 2026-05-02
**Brief:** `coordinator-scope.md`

---

## Executive summary

bc-grid's **engineering foundations are exceptional** — zero `any` across all 11 packages, clean dependency DAG, no circular deps, type-check green, 22 RFCs documenting intent, perf gates enforced. Where competing libraries drift over a sprint, this codebase has not. That work should be loudly preserved.

The **product-fit story is weaker, and it's a P0 issue**. The public API forces every consumer grid to wire ~10 independent controlled-state callback pairs (~30 props) and a hand-rolled server pagination state machine. The `apiRef` is missing imperative methods (`focusCell`, `scrollToRow`) that ERP UX patterns need. As of today, bsncraft carries **2,142 LOC of wrapper code** across 5 files just to make bc-grid feel native — which is roughly the line-count of the underlying grid orchestrator itself. The "20 lines of glue or 200" test currently lands at ~200, by a wide margin.

The **hero use case reality check is uncomfortable**: zero of the four use cases driving this audit (sales estimating, production estimating, colour selection, document management) are *actually built yet* in bsncraft. Only customer master-detail exists. Today's friction is the tip of the iceberg; the moment a developer starts a sales-estimating grid they will discover missing patterns that should have been baked in (money column with formula deps, hierarchical scheduling rows, swatch-aware lookup, file/thumbnail column type). The recommendation is to **ship a turnkey API layer + 4 hero column types as a single dedicated v0.5 milestone**, before scaling the bsncraft migration further.

---

## P0 findings (block credible BusinessCraft demo or degrade day-1 UX)

### P0-C1 — Controlled-state boilerplate tax: 30+ props, 50+ `useState` per grid

- **Where:** `packages/core/src/index.ts:207–254` (`BcGridStateProps`), demonstrated in `apps/examples/src/App.tsx` (50+ `useState` declarations + 10+ memo/useCallback wrappers before render).
- **What:** Every state dimension (sort, filter, search, selection, expansion, grouping, pagination, column visibility, column order, column widths) requires three props: `value` + `defaultValue` + `onChange`. Approximately 10 dimensions × 3 = ~30 controlled-state props. There is no aggregated `onChange` event with discriminated payloads, and no opinionated default-controlled hook (`useBcGridState()`).
- **Why it matters for the BusinessCraft ERP:** BC has dozens of CRUD screens. At 50+ lines of boilerplate per grid, that's thousands of LOC of repeated state plumbing across the ERP, and every grid is one place a future contributor can wire something wrong (forget a `setX` in an `onXChange`, race a controlled prop against persisted localStorage). Sales estimating with 80 line items and dependent cells will be sensitive to subtle controlled-state bugs.
- **Recommendation:** Ship a turnkey state hook in `@bc-grid/react`:
  ```ts
  const { props } = useBcGridState({ persistTo: 'local:gridId', columns });
  return <BcGrid {...props} columns={columns} rows={rows} />;
  ```
  Hook owns the 30 useState/onChange pairs and exposes a single discriminated `onChange` event for consumers that need to observe state. Existing controlled-prop API stays for advanced users; opinionated path becomes the default.

### P0-C2 — Server-paged grids require a 9-`useState` consumer state machine

- **Where:** `~/work/bsncraft/apps/web/components/server-edit-grid.tsx:74–163`. Mirrors `BcServerPagedProps<TRow>` in `packages/react/src/types.ts:582–626` and `LoadServerPage<TRow>` in `packages/core/src/index.ts:413–425`.
- **What:** `ServerEditGrid` carries 9 `useState` calls for page/pageSize/sort/filter/search/requestId/loading/error/totalCount, plus debounce, plus stale-response rejection. None of this lives in bc-grid. Every server-paged grid in the ERP will rebuild this same orchestration.
- **Why it matters for the BusinessCraft ERP:** Every meaningful BC grid hits a server (transactions, line items, scheduling, documents). N copies of a hand-rolled state machine = N places to fix the next bug. Worker1's audit will likely surface stale-response bugs that exist *because* this orchestration is consumer-owned.
- **Recommendation:** Ship `useServerPagedGrid({ gridId, loadPage })` in `@bc-grid/react`. Hook owns request-id flow, stale-response rejection, debounce, page reset on filter change, optimistic edits in flight, and emits a single set of props ready to spread into `<BcGrid>`. Companion hooks: `useServerInfiniteGrid`, `useServerTreeGrid`. This pairs with P0-C1 and P0-C3.

### P0-C3 — `apiRef` missing imperative methods that ERP UX needs

- **Where:** `BcGridApi` in `packages/core/src/index.ts` (apiRef methods: `setSort`, `setFilter`, etc. — but no focus/scroll). Workaround at `~/work/bsncraft/apps/web/components/lookup-grid.tsx:209` (hardcoded no-op for ArrowDown-from-search).
- **What:** No `focusCell(rowId, colId)`, no `scrollToCell(rowId, colId)`, no `startEdit(rowId, colId)`, no `openFilter(colId)`, no `getActiveCell()`. ERP UX patterns rely on imperative grid control: search-input → ArrowDown → focus first row, double-click row → focus a target cell, save-and-next → focus next row, error notification → scroll-and-flash the offending cell.
- **Why it matters for the BusinessCraft ERP:** Lookup and search-driven workflows feel broken without ArrowDown-from-search. Sales-estimate save-and-next workflows can't move the user to the next row programmatically. Validation errors can't scroll the user to the bad cell.
- **Recommendation:** Expand `BcGridApi` to a stable imperative surface: `focusCell`, `scrollToCell`, `startEdit`, `commitEdit`, `cancelEdit`, `openFilter`, `closeFilter`, `getActiveCell`, `getSelection`. Document in `api.md`. Pair with worker3's editor contract — `startEdit(rowId, colId, { seedKey? })` is the symmetric API to the editor `prepare`/`commit` protocol.

### P0-C4 — Zero of four hero use cases exist yet — late friction risk

- **Where:** `~/work/bsncraft/` — only customer master-detail grid (AR domain, not a hero case) exists. Sales estimating, production estimating (PO scheduling), colour selection, and document management all unbuilt. Document management has a DB schema (`packages/db/src/schema/co-documents.ts`) but no grid.
- **What:** The audit's premise — "score against the four hero use cases" — currently scores against hypothetical grids. The friction that will surface when a developer starts each hero grid is invisible today.
- **Why it matters for the BusinessCraft ERP:** Each hero use case demands patterns that don't exist in bc-grid yet:
  - **Sales estimating:** money column type with currency-aware formatting, formula/dependency cells (qty × price → extended price recomputes on commit), Excel paste fidelity for line-item entry
  - **Production estimating:** outline rendering for parent/child scheduling, drag-to-reorder rows with constraints, multi-row edit (apply a date shift to N rows)
  - **Colour selection:** swatch-aware lookup editor (16×16 colored chip beside option label), recently-used section, "create new colour" inline
  - **Document management:** file/thumbnail column type, drag-drop upload, in-row preview, bulk select + bulk action toolbar
- **Recommendation:** Spike each hero use case as a minimal demo grid in `apps/examples/` *before* committing to v1.0 scope. Each spike will surface 3–10 missing patterns. Better to find them in spike form than mid-bsncraft-migration. Suggest a hero-spike track on the v0.5 sprint, owned by the maintainer or one Claude worker, with the goal "render each hero grid in <50 LOC of consumer code".

---

## P1 findings (would noticeably degrade ERP UX in production)

### P1-C1 — `react` package bundles 8 hard deps; `editors` and `enterprise` always loaded

- **Where:** `packages/react/package.json` deps; the bundle hard cap is 100 KiB per `design.md §13` (`2026-04-30` decision).
- **What:** A consumer who wants the lightest read-only grid still pays for `editors`, `enterprise`, `aggregations`, `filters`, `export`, `server-row-model`, `theming`, `animations`. There is no opt-in surface.
- **Why it matters:** BusinessCraft has read-only screens (audit logs, reports) that don't need editing or aggregation. Forcing them to ship an editor framework wastes bundle and slows TTI. Also: harder to tree-shake the demo example app.
- **Recommendation:** Move `editors` and `enterprise` to `peerDependencies` of `@bc-grid/react`. Provide a registration API (`registerEditor('text', textEditor)`) and an entry point that opts in (`@bc-grid/react/editors-default`). Tree-shaking rewards consumers who only import what they use. Pair this with a coverage gate — "the read-only example bundle stays under 50 KiB gzip".

### P1-C2 — Generic `TRow` doesn't propagate into server loader signatures

- **Where:** `packages/core/src/index.ts:413–425` (`LoadServerPage<TRow>`, `ServerPagedResult<TRow>`).
- **What:** `loadPage(query: ServerPagedQuery): Promise<ServerPagedResult<TRow>>` — `query` is untyped (no `TFilter`, no `TSort` discriminated by column id). Consumers manually cast their server response to match `TRow`.
- **Why it matters:** Type errors at the loader boundary surface at runtime, not compile time. For a sales-estimating grid where the server returns `{ id, sku, qty, price, lineDiscount }` and the grid expects `{ id, sku, qty, price, discount }`, the typo escapes TypeScript.
- **Recommendation:** Make `BcServerGridProps<TRow, TQuery = ServerPagedQuery<TRow>>` so the column id type narrows the sort/filter payload. Pair with column id branding (e.g. `BcGridColumn<TRow, K extends keyof TRow & string>`).

### P1-C3 — Stringly-typed filter `type` / `variant` lacks compile-time narrowing

- **Where:** `packages/core/src/index.ts:45–49` (`BcColumnFilter`); custom-filter registration in `docs/api.md:814–835`.
- **What:** `filter: { type: "text" | "number" | …, variant?: "popup" | "inline" }`. Typo `"tex"` discovered at runtime. No discriminated union of per-type options (`caseSensitive` only valid on text, `precision` only valid on number, etc.).
- **Why it matters:** Custom filter registration is not type-safe; consumer-extended filter libraries can't expose typed options.
- **Recommendation:** Convert to discriminated union:
  ```ts
  type BcColumnFilter =
    | { type: 'text'; caseSensitive?: boolean; regex?: boolean; variant?: 'popup' | 'inline' }
    | { type: 'number'; precision?: number; variant?: 'popup' | 'inline' }
    | { type: 'date'; granularity?: 'day' | 'month'; variant?: 'popup' | 'inline' }
    | { type: 'set'; options?: string[]; loadOptions?: () => Promise<string[]> }
    ;
  ```

### P1-C4 — Callback signatures inconsistent: positional `(next, prev)` vs event objects

- **Where:** `packages/core/src/index.ts:209–213` (`onSortChange(next, prev)`), `packages/react/src/types.ts:464` (`onCellEditCommit(event)`), `types.ts:456–457` (`onRowClick(row, event)`).
- **What:** Three callback shapes coexist. Future callbacks that need `requestId`, `timestamp`, async context, or a cancel token will force breaking changes when migrating positional → event-object.
- **Why it matters:** Once the public API is frozen, breaking changes become expensive. Better to pay the consistency cost now.
- **Recommendation:** Pick one shape. Recommend event objects (`{ next, prev, requestId, timestamp }`) — standardize across all callbacks before the API freeze beyond Q1. Document the convention in `api.md`.

### P1-C5 — 10 internal-path imports in test files

- **Where:** `packages/react/tests/editorChrome.test.tsx:4-12` and `packages/react/tests/checkboxEditor.markup.test.tsx:3` reach into `../../editors/src/<editor>` instead of `@bc-grid/editors`. All imported symbols *are* exported from `@bc-grid/editors/src/index.ts`.
- **What:** Test code violates the package boundary the production code respects.
- **Why it matters:** Tests should exercise the public surface. Internal-path imports mean tests pass even if `@bc-grid/editors`'s public exports drift, which is exactly the contract those exports are supposed to enforce.
- **Recommendation:** One worker can rewrite these 10 imports to `@bc-grid/editors`. ~15 minute fix. Add an ESLint/Biome rule to fail on relative imports across `packages/*/src` boundaries from test files.

### P1-C6 — Wrapper duplication that signals missing first-class patterns

- **Where:** `~/work/bsncraft/apps/web/components/data-grid.tsx:179–215` and `~/work/bsncraft/packages/ui/src/components/data-table.tsx:1–25` (Cmd+F search hotkey duplicated). `data-grid.tsx:296–310` (15 lines of viewport-fit height math). `data-grid.tsx:573` (`...{onFilterChange ? { filter, onFilterChange } : {}}` to work around `filter` being required).
- **What:** Three patterns the consumer keeps reinventing.
- **Why it matters:** Each pattern accumulates one bug per copy. As bsncraft grows, drift between copies becomes a maintenance tax.
- **Recommendation:**
  - Add a `<BcGridSearch />` companion component or a `searchHotkey` prop that owns the keyboard listener.
  - Add a `fit="content" | "viewport" | "auto"` prop to `<BcGrid>` that owns the viewport-fit height math.
  - Make `filter` and `onFilterChange` optional on `BcGridProps` (currently the conditional spread suggests they're required-when-controlled but bsncraft wants neither).

---

## P2 findings (improvements, polish — schedule post-v1 unless cheap)

### P2-C1 — Naming inconsistency across surfaces

- **Where:** `packages/core/src/index.ts:25–37` (`valueGetter`, `valueFormatter`, `valueParser`, `validate`); `BcGridApi` (`setSort`, `setFilter`); callbacks (`onSortChange`); editors (`prepare`, `commit`); cell rendering (`cellRenderer`, `cellClassName`).
- **What:** Four naming patterns coexist: noun-prefix (`valueGetter`), naked verb (`validate`), imperative (`setSort`), past-tense (`onSortChange`). Cognitive friction for consumers context-switching across surfaces.
- **Recommendation:** Ratify naming conventions in `api.md`. Migrate before API freeze beyond Q1. (`validate` → `valueValidator` would be the simplest harmonization.)

### P2-C2 — `core` lives at the foundation but `core/columns.ts` is reserved for a TanStack adapter that doesn't exist

- **Where:** `core/columns.ts` (per `design.md §3.3`).
- **What:** TanStack Table is not yet a dep. The "TanStack adapter is the only `any` zone" rule has no current target. Means the type-discipline carve-out is theoretical.
- **Recommendation:** Either pull TanStack adapter forward (if the v1 sprint actually needs it) or remove the carve-out from `AGENTS.md` Rule 5 and `design.md §14.1`. Currently the rule and the codebase agree on "no `any`" — making the carve-out match.

### P2-C3 — Custom comparator signature drops column context

- **Where:** Column comparator at `packages/core/src/index.ts` (positional `(a, b, rowA, rowB)`).
- **What:** Comparators don't receive the column metadata. A consumer writing `compareCurrency` for the money column has to recompute the `currencyCode` from row data instead of pulling it from `column.meta`.
- **Recommendation:** Add a `column` argument: `compare(a, b, { rowA, rowB, column })`. Backwards-compat by checking arity.

---

## What's already strong (don't lose this in any refactor)

1. **Type discipline is pristine.** Zero `any`, zero `@ts-ignore`, zero `@ts-expect-error`, zero `eslint-disable no-explicit-any` across 11 packages. Type-check green. This is **exceptional** for a codebase this size and should be celebrated in onboarding/release notes — it's a real differentiator versus AG Grid's `any`-heavy surface and most competitors.
2. **Package architecture is clean and matches the design intent.** Engine-vs-React split (`design.md §13` decision 2026-04-29) holds. Core is the foundation; nothing depends on `react` it shouldn't; no circular deps. `bun run type-check` (`tsc -b`) passes with project references correctly wired.
3. **Discriminated-union selection model.** `BcSelection` / `ServerSelection` with `mode: "explicit" | "all" | "filtered"` (`core/index.ts:156–159`) handles the "select all except 5 rows" case typed-from-end-to-end. ERP grids will rely on this for bulk-action workflows.
4. **Editor protocol with `prepare` async + `commit({ moveOnSettle })`.** `types.ts:628–632, 657–706`. Editors own keystroke interception (`seedKey`, `pointerHint`) and can override post-edit navigation. This is the correct level of abstraction for a windows-client-class editing experience and is already the right primitive for sales estimating's Tab-driven entry.
5. **`AbortSignal` plumbed through server loaders.** `core/index.ts:400–402`. The grid cancels in-flight requests when the user scrolls away. Zero boilerplate on consumer side; correct ERP behavior by default.
6. **The `ui-quality-gate.md` standard is unusually strong.** Most projects don't have a binding visual-rejection criteria document at all, let alone one this specific (resize-handle pixel widths, focus-ring rule selection, `--bc-grid-*` token bridge, hard rejections that re-open rather than block). Theming-test invariants pin token discipline. This is a moat against AG Grid's visual-density-but-busy chrome.

---

## Open questions for the synthesis pass

1. **Is the "no charts in v1.0" decision firm enough that we should remove `docs/design/charts-rfc.md` from the active design tree?** It's marked "remains as a post-1.0 planning draft" but its presence in `docs/design/` invites confusion.
2. **Should the v0.5 release be re-scoped to "API ergonomics + 4 hero use case spikes" rather than the current range/clipboard focus?** Range/clipboard is real but if hero use cases reveal API gaps, fixing those first avoids an API churn during the bsncraft demo prep window.
3. **Is the bsncraft demo target date (2026-05-30, per `queue.md` ⭐ section) compatible with shipping the recommended turnkey hooks (`useBcGridState`, `useServerPagedGrid`, expanded `apiRef`) before the migration scales further?** If yes, the timeline supports the recommendations. If no, the demo will go out on the current 2,142-LOC wrapper layer and the ergonomics fix slips post-demo.
4. **Worker2 lane cross-check on visual quality and chrome consistency.** This coordinator doc deferred the visual-quality cross-check to the synthesis pass. After worker2's findings land, the coordinator will re-walk filters/aggregations/chrome surfaces against `ui-quality-gate.md §2` and add findings if any.
