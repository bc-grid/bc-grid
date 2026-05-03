# Row-state cascade scoping (master ↔ nested grid) RFC

**Status:** Draft for maintainer ratification
**Author:** worker3 (Claude)
**Reviewer:** maintainer (JohnC) + Claude coordinator
**Target release:** v0.6.0 (alpha.3 → GA path)
**Implementation lane:** worker3 (theming)
**Informed by:** bsncraft v0.5.0-alpha.2 consumer pass (2026-05-03), `docs/design.md §6.3` (post-layout-pass DOM structure), `docs/design/layout-architecture-pass-rfc.md`, planning doc §4 (visual contract consolidation, shipped #424).

---

## 1. Problem statement

bsncraft's alpha.2 consumer pass surfaced a row-state cascade bug in nested grids: hovering a row in the master `<BcGrid>` paints the hover background on every cell of any nested `<BcGrid>` rendered inside that row's expanded `renderDetailPanel`. The visual is jarring (the entire nested grid lights up when the user hovers the parent row) and structurally wrong — row-state belongs to its own row, not to anything happening in a master row two stacking-context levels up.

Same bug hits `aria-selected`, `data-bc-grid-focused-row`, and the pinned-cell linear-gradient state layers. Not just `:hover`.

The cause is descendant-combinator selectors in `packages/theming/src/styles.css` that the v0.5 design didn't anticipate would match across nested grid boundaries:

```css
/* every one of these matches across a nested .bc-grid boundary */
.bc-grid-row:hover .bc-grid-cell { ... }
.bc-grid-row[data-bc-grid-focused-row="true"] .bc-grid-cell { ... }
.bc-grid-row[aria-selected="true"] .bc-grid-cell { ... }
.bc-grid-row[aria-selected="true"]:hover .bc-grid-cell { ... }
.bc-grid-row[aria-selected="true"][data-bc-grid-focused-row="true"] .bc-grid-cell { ... }
.bc-grid-row[aria-selected="true"] .bc-grid-cell-pinned-left { ... }
.bc-grid-row[aria-selected="true"] .bc-grid-cell-pinned-right { ... }
.bc-grid-row[aria-selected="true"]:hover .bc-grid-cell-pinned-left { ... }
.bc-grid-row[aria-selected="true"]:hover .bc-grid-cell-pinned-right { ... }
.bc-grid-row[aria-selected="true"][data-bc-grid-focused-row="true"] .bc-grid-cell { ... }
.bc-grid-row[aria-selected="true"] .bc-grid-cell[data-bc-grid-active-cell="true"] { ... }
.bc-grid-row[data-bc-grid-focused-row="true"] .bc-grid-cell-pinned-left { ... }
.bc-grid-row[data-bc-grid-focused-row="true"] .bc-grid-cell-pinned-right { ... }
.bc-grid-row:hover .bc-grid-cell-pinned-left { ... }
.bc-grid-row:hover .bc-grid-cell-pinned-right { ... }
```

The render graph (post-layout-pass — `docs/design.md §6.3`):

```
.bc-grid (master)
└── .bc-grid-viewport
    └── .bc-grid-canvas
        ├── .bc-grid-header
        ├── .bc-grid-row (master row 0)         ← :hover triggers here
        │   ├── .bc-grid-cell (master cell)
        │   └── .bc-grid-detail-panel-slot
        │       └── .bc-grid-detail-panel
        │           └── (consumer JSX — typically nested .bc-grid)
        │               └── .bc-grid (nested)
        │                   └── .bc-grid-viewport
        │                       └── .bc-grid-canvas
        │                           └── .bc-grid-row     ← matches `.bc-grid-row:hover .bc-grid-cell`
        │                               └── .bc-grid-cell ← gets parent's hover bg
        └── .bc-grid-row (master row 1)
```

The descendant combinator (`A B`) matches **any descendant** in the DOM tree, regardless of nested context. Pre-bsncraft this never bit because the demo grids didn't nest grids inside detail panels. bsncraft's customers + invoices grids do.

## 2. Scope and non-goals

**In scope (v0.6.0):**

- Scope every row-state selector in `packages/theming/src/styles.css` so it does not match across a nested `.bc-grid` boundary.
- Apply the same scoping to the pinned-cell state-tint linear-gradient layers (memo 1 of the layout pass; the `5341af3` shading parity work).
- Apply the same scoping to the active-cell highlight (`.bc-grid-row[aria-selected="true"] .bc-grid-cell[data-bc-grid-active-cell="true"]`).
- One Playwright spec demonstrating the fix (master grid + detail panel containing a nested grid; hover the master row; assert nested cells do NOT take the master's hover bg).
- Update `docs/migration/v0.6.md` if a consumer-visible CSS class name changes (the recommended fix below does NOT change class names — pure selector tightening).

**Out of scope:**

- Row-state on the chrome surfaces themselves (header / filter row). Those have no `:hover` state today and the bug doesn't affect them.
- Per-cell state (`data-bc-grid-edit-state`, `data-bc-grid-active-cell`). These already use cell-scoped selectors, not row-descendant selectors — the planning doc §4 consolidation (#424) removed the last cross-cascade case.
- Range overlay (`.bc-grid-range-overlay`). Not a row-state selector.
- Master ↔ nested grid keyboard-focus coordination. That's `accessibility-rfc §Focus-trap-in-nested-grids` (open question, separate RFC).

## 3. Recommended fix: scope each row-state selector with `:not(.bc-grid-detail-panel *)` style guard

Three plausible fix shapes, evaluated below. The recommendation is **(B) — `:not(.bc-grid .bc-grid-row)` style guard** for browser-support reasons.

### (A) CSS `@scope`

```css
@scope (.bc-grid-row) to (.bc-grid-detail-panel) {
  :scope:hover {
    background: var(--bc-grid-row-hover);
  }
  :scope:hover .bc-grid-cell {
    background: var(--bc-grid-row-hover);
  }
  /* …repeat for each row-state ... */
}
```

The `to` clause stops the scope at the detail-panel boundary, so descendant selectors inside the scope never match the nested grid's elements.

**Cleanest semantically.** This is what `@scope` was designed for. Selectors stay short; the scope rules stay localised.

**Browser support concern.** `@scope` shipped in Chrome 118 (Oct 2023), Safari 17.4 (Mar 2024), Firefox 128 (Jul 2024). Most consumer browsers as of 2026-05-03 support it, but bsncraft's customer base spans LTS Chromium-based POS terminals + corporate IE-Edge fleets + tax-prep boxes that lag the bleeding edge. We don't have a concrete list of consumer browsers below those minimums, but a hard requirement on `@scope` would be a v0.6 ship-blocker if any single bsncraft customer falls below.

### (B) `:not(...)` selector guard *(recommended)*

For each affected rule, exclude rows that are descendants of a `.bc-grid-detail-panel`:

```css
.bc-grid-row:hover:not(.bc-grid-detail-panel .bc-grid-row),
.bc-grid-row:not(.bc-grid-detail-panel .bc-grid-row):hover .bc-grid-cell {
  background: var(--bc-grid-row-hover);
}
```

The `:not()` pseudo-class with a complex selector argument is a Selectors Level 4 feature shipped in every browser since 2021 (Chromium 88, Firefox 84, Safari 14.1). No browser-support concerns.

**Semantics.** Each row-state selector becomes "match a `.bc-grid-row` that is NOT a descendant of `.bc-grid-detail-panel .bc-grid-row`" — i.e., the master row's selectors only match master-grid rows. The nested grid's rows still match the same selectors *inside their own scope* because the nested `.bc-grid-row` IS a descendant of `.bc-grid-detail-panel .bc-grid-row`, but the nested grid mounts its OWN matching rule (which becomes `.bc-grid-detail-panel .bc-grid .bc-grid-row` after the `:not()` boundary).

Wait — that doesn't quite work. Let me re-think.

The correct shape is to gate each rule on "this `.bc-grid-row` is not nested inside another `.bc-grid`". A `:not()` containing the ancestor pattern `.bc-grid .bc-grid` is what we need:

```css
/* Apply hover ONLY when the row is at the closest .bc-grid scope —
   i.e., is not nested inside another .bc-grid. */
.bc-grid:not(.bc-grid .bc-grid) .bc-grid-row:hover {
  background: var(--bc-grid-row-hover);
}
.bc-grid:not(.bc-grid .bc-grid) .bc-grid-row:hover .bc-grid-cell {
  background: var(--bc-grid-row-hover);
}
```

Wait — `:not(.bc-grid .bc-grid)` checks that the element is NOT a `.bc-grid` that is itself a descendant of a `.bc-grid`. That gates the OUTERMOST `.bc-grid`. But the nested grid's rules need to fire when its own row hovers… which they should, scoped to the nested grid. The `:not()` filter eliminates the outer-grid scope from cascading INTO the nested grid; the nested grid's rules still fire because the inner `.bc-grid` is matched by its own descendant rules (using `.bc-grid .bc-grid-row` which matches nested rows).

Hmm this is getting confusing. Let me try yet another shape — gate on the row, not the grid:

```css
/* Match a .bc-grid-row that is the CLOSEST .bc-grid-row up the tree —
   i.e., not nested inside another .bc-grid-row that's hovering. */
.bc-grid-row:hover:not(:has(.bc-grid-row:hover)) .bc-grid-cell {
  background: var(--bc-grid-row-hover);
}
```

`:has()` shipped in Chrome 105, Safari 15.4, Firefox 121 — also broadly supported. But `:has()` has a known performance overhead in deep trees, and applying it to EVERY row-state selector compounds. We'd want to measure before committing.

**Simpler shape that actually works without `:has()` or `@scope`:** gate on the `.bc-grid-cell`, not the `.bc-grid-row`:

```css
/* The descendant combinator stays. The scope guard lives on .bc-grid-cell:
   only apply the row-hover bg when the cell is NOT inside a nested grid. */
.bc-grid-row:hover .bc-grid-cell:not(.bc-grid-detail-panel .bc-grid-cell) {
  background: var(--bc-grid-row-hover);
}
```

`:not(.bc-grid-detail-panel .bc-grid-cell)` excludes any `.bc-grid-cell` that is a descendant of a `.bc-grid-detail-panel`. The nested grid's cells ARE descendants of the master's `.bc-grid-detail-panel`, so they don't match. The master grid's cells (siblings of the detail panel inside the row) DO match, so they still get the hover bg. ✓

Same shape works for the `.bc-grid-cell-pinned-left` / `.bc-grid-cell-pinned-right` / `[data-bc-grid-active-cell]` variants.

For the row-itself rule (`.bc-grid-row:hover { background: ... }`), the analogous guard:

```css
.bc-grid-row:hover:not(.bc-grid-detail-panel .bc-grid-row) {
  background: var(--bc-grid-row-hover);
}
```

This rejects any `.bc-grid-row` that is a descendant of a `.bc-grid-detail-panel`. The master row matches; the nested rows don't. ✓

**Selector size impact.** Each affected rule grows by ~30 chars (the `:not(.bc-grid-detail-panel ...)` clause). 16 rules × ~30 chars = ~480 bytes pre-gzip; ~150 bytes post-gzip. Negligible bundle impact.

**Specificity impact.** `:not(X)` has the specificity of `X`. `.bc-grid-detail-panel .bc-grid-cell` has specificity (0, 0, 2). Adding `:not(...)` raises each affected selector by (0, 0, 2). The headers / filter-row selectors don't include this guard, so their specificity stays the same. **Net: cascade order is unchanged because every affected row-state rule gains the same +2 specificity, preserving relative ordering between rules.** Verify in the implementation by running the existing pinned-cell shading parity tests + the visual-regression baselines.

### (C) Per-grid `data-bc-grid-id` attribute selectors

Stamp each grid root with a unique `data-bc-grid-id` and use attribute-equality selectors so cross-grid descendants don't match. ~50-100 LOC of TypeScript wiring + a unique-id generator + invalidation logic. Massive over-engineering for the cascade scoping problem; reject.

### Recommendation summary

| Approach | Browser support | Bundle | Specificity | Implementation cost |
|---|---|---|---|---|
| (A) `@scope` | Chrome 118+, Safari 17.4+, Firefox 128+ | smaller | unchanged | small (CSS only) |
| **(B) `:not()` guard on cell-side** | universal (Selectors L4) | +~150 B gz | +2 per rule (uniform) | small (CSS only) |
| (C) per-grid `data-bc-grid-id` | universal | +TS code | controlled | high (TS wiring + tests) |

**Recommend (B).** Universal browser support, smallest implementation cost, no semantic risk, no consumer-visible class-name changes. (A) is cleaner and worth revisiting once `@scope` is in every consumer browser; (C) is rejected.

## 4. Affected selectors (concrete inventory)

The table below is the exhaustive inventory of selectors in `packages/theming/src/styles.css` that need the `:not(...)` scope guard. Verified by grep against `.bc-grid-row` + `.bc-grid-cell-pinned-*` selectors at HEAD.

| Line | Selector | Guard form |
|---|---|---|
| 243 | `.bc-grid-row:hover` | `:not(.bc-grid-detail-panel .bc-grid-row)` on the row |
| 247 | `.bc-grid-row[data-bc-grid-focused-row="true"]` | same |
| 251 | `.bc-grid-row[aria-selected="true"]` | same |
| 256 | `.bc-grid-row[aria-selected="true"]:hover` | same |
| 260 | `.bc-grid-row[aria-selected="true"][data-bc-grid-focused-row="true"]` | same |
| 824 | `.bc-grid-row[data-bc-grid-focused-row="true"] .bc-grid-cell` | `:not(.bc-grid-detail-panel .bc-grid-cell)` on the cell |
| 828 | `.bc-grid-row:hover .bc-grid-cell` | same |
| 832 | `.bc-grid-row[aria-selected="true"] .bc-grid-cell` | same |
| 838 | `.bc-grid-row[aria-selected="true"]:hover .bc-grid-cell` | same |
| 842 | `.bc-grid-row[aria-selected="true"][data-bc-grid-focused-row="true"] .bc-grid-cell` | same |
| 869 | `.bc-grid-row[aria-selected="true"] .bc-grid-cell[data-bc-grid-active-cell="true"]` | same |
| 903 | `.bc-grid-row:hover .bc-grid-cell-pinned-left` | `:not(.bc-grid-detail-panel .bc-grid-cell-pinned-left)` |
| 904 | `.bc-grid-row:hover .bc-grid-cell-pinned-right` | `:not(.bc-grid-detail-panel .bc-grid-cell-pinned-right)` |
| 908-910 | `.bc-grid-row[data-bc-grid-focused-row="true"] .bc-grid-cell-pinned-{left,right}` | same |
| 913-916 | `.bc-grid-row[aria-selected="true"] .bc-grid-cell-pinned-{left,right}` (4 selector list members) | same (each member) |
| 921-927 | `.bc-grid-row[aria-selected="true"]:hover .bc-grid-cell-pinned-{left,right}` | same |

**Total: 16 affected rules.** Implementation: a single sweep through `packages/theming/src/styles.css` adding the `:not(...)` guard to each. ~30 minutes of mechanical editing + careful testing.

## 5. Test plan

**Unit (worker3 writes; coordinator runs at merge):**

- Extend `packages/theming/tests/theming.test.ts` with source-shape pins on the `:not(...)` guard for each of the 16 affected selectors. Catches a future refactor that drops the guard from a single rule.

**Playwright (worker3 writes one happy-path; coordinator runs at merge):**

`tests/nested-grid-row-state-cascade-scoping.pw.ts` — new spec:

1. Mount `<BcGrid>` with `renderDetailPanel` configured.
2. Render a nested `<BcGrid>` inside the detail panel with 3 rows.
3. Expand row 0's detail panel.
4. Hover row 0 of the master grid; assert the master cells take the hover bg AND the nested grid's cells do NOT.
5. Repeat the assertion for `aria-selected` (click row 0 of the master, assert nested cells stay unselected) and `data-bc-grid-focused-row` (Tab into row 0, assert nested cells stay unfocused).
6. Hover row 0 of the NESTED grid; assert the nested row takes the hover bg AND the MASTER row's hover state stays as it was.

**Visual regression baselines:** 1 new screenshot at the master-row-hover + nested-grid intersection. Coordinator updates baselines at merge.

**Existing perf bars:** unchanged. The `:not(...)` evaluation is O(N) with the matched element's ancestor chain depth, which is small (~10 levels max in any practical grid). No measurable perf cost.

## 6. Implementation sequence (after RFC ratifies)

1. Single PR (worker3 lane, ~half day):
   - Extend `packages/theming/src/styles.css` 16 rules with the `:not(...)` guard per the table in §4.
   - Add the source-shape unit tests.
   - Add the Playwright spec stub (coordinator runs at merge).
   - Update `docs/design.md §13` decisions table with a 2026-05-04 row noting the cascade-scoping guard.

   No public API surface change. No consumer-visible class-name change. No `BcUserSettings` extension. No migration doc entry needed because the fix is purely additive — nothing breaks.

2. Coordinator runs visual regression + Playwright at merge.

3. After v0.6 ships and `@scope` is in all consumer browsers, optionally migrate from (B) to (A) for cleaner CSS. Tracked as a v0.7 follow-up; not load-bearing.

## 7. Open questions for the maintainer

1. **`@scope` vs `:not()` guard — confirm (B).** RFC recommends (B) for universal browser support. Maintainer overrides if there's a known consumer browser ≥ Chrome 118 baseline (in which case (A) ships cleaner CSS).
2. **Nested-grid keyboard focus coordination — out of scope here?** The cascade-scoping fix is independent of focus management (e.g., should Tab from a master cell enter the nested grid or skip over it?). Confirm that's a separate `accessibility-rfc` follow-up.
3. **Pinned-cell state-tint composition — verify the test from `5341af3` still passes.** The `:not(...)` guard adds +2 specificity. The pinned-cell shading parity rules already specify `.bc-grid-row .bc-grid-cell-pinned-left` etc. The new guard preserves the source-token alignment but the existing test should validate it explicitly.
4. **Visual regression baseline — net any pixel drift?** The fix removes a cascade BUG; pixels CHANGE inside nested grids that previously rendered with parent-row-state styling. Baseline regeneration is expected. Confirm this is acceptable for the v0.6 release line (yes per RFC §10 of the layout pass — v0.6 is the chrome-rewrite release).
5. **Should the fix ship in alpha.4 (next minor) or hold for GA?** alpha.4 lets bsncraft validate before GA; GA-only delays them. RFC recommends alpha.4 — the fix is small + tested + structural, and bsncraft is the consumer surfacing the bug.

## 8. Estimated scope

- **RFC ratification:** this doc, ~30 min maintainer review + ratification call.
- **Implementation PR:** ~half day worker3 lane (CSS sweep + unit tests + pw spec + design.md decision row).
- **Coordinator at-merge:** ~30 min (visual regression baseline regen + pw run).

**Total: ~half day end-to-end.**

---

**This RFC documents the design and the open questions for maintainer ratification. Implementation may proceed under the autonomous-decisions authorisation once Q1 (the `@scope` vs `:not()` choice) is confirmed; the RFC's job is to record the shape so worker3 + bsncraft can validate against it before the code lands.**
