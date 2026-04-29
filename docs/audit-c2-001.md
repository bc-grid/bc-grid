# Audit c2-001 — first auditor pass

**Auditor:** c2 (Claude on `bcg-worker4`)
**Date:** 2026-04-29
**Scope:** end-of-Q1 backlog catch-up; the PR queue is empty (last open PR #34 just merged), so this pass focuses on cross-doc / cross-package drift rather than per-PR review.
**Validation:** clean checkout green — `bun install`, `bunx tsc -b --clean`, `bun run type-check`, `bun run lint`, `bun run test` (154 unit), `bun run build`, `bun run test:e2e` (50 across 3 browsers), `bun run api-surface` all pass.

This is the template for future audit passes. Each pass writes a sequentially numbered file (`audit-c2-002.md`, …) with the same structure: methodology, findings, recommendations, follow-up punch list.

---

## Methodology

1. Read in order: `docs/AGENTS.md`, `docs/design.md` (esp. §3.2, §4, §8, §13), `docs/api.md` (esp. §1.1, §3.2, §5, §6, §9), `docs/design/accessibility-rfc.md`, `docs/queue.md`, `tools/api-surface/src/manifest.ts`.
2. Cross-checked `api.md §9` (frozen v0.1 public exports per package) against the manifest.
3. Cross-checked `docs/queue.md` status legend entries against `git log --oneline origin/main` and `gh pr list`.
4. Read `packages/react/src/grid.tsx` against `accessibility-rfc §Semantic DOM Model` + `§Keyboard Model` + `§Live Regions`.
5. Read `packages/react/src/keyboard.ts` against `accessibility-rfc §Keyboard Model` table.
6. Spot-checked `prefers-reduced-motion` + `forced-colors` CSS coverage in `packages/theming/src/styles.css` and the `@bc-grid/animations` motion policy.

---

## Findings

Severity legend: **H** = production / spec-binding drift, **M** = quality / standards-strict, **L** = doc / process drift.

### F1 (M) — `api.md §9` and `tools/api-surface/src/manifest.ts` disagree on the v0.1 public surface

`api.md` declares itself the binding contract ("Once merged, `docs/api.md` (this file) is the binding contract"; "every PR runs an API-surface diff in CI"). The manifest is the machine-checkable form. They should be the same shape; today they are not, on four packages.

**`@bc-grid/virtualizer`** — api.md §9 lists 1 runtime + 5 type exports. Manifest enforces 2 runtime + 14 types. Manifest's note acknowledges the gap but api.md was not updated:

| Listed in api.md §9 | Also shipped (per manifest) |
|---|---|
| `Virtualizer` | `DOMRenderer` |
| `VirtualItem`, `VirtualOptions`, `VirtualizerA11yInput`, `VirtualRowA11yMeta`, `VirtualColumnA11yMeta` | `DOMRendererOptions`, `InFlightHandle`, `RenderCellParams`, `ScrollAlign`, `VirtualCol`, `VirtualRow`, `VirtualWindow`, `VirtualizerOptions` |

**`@bc-grid/animations`** — api.md §9 lists 4 runtime + 2 types. Manifest enforces 15 runtime + 22 types. The manifest note again acknowledges; api.md does not:

- Runtime extras: `DEFAULT_ANIMATION_MAX_IN_FLIGHT`, `HARD_ANIMATION_MAX_IN_FLIGHT`, `calculateFlipDelta`, `createFlashKeyframes`, `createFlipKeyframes`, `createSlideKeyframes`, `playFlip`, `prefersReducedMotion`, `readFlipRect`, `resolveMotionPolicy`, `shouldAnimateDelta`.
- Type extras: `AnimationBudgetOptions`, `FlipDelta`, `FlipOptions`, `FlipRect`, `FlipTarget`, `SlideDirection`, `SlideOptions`.

**`@bc-grid/react`** — api.md §9 lists `BcReactGridColumn as BcGridColumn`, `BcGridProps`, `BcEditGridProps`, `BcServerGridProps`, `BcGridStateProps`, `BcPaginationState`, `BcGridApi`, `BcServerGridApi`, `BcCellPosition`, `BcSelection`, `BcGridSort`, `BcGridFilter`, `BcColumnStateEntry`, `BcCellRendererParams`, `BcCellEditor`, `BcCellEditorProps`, `BcCellEditCommitEvent`, `BcValidationResult`, `BcReactFilterDefinition`, `BcFilterEditorProps` plus 4 server loaders. The actual `packages/react/src/index.tsx` re-exports a wider surface that the manifest correctly enforces:

- Type extras: `BcCellEditorPrepareParams`, `BcEditGridAction`, `BcFilterDefinition`, `BcGridDensity`, `BcGridMessages`, `BcColumnFilter`, `BcColumnFormat`, `ColumnId`, `RowId`, `ServerBlockQuery`, `ServerBlockResult`, `ServerPagedQuery`, `ServerPagedResult`, `ServerTreeQuery`, `ServerTreeResult`.

**`@bc-grid/core`** — `api.md §6.1` inlines `opts?: { align?: "start" | "center" | "end" | "nearest" }`, but the source extracted that to `BcScrollAlign` + `BcScrollOptions` named types (`packages/core/src/index.ts`). Both are in the manifest. `api.md §8 Server query types` enumerates 30 names; the manifest (and source) also export `ServerQueryBase` and `ServerRowIdentity`, neither listed in §8.

**Why this matters:** api.md is the consumer-facing spec; the manifest is what CI enforces. Today CI cleanly accepts a wider surface than api.md describes. A consumer reading api.md to plan a v0.1 build sees a smaller — and in places different-shaped — surface than what they'll actually see at runtime.

### F2 (L) — `docs/queue.md` is stale on three counts

1. `api-surface-diff` is tagged `[review: x1 #34]` but PR #34 is merged (`2d2bcea` on `origin/main`).
2. `virtualizer-impl` is tagged `[done: c1 #20+#21+#22+#23+#24]` but the impl-report PR (#26, `355955d`) was the closing PR of that workstream and should be in the tag.
3. `q1-vertical-slice-demo` is tagged `[blocked: depends on q1-sort + q1-keyboard-focus + q1-pinned-cols]`, but all three dependencies are merged (#27, #28, #33). The demo task should be `[ready]`.

### F3 (M) — Filter cells use `role="cell"` instead of `role="gridcell"`

`packages/react/src/grid.tsx:1150` (`renderFilterCell`) sets `role="cell"`. `role="cell"` is the WAI-ARIA role for cells in `role="table"`, not in `role="grid"` / `role="treegrid"`. Inside a `role="grid"` ancestor, all cell descendants must be `gridcell`, `columnheader`, or `rowheader`. The body-cell renderer does this correctly (`grid.tsx:1267` — `column.source.rowHeader ? "rowheader" : "gridcell"`); only the filter row cell renderer is wrong.

`accessibility-rfc §Semantic DOM Model` doesn't explicitly cover the filter row (the RFC predates `column-filter` PR #32), but the constraint "Body cells use `role="gridcell"`" plus the implicit ARIA grid pattern make `gridcell` correct. `data-density="compact"` and `data-bc-grid-react="v0"` — and in turn axe-core — may not yet flag this depending on version, but it is strict-spec wrong.

### F4 (M) — No live regions adjacent to the grid root

`accessibility-rfc §Live Regions` defines the contract:

```html
<div data-bc-grid-status role="status" aria-live="polite" aria-atomic="true" />
<div data-bc-grid-alert role="alert" aria-live="assertive" aria-atomic="true" />
```

Neither element is rendered by `<BcGrid>` (no occurrences of `data-bc-grid-status` or `data-bc-grid-alert` anywhere in the repo). The RFC's §Acceptance Criteria includes "Sort changes update `aria-sort` and announce through the polite region." `aria-sort` is correctly set on the active sort header (`grid.tsx:1056`); the announcement half is missing.

This is consistent with Q1 being a read-only vertical slice (no edit-commit / filter-changed / selection-changed events to debounce yet), but sort announcements are a documented Q1 acceptance item.

### F5 (L) — Local-only branches imply queue-claim-protocol violations

`git branch -a` shows two local branches (no remote, no open PR) for tasks the queue still labels `[ready]`:

- `agent/x1/nightly-perf-harness` ← queue: `nightly-perf-harness [ready]`
- `agent/x3/docs-q1-content` ← queue: `docs-q1-content [ready]`

Per `AGENTS.md §5`, claiming a task means editing `docs/queue.md` to `[in-flight: <agent>]` in the same commit that creates the branch. If those branches represent real work, the queue is out of sync; if they're abandoned, both can be deleted. They are local to the user's environment so I cannot inspect them — surfacing for the user / owning agents to confirm.

Also: `agent/x3` is a new agent identity (the existing namespace is c1 / x1 / x2 / c2). Worth flagging for naming consistency.

### Things I checked that are clean

- Kebab-case CSS convention from `design.md §13`: no `bc-grid__` BEM survivors anywhere except `packages/theming/tests/theming.test.ts` which asserts the negative, and historical references in `design.md §13` and `virtualizer-impl-plan.md` that are deliberately preserved as decision-log context. ✓
- `bcGridThemeClasses` mentioned by user as removed in #30: gone everywhere — sources, types, manifest, api.md. ✓
- `prefers-reduced-motion`: implemented in `@bc-grid/animations` (`prefersReducedMotion()`, `resolveMotionPolicy()`) and in `packages/theming/src/styles.css` at two breakpoints. ✓
- `forced-colors`: covered in `packages/theming/src/styles.css:247`. ✓
- Keyboard matrix in `packages/react/src/keyboard.ts` matches `accessibility-rfc §Keyboard Model` for Q1: arrows, Home/End, Ctrl+Home/End, PageUp/PageDown, Ctrl+Arrow extremes, Q3-reserved Shift+Arrow / Ctrl+A swallowed via `preventDefault`, Q2-reserved F2/Enter/Escape/printable noop'd. The data-edge "non-empty" semantics fall through to "last visible column" which is the RFC's documented fallback. ✓
- Active-cell DOM identity: `aria-activedescendant` is on the grid root (`grid.tsx:712`), `tabIndex={0}` on root only (`grid.tsx:713`), single-tab-stop focus model honoured, body cells set `id={cellDomId(...)}` and `aria-labelledby` correctly (`grid.tsx:1283`). ✓
- FLIP / animation handoff: `virtualizer.beginInFlightRow(rowIndex)` is reference-counted via `release()` chained off `animation.finished.finally`, matching `design.md §13` "in-flight retention is reference-counted, index-keyed, idempotent." ✓

---

## Recommendations and follow-up punch list

| ID | Severity | Action | Owner suggested |
|---|---|---|---|
| 001 | L | **Queue-sync PR** in this same PR: `api-surface-diff` `[review]`→`[done: x1 #34]`; `virtualizer-impl` add `#26`; `q1-vertical-slice-demo` `[blocked]`→`[ready]`. | c2 (this PR) |
| 002 | M | **Reconcile `api.md §9` with manifest.** Three options, in declining preference: (a) update §9 to enumerate every shipped public export (verbose but unambiguous); (b) keep §9 short and add a "see manifest for full list" sentence per package noting deliberate engine-internal extras; (c) trim manifest to match §9 (a code change, breaks DOMRenderer/InFlightHandle consumers in the React layer — not realistic). I'm doing (b) in this PR plus filling in the few names that are clearly v0.1 consumer surface (`BcGridDensity`, `BcGridMessages`, `BcEditGridAction`, `BcCellEditorPrepareParams`, `BcScrollAlign`, `BcScrollOptions`, `ServerQueryBase`, `ServerRowIdentity`). | c2 (this PR) |
| 003 | M | **Filter cell role**: change `role="cell"` to `role="gridcell"` in `renderFilterCell` (`packages/react/src/grid.tsx:1150`). One-line fix; deferred to a follow-up PR so this audit PR stays doc-only and reviewable in isolation. | follow-up; size XS |
| 004 | M | **Live regions**: add `[data-bc-grid-status]` polite + `[data-bc-grid-alert]` assertive regions per `accessibility-rfc §Live Regions`. Wire sort-change / filter-change / selection-change announcements (selection is Q3-reserved so the alert region can stay empty for v0.1, but the polite region should announce the two state changes that exist today). Sized small-to-medium; could pair with the q1-vertical-slice-demo work. | follow-up; size S/M |
| 005 | L | **Branch-claim hygiene**: confirm with x1 / x3 whether `agent/x1/nightly-perf-harness` and `agent/x3/docs-q1-content` are active. If yes, queue-sync to `[in-flight: …]`; if abandoned, drop the branches. (I cannot do this without authorship context.) | user / owning agents |
| 006 | L | **Agent namespace**: confirm `x3` is a sanctioned identity and if so add a line to `AGENTS.md` / the integrator's parallel-work doc. | user |

---

## What this audit PR contains

1. This file (`docs/audit-c2-001.md`) — the audit report itself.
2. `docs/queue.md` — corrections per F2 (item 001 above).
3. `docs/api.md` — additions per F1 / item 002 above.

Items 003–006 are deferred to follow-up PRs / human triage so this PR stays scoped to documentation reconciliation.

---

## What I'll watch for going forward

- Every new PR: `api.md §9` + manifest match; `accessibility-rfc` ARIA contracts preserved; CSS class convention stays kebab-case; design.md §13 entries appended for cross-cutting decisions.
- Every audit pass: `queue.md` reconciled with `gh pr list --state merged` since the last audit; live regions present once Q2 / q1-vertical-slice-demo work begins; screenreader-spot-check + nightly-perf-harness moved out of `[ready]` if claimed.
- Backlog: F3 / F4 are the highest-leverage follow-ups. Both are small enough to file in a single afternoon by any agent who picks them up.
