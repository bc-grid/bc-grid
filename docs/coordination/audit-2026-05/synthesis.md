# Audit 2026-05 — Synthesis

**Date:** 2026-05-02
**Coordinator:** Claude in `~/work/bc-grid`
**Sources:**
- `coordinator-audit.md` (cross-cutting: API ergonomics, package boundaries, type discipline, bsncraft integration, ERP comparison)
- `worker2-findings.md` (Codex — filters, aggregations, range/clipboard prep, chrome consistency)
- `worker3-findings.md` (Claude — editors, keyboard/a11y, lookup UX)
- worker1 lane covered by coordinator audit (worker1 went straight to v0.4 server-grid work; no separate findings doc)

## Top-line grade

**bc-grid's engineering foundations are exceptional. Its product surface is one focused refactor away from being credible as the BusinessCraft ERP foundation.**

What's working: zero `any` across 11 packages, clean dependency DAG, type-check green, 22 RFCs documenting intent, perf gates enforced, a binding visual quality gate that rejects (rather than soft-blocks) chrome PRs that miss the bar. The editor state machine, the AbortSignal-plumbed server loaders, the discriminated-union selection model, and the TSV parser are all the right shape.

What's missing: the public API forces every consumer grid to wire ~30 controlled-state props plus a hand-rolled server pagination state machine; `apiRef` is missing imperative methods that ERP UX relies on; the visible surface for validation messages is screen-reader-only; Excel paste exists end-to-end as a helper but is never wired to a paste event; the lookup editors are native HTML shells rather than the shadcn Combobox the editing-rfc specified; date/datetime/time editors silently commit `undefined` on click-outside (one-line fix per editor); zero of the four hero use cases are built yet in bsncraft.

Today's wrapper layer in bsncraft is **2,142 LOC across 5 wrappers**. The "20 lines of glue or 200" test currently lands at ~200, by a wide margin. A focused refactor — the v0.5 plan ratified below — drops that to ~30.

## How to read this synthesis

Severity uses the audit-2026-05 README scale:

- **P0** — blocks credible BusinessCraft demo or degrades day-1 UX. Fix before v0.5 cut (or a hotfix on the v0.4 train).
- **P1** — would noticeably degrade ERP UX in production. Fix before v1.0 cut.
- **P2** — polish, defer post-1.0 unless cheap.

Each finding is tagged by author. **Multi-author findings are stronger signal** — if the coordinator and a worker independently flagged it, the recommendation is high-confidence.

---

## P0 — Block the demo (fix on v0.4 hotfix train or v0.5)

### P0-1 — Excel paste exists end-to-end as a helper but is never wired

**Authors:** worker2 + worker3 + coordinator (multi-author — strong signal)
**Where:** `packages/react/src/rangeClipboard.ts:419,489` (`buildRangeTsvPastePlan`, `buildRangeTsvPasteApplyPlan`); `packages/react/src/grid.tsx:134-138` (imports only copy helpers); `grep onPaste packages/react/src/` returns no results.
**What:** TSV parser, paste-plan builder, full apply-plan helper, atomic validation, parse diagnostics — all exist. Tests in `packages/react/tests/rangeClipboard.test.ts` cover them. Nothing in `@bc-grid/react` binds them to a `paste` event. There is no `onPaste` listener, no Cmd/Ctrl+V intercept, no `pasteTsv` API, no consumer-facing prop.
**Why it matters:** Sales-estimating's hero gesture is "paste 80 quantities from Excel into the qty column." Today bc-grid cannot do it.
**Recommendation:** v0.5 paste integration. **Split ownership** (resolves worker2's open question): worker2 owns the `paste` listener + `pasteTsv({ range, tsv })` API surface (their range/clipboard helper lane); worker3 owns the route-through-editorController binding (their commit lane). Land as one PR pair; coordinator merges in order.

### P0-2 — Validation messages are invisible to sighted users

**Author:** worker3
**Where:** `packages/editors/src/{text,number,select,autocomplete,multiSelect,checkbox}.tsx` render the error string into a `visuallyHidden` `<span>`; sighted users see only a 3px red inset stripe (`packages/theming/src/styles.css:1029-1034`) plus a red border on the input. No popover, no tooltip, no inline message.
**Why it matters:** Sales-estimating with 80 line items: user types `qty=0` on a "qty must be > 0" column, sees a red border, has no way to learn *why* it was rejected. After 10 lines the screen has 10 indistinguishable red borders. NetSuite, Dynamics, Excel all surface the message in-cell or as a popover.
**Recommendation:** **v0.4 hotfix train** (worker3 Task 2). Render the active editor's error inside the editor portal as a shadcn Popover/Tooltip anchored to the cell. The portal already exists and `data-bc-grid-editor-portal` is recognised by click-outside. The state machine already carries `error` through `editing` and `validating` modes — only the visual layer is missing. Pair with an inline below-cell message at minimum.

### P0-3 — Date / datetime / time editors silently commit `undefined` on click-outside

**Author:** worker3
**Where:** `packages/editors/src/{date,datetime,time}.tsx` use `useEffect` for the `focusRef` assignment. Compare `text.tsx:60-69`, `number.tsx:71-80`, `select.tsx:56-65` which use `useLayoutEffect` and explicitly cite the bug fixed in PR #155.
**What:** The framework's `EditorMount` (`editorPortal.tsx:172-186`) reads `focusRef.current?.focus()` in `useLayoutEffect`. The text/number/select editors assign `focusRef.current` in `useLayoutEffect`, so it lands first. The date/datetime/time editors assign in `useEffect`, so when the framework reads, `focusRef.current === null`. On click-outside (`editorPortal.tsx:228`), `readEditorInputValue(focusRef.current)` returns `undefined`, and the cell commits `undefined`.
**Why it matters:** Production-estimating involves scheduled-PO dates and datetimes. The user picks a date, clicks a different cell, the date picker disappears, the cell commits `undefined`. The user thinks the date saved; on next refresh it's empty. **This is a silent data-loss path on the most common pointer gesture.**
**Recommendation:** **v0.4 hotfix train** (worker3 Task 1). Swap `useEffect` → `useLayoutEffect` in all three editors and add the `return () => null` cleanup that `text.tsx:64-68` uses. Add a regression test that drives focus-out on a `dateEditor`-bound cell and asserts `commit` was called with the YYYY-MM-DD string. **One-line fix per editor.**

### P0-4 — Lookup editors use native HTML, blocking the Colour Selection hero use case

**Authors:** worker3 + coordinator (multi-author — strong signal)
**Where:** `packages/editors/src/{select,multiSelect,autocomplete}.tsx` render plain DOM `<option>` / `<datalist>` children. RFC: `docs/design/editing-rfc.md:592-598` ("Component: shadcn `Combobox` primitive").
**What:** `<option>` cannot contain HTML — no swatch chip, no icon, no two-line metadata. `<datalist>` is famously inconsistent across browsers (Safari announces value not label, mobile renders as a plain keyboard suggestion strip). The editing-rfc specified shadcn primitives; that work was scoped but not landed.
**Why it matters:** "Colour selections" is one of the four hero use cases — Antique Walnut next to a brown chip, user types "ant", filters to brown chips, picks by keyboard. Today only path is `column.cellEditor` with a fully custom Combobox. The framework doesn't ship the foundation.
**Recommendation:** **v0.5** (worker3, as part of Colour Selection hero spike). Replace the three editors' UI shells with shadcn Popover-anchored Combobox/Listbox primitives. Extend `EditorOption` (`packages/editors/src/chrome.ts:30-34`) with optional `icon?: ReactNode` and `swatch?: string` (CSS color) fields. The data plumbing already supports this — pure-render swap.

### P0-5 — Public API forces ~30 controlled-state props per grid; no turnkey state hook

**Author:** coordinator
**Where:** `packages/core/src/index.ts:207-254` (`BcGridStateProps`); demonstrated in `apps/examples/src/App.tsx` with 50+ `useState` declarations + 10+ memo/useCallback wrappers.
**What:** ~10 state dimensions × 3 props each = ~30 controlled-state props. No aggregated `onChange` event with discriminated payloads. No opinionated `useBcGridState()` default-controlled hook.
**Why it matters:** BusinessCraft has dozens of CRUD screens. Thousands of LOC of repeated state plumbing. Every grid is one place to wire wrong (forget a `setX` in an `onXChange`, race a controlled prop against persisted localStorage).
**Recommendation:** **v0.5** (worker3). Ship `useBcGridState({ persistTo, columns, server? })` turnkey hook. Returns spread-ready props. Existing controlled-prop API stays for advanced users; opinionated path becomes the default.

### P0-6 — Server-paged grids force consumers to hand-roll a 9-`useState` orchestration

**Author:** coordinator
**Where:** `~/work/bsncraft/apps/web/components/server-edit-grid.tsx:74-163`. Mirrors `BcServerPagedProps<TRow>` and `LoadServerPage<TRow>`.
**What:** No `useServerPagedGrid` hook. Every server-paged ERP grid will rebuild request-id flow, stale-response rejection, debounce, page reset on filter, optimistic edits in flight.
**Why it matters:** Every meaningful BC grid hits a server. N copies of a hand-rolled state machine = N places to fix the next bug.
**Recommendation:** **v0.5** (worker1). `useServerPagedGrid({ gridId, loadPage })` owns the orchestration. Companion `useServerInfiniteGrid`, `useServerTreeGrid` if scope permits.

### P0-7 — `apiRef` is missing imperative methods that ERP UX patterns need

**Authors:** coordinator + worker3 (worker3 implicitly via custom-editor click-outside finding)
**Where:** `BcGridApi` in `packages/core/src/index.ts` has `setSort`/`setFilter` but no `focusCell`, `scrollToCell`, `startEdit`, `openFilter`, `getActiveCell`. Workaround at `~/work/bsncraft/apps/web/components/lookup-grid.tsx:209` (hardcoded ArrowDown-from-search no-op).
**What:** ERP UX patterns rely on imperative grid control: search → ArrowDown into grid, save-and-next, scroll-to-error, validation-flash-on-cell.
**Why it matters:** Lookup and search-driven workflows feel broken. Sales-estimate save-and-next can't move the user. Validation errors can't scroll to the bad cell.
**Recommendation:** **v0.5** (split: worker1 server-side `scrollToCell`, worker3 editor-side `focusCell`/`startEdit`/`commitEdit`/`cancelEdit`/`getActiveCell`, worker2 filter-side `openFilter`/`closeFilter`). Document in `api.md`.

### P0-8 — Grouping is page-window only and group rows show no subtotals

**Author:** worker2
**Where:** `packages/react/src/grid.tsx:762,777,903`; `packages/react/src/bodyCells.tsx:270`; `docs/api.md:1651`.
**What:** `leafRowEntries` paginates before `buildGroupedRowModel`, so grouped rows are built from the current page/window, not the full client dataset. Group rows render one spanning cell with label + count only. `aggregateGroups` is not wired into group-row rendering. This conflicts with docs that say per-group subtotals paint on group rows.
**Why it matters:** AR and production users read group labels and totals as workload statements. "Past Due (12)" on a paginated slice with no subtotal beside `balance` or `aging` columns is materially less trustworthy than an ERP outline.
**Recommendation:** **v0.6** (the renumbered range/clipboard milestone — group subtotals belong with the spreadsheet-feel work). Decide the contract explicitly: client grids group before pagination, OR label grouped pagination as current-page grouping. Then wire a group aggregation map into group rows so numeric columns show subtotals in their own cells. Tests for grouped + paginated + aggregated grids.

### P0-9 — Hero use cases not built yet — late friction risk

**Author:** coordinator
**Where:** `~/work/bsncraft/` — only customer master-detail (AR domain, not a hero case). Sales estimating, production estimating, colour selection, document management all unbuilt. Document mgmt has a DB schema (`packages/db/src/schema/co-documents.ts`) but no grid.
**What:** Today's friction (2,142 LOC of wrappers) is the tip of the iceberg. Each hero use case will surface 3–10 missing patterns.
**Recommendation:** **v0.5 hero-spike track**. Each spike is one example file (`apps/examples/src/<hero>.example.tsx`) under 100 LOC of consumer code. Findings from each spike feed v0.6+ planning. Worker3 owns sales-estimating + colour-selection; coordinator owns production-estimating + document-management.

---

## P1 — Production-degrading (fix before v1.0)

### Cross-cutting (coordinator)

| ID | Finding | Where | v0.5 / v0.6 / v0.7+ |
|---|---|---|---|
| P1-C1 | `react` package bundles 8 hard deps; `editors` and `enterprise` always loaded | `packages/react/package.json` | v0.7+ (peer-deps refactor risky in tight sprint) |
| P1-C2 | Generic `TRow` doesn't propagate into server loader signatures | `packages/core/src/index.ts:413-425` | v0.5 stretch (worker1) |
| P1-C3 | Stringly-typed filter `type`/`variant`; no discriminated union | `packages/core/src/index.ts:45-49` | v0.5 stretch (worker2) |
| P1-C4 | Inconsistent callback signatures (positional vs event-object) | `packages/core/src/index.ts:209-213` etc. | v0.6 (touches API, defer until v0.5 ergonomics land) |
| P1-C5 | 10 internal-path test imports in `packages/react/tests/` | `editorChrome.test.tsx`, `checkboxEditor.markup.test.tsx` | v0.5 cheap-P1 (worker2) |
| P1-C6 | Wrapper duplication (Cmd+F hotkey, fit math, optional filter) | bsncraft `data-grid.tsx`, `data-table.tsx` | v0.5 cheap-P1 (worker2) |

### Filters / aggregations (worker2)

| ID | Finding | v0.5 / v0.6 / v0.7+ |
|---|---|---|
| P1-W2-1 | `@bc-grid/filters` is empty package; custom filter contract is a phantom | v0.7+ (filter registry implementation) |
| P1-W2-2 | Set filters don't scale (no virtualization, no async, no result cap) | v0.7+ (option provider contract) |
| P1-W2-3 | Named saved searches/filter views are host-only | v0.7+ (typed saved-view helper or recipe) |
| P1-W2-4 | ERP filter operator coverage thin (no blank/not-blank, no relative dates, no fiscal periods) | v0.7+ (with filter registry) |
| P1-W2-5 | Group selection algebra absent (selecting a group doesn't select its rows) | v0.6 (with group subtotals work) |

### Editors / a11y (worker3)

| ID | Finding | v0.5 / v0.6 / v0.7+ |
|---|---|---|
| P1-W3-1 | Backspace/Delete don't activate edit mode or clear cell | v0.5 (cheap addition to editor keyboard contract) |
| P1-W3-2 | `prepareResult` mechanism wired but no editor uses it | v0.5 (with shadcn Combobox migration — autocomplete naturally consumes prepareResult) |
| P1-W3-3 | Multi-cell row edits have no rollback (Esc cancels current cell only) | v0.5 (`editController.discardRowEdits(rowId)` + BcEditGrid action column UI) |
| P1-W3-4 | Validation visual passive — no transient flash, no status-bar slot for latest error | v0.7+ (chrome milestone) |
| P1-W3-5 | Number editor seed too tactical; no locale-aware parser ships | v0.7+ (`numberEditor.parseLocaleNumber(value, locale)` helper) |
| P1-W3-6 | Custom editors not INPUT/SELECT/TEXTAREA commit `undefined` on click-outside | v0.5 (add `getValue?` to `BcCellEditor`) |
| P1-W3-7 | No `aria-required`/`aria-readonly`/`aria-disabled` on editor inputs | v0.5 (thread through `BcCellEditorProps`) |
| P1-W3-8 | Editor visual contract split across cell, input, portal | v0.7+ (CSS-variable-driven token consolidation) |

---

## P2 — Polish (post-v1.0 backlog)

Captured in source findings docs, not re-listed here:

- Coordinator: `coordinator-audit.md` §P2 (naming inconsistency, custom comparator with column context, TanStack adapter no longer load-bearing)
- Worker2: `worker2-findings.md` §P2 (active filter summary in toolbar, chrome polish drift cleanup, server-side paste planning)
- Worker3: `worker3-findings.md` §P2 (`aria-controls` on autocomplete, editor portal z-index, Alt+Down convention, `findOptionIndexBySeed` extension, accessible name fallback)

These move to a single backlog doc (`docs/coordination/post-v1-backlog.md`) when v1.0 cuts.

---

## What's already strong (every author confirmed)

Don't lose these in any refactor:

1. **Type discipline is pristine.** Zero `any`, zero `@ts-ignore`, zero `@ts-expect-error` across 11 packages. (coordinator)
2. **Package architecture is clean.** Engine-vs-React split holds; nothing depends on `react` it shouldn't; no circular deps; `tsc -b` green. (coordinator)
3. **Editor state machine is textbook.** `editingStateMachine.ts` is a pure reducer with mutationId superseded-settle guards. AbortController-based async-validate cancellation is race-safe. `pruneOverlayPatches` is idempotent and minimal. (worker3)
4. **Selection model is discriminated-union from end to end.** `BcSelection`/`ServerSelection` `mode: "explicit" | "all" | "filtered"` handles "select all except 5 rows" with full type safety. (coordinator)
5. **`AbortSignal` is plumbed through server loaders.** Zero-boilerplate request cancellation on scroll-away. (coordinator)
6. **TSV parser is solid** — explicit diagnostic codes, ragged-row detection, quoted-cell handling, max-cell limit. The wiring is the gap, not parser correctness. (worker2 + worker3)
7. **Filter predicate/serialization coverage in React is deep.** (worker2)
8. **`@bc-grid/aggregations` has a clean pure engine** with mergeable aggregators, custom aggregators, pivot DTO groundwork. (worker2)
9. **`ui-quality-gate.md` is unusually strong.** Hard rejection criteria, theming-test invariants pin token discipline. A real moat against AG Grid's busy chrome. (coordinator)
10. **Live-region announce wiring** splits politely on commit and assertively on validation/server errors. (worker3)

---

## Disagreements

**None substantive.** Worker findings reinforced or extended coordinator findings; no contradictions.

Three open questions raised by workers, **resolved here**:

1. **Worker2 — "Should v0.5 paste integration be owned by worker2 or split with worker3?"** → **Split.** Worker2 owns `paste` listener + `pasteTsv` API. Worker3 owns route-through-editorController.
2. **Worker3 — "Lookup editors using native HTML — deliberate or slipped?"** → **Slipped.** shadcn Combobox migration is v0.5 (Colour Selection hero spike).
3. **Worker3 — "Color swatch: `EditorOption.swatch` field or column-level `optionRenderer` hook?"** → **Both.** `EditorOption.swatch?: string` for the hero case; optional `optionRenderer` for the escape hatch.
4. **Worker2 — "Should client grouping group-before-paginate, or document grouped pagination as current-page grouping?"** → **Group before paginate** (v0.6). The current behavior is misleading (`Past Due (12)` only shows current page); deferring to v1.0 reads as "we ship broken grouping for 6 months." Pair with subtotals work.
5. **Worker2 — "Saved-search UI: bc-grid component or bsncraft-owned?"** → **Both.** bc-grid publishes a canonical DTO (`BcSavedView`); bsncraft owns the actual UX. v0.7+ scope.

---

## Recommended sprint plan

### v0.4 hotfix train (NOW — within 1 day)

- **Worker3 Task 1:** date/datetime/time `useLayoutEffect` fix (P0-3) — 1 hour
- **Worker3 Task 2:** visible validation surface (P0-2) — 2-4 hours
- **Worker2:** original v0.4 lane work (filter popup contracts, active filter summary)
- **Worker1:** PR #353 in coordinator review (server-grid `rowProcessingMode`)
- **Coordinator:** review #353; run Playwright on server-edit examples; bsncraft type-check smoke

### v0.5 — Audit-Driven Ergonomics Refactor (~1 week)

Already planned in `docs/coordination/v0.5-audit-refactor-plan.md`. Synthesis-ratified scope:

**Must-ship (P0):**
- `useBcGridState` (P0-5 — worker3)
- `useServerPagedGrid` (P0-6 — worker1)
- `BcGridApi` expansion: focus/scroll/edit/filter (P0-7 — split worker1/worker2/worker3)
- Excel paste wiring (P0-1 — split worker2/worker3)
- shadcn Combobox migration with swatch (P0-4 — worker3, embedded in Colour Selection spike)
- 4 hero-use-case spike grids in `apps/examples/` (P0-9):
  - Sales estimating (worker3, includes paste-integration validation)
  - Colour selection (worker3, includes Combobox migration validation)
  - Production estimating (coordinator)
  - Document management (coordinator)

**Should-ship (cheap P1):**
- Test-import lint rule (P1-C5 — worker2)
- `<BcGrid searchHotkey>` prop, `fit` prop, optional `filter` prop (P1-C6 — worker2)
- Backspace/Delete clear (P1-W3-1 — worker3)
- `editController.discardRowEdits` (P1-W3-3 — worker3)
- Custom editor `getValue?` hook (P1-W3-6 — worker3)
- `aria-required`/`aria-readonly`/`aria-disabled` on editor inputs (P1-W3-7 — worker3)

**Stretch (only if time permits):**
- Generic `TRow` → server loaders (P1-C2 — worker1)
- Filter discriminated union (P1-C3 — worker2)
- `prepareResult` consumed by autocomplete (P1-W3-2 — worker3, naturally lands with Combobox migration)

### v0.6 — Range, Clipboard, Spreadsheet, **and Grouping Subtotals** (~1 week)

Original v0.6 (renumbered from v0.5) plus additions from worker2:

- Range state + visual layer (existing v0.6 plan)
- Clipboard copy/paste/fill (existing v0.6 plan; benefits from v0.5 paste wiring)
- **NEW:** Group-before-paginate + group subtotals + group selection algebra (P0-8 + P1-W2-5 — worker2)
- **NEW:** Callback shape standardization (P1-C4 — coordinator, since this is a cross-cutting API churn that should land before further public surface adds)

### v0.7+ — Filters Maturity + Server Row Model + Chrome (combined)

- Filter registry implementation (P1-W2-1)
- Set filter virtualization + async (P1-W2-2)
- Saved-view DTO + recipe (P1-W2-3)
- ERP filter operators (blank/not-blank, relative dates, fiscal periods) (P1-W2-4)
- Locale-aware number parser (P1-W3-5)
- Editor visual contract consolidation (P1-W3-8)
- Status bar with latest validation slot (P1-W3-4)
- Active filter chip strip in toolbar (W2 P2)

### Post-v1.0 backlog

- Peer-deps refactor for `editors`/`enterprise` (P1-C1)
- All P2s captured in source docs

---

## Strategic recommendation

The audit's most uncomfortable finding is not any single P0; it's that **zero of the four hero use cases have been built yet**, so all the P0/P1 ergonomics work is being prioritized against hypothetical scenarios. The four v0.5 hero spike grids (each <100 LOC consumer code) are not optional polish — they are **the early-warning system for v0.6+ scope**. Each spike will surface 3–10 missing patterns the audit could not find. Treat their `## Findings` JSDoc blocks as required output, not a nice-to-have.

The strongest single signal of bc-grid's readiness for the BusinessCraft demo will be the **bsncraft migration proof** — taking one existing CRUD grid (likely the customers grid) and migrating it to the new turnkey hooks. Target diff: ≥-100 LOC of wrapper code. If the diff comes in at -200 LOC, the v0.5 refactor delivered. If it comes in at -30 LOC, the API design didn't go far enough and needs another pass before v1.0.
