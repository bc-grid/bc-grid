# Test-coverage punchlist

**Author:** c2 (coordinator)
**Date:** 2026-04-30
**Snapshot:** `origin/main` after audit-c2-005 (#81) + follow-ups (#82/#83/#84)

This is the operational follow-up to audit-c2-005's "Test-coverage gaps" section. Each item below is a discrete `[ready]` task in `queue.md` if not already filed; agents can pick them up independently.

The list is split by **what the gap is** and **what kind of test fills it** (unit / e2e / integration). Effort estimates assume the existing fixture infrastructure (apps/examples for e2e, packages/*/tests for unit) is reused.

---

## Critical (v1.0 blockers if a regression slipped through)

None as of this snapshot. The 218 unit tests + 8 e2e files cover the v0.1-alpha critical paths. The items below are quality polish, not gates on the alpha release.

---

## High (should land within Phase 5.5)

### TC-01 — `<BcServerGrid>` integration test with deterministic abort sequencing
**Gap:** `serverRowModel.test.ts` covers the engine's dedup + abort logic with 4 unit tests. Nothing tests the React layer's wiring — `<BcServerGrid>` driving `loadPage` with rapid sort changes, then verifying the older request's promise resolution is dropped (per `latestBlockKeyRef` guard at `serverGrid.tsx:273`).

**Type:** integration unit test (jsdom + React Testing Library), or e2e with a fake `loadPage` returning controllable promises.

**Acceptance:** test mounts `<BcServerGrid>` with a `loadPage` that records each call and exposes a manually-resolvable promise; rapidly changes the `sort` prop 3 times; asserts that only the last call's resolution updates the rendered rows.

**Effort:** S (~50 lines, 1 fixture file).

**Files:** `packages/react/tests/serverGrid.test.tsx` (NEW).

### TC-02 — Search-highlight e2e
**Gap:** `searchHighlight.test.tsx` covers `splitSearchText` correctness in isolation. No test verifies the `<mark data-bc-grid-search-match="true">` element actually appears in the DOM under a real grid mount with a query string.

**Type:** Playwright e2e using `apps/examples` with a `?searchText=...` URL flag. Confirm the marks render, mark-text matches, theming (background colour) applies.

**Acceptance:** new `apps/examples/tests/search-highlighting.pw.ts` with at least 3 tests:
1. Setting a query produces `<mark>` elements with `data-bc-grid-search-match="true"`.
2. Empty query produces zero `<mark>` elements (validates the F3 optimization didn't break behaviour).
3. Case-insensitive match (`balance` query matches `Balance` text in headers/cells).

**Effort:** S (~30 lines).

### TC-03 — Row-select keyboard e2e (Space toggle)
**Gap:** Unit tests in `keyboard.test.ts` cover the `KeyboardNavOutcome` decision logic. No e2e validates the actual keystroke wiring through `<BcGrid>` to selection state.

**Type:** Playwright e2e using `apps/examples`.

**Acceptance:** new `apps/examples/tests/row-select-keyboard.pw.ts`:
1. Focus a row → press Space → row gets `aria-selected="true"`.
2. Press Space again on selected row → row gets `aria-selected="false"`.
3. Shift+Space and Ctrl+Space do NOT toggle (Q3-reserved per accessibility-rfc).
4. Space inside an editable element (e.g. inline filter input) does NOT toggle the row.

**Effort:** S (~50 lines).

---

## Medium (Phase 6 quality polish)

### TC-04 — Tooltip a11y + multi-tooltip + active-cell interaction
**Gap:** `tooltips.pw.ts` covers basic open-on-hover and open-on-focus cases (2 tests). It doesn't cover:
- Escape key closes the tooltip.
- Two tooltips can't both be open simultaneously (when focus moves cell → cell, the previous tooltip dismisses).
- `aria-describedby` correctly references the live tooltip element id.
- Active-cell focus model continues to work when a tooltip is open (`aria-activedescendant` doesn't get confused).

**Type:** Extend `apps/examples/tests/tooltips.pw.ts`.

**Acceptance:** 4 new tests covering each gap above.

**Effort:** S (~60 lines extending existing file).

### TC-05 — XLSX export buffer fidelity
**Gap:** `export.test.ts` covers CSV serialization with 8 tests. `toExcel` is invoked but the resulting buffer isn't compared against a fixture. We could regress numFmt formatting, autoFilter setup, frozen-row pane, etc., without noticing.

**Type:** Unit test + a fixture XLSX file checked into the repo.

**Approach:** Generate a tiny fixture (3 rows × 4 cols) with a known shape, write the buffer, parse it back via ExcelJS, and assert per-cell:
- value matches expected
- numFmt string matches expected (e.g., `"USD" #,##0.00` for currency cells)
- header row is frozen
- header row has autoFilter

**Effort:** M (~80 lines + fixture path setup).

**Files:** `packages/export/tests/xlsx.test.ts` (NEW).

### TC-06 — PDF export — at minimum, byte-level smoke
**Gap:** `toPdf` is invoked but the resulting buffer isn't asserted. PDF binary diff is fragile, but we can do a basic smoke:
- Buffer is non-empty.
- Buffer's first 8 bytes start with `%PDF-1.`.
- Buffer's last 6 bytes contain `%%EOF`.
- (Optional) Use `pdf-parse` to extract text and assert it includes column headers + row values.

**Type:** Unit test.

**Acceptance:** new `packages/export/tests/pdf.test.ts` with the four assertions above.

**Effort:** S (~40 lines).

### TC-07 — Cross-tab persistence storage event handling (informational, ties to F2 in audit-c2-005)
**Gap:** No test verifies what happens when localStorage is mutated by another tab while the grid is mounted. Currently the grid won't react until mount.

**Type:** Defer to F2 follow-up. When `cross-tab-persistence-storage-event` is implemented (post-v1), this test lands with it.

---

## Low (post-v1)

### TC-08 — Bundle-size CI: regression test for the gate itself
**Gap:** `bundle-size-ci-gate` (#59) checks each PR's bundle size against the manifest. Nothing exercises the gate's own logic — e.g., what happens when a package's `dist/index.js` is missing (build skipped), or when `gzip` produces a degenerate output.

**Type:** Unit test for `tools/bundle-size/src/checker.ts` (or wherever the logic lives).

**Effort:** S.

### TC-09 — Theming: dark mode + density combinations
**Gap:** `theming.test.ts` covers the token export shape. No e2e verifies the rendered colours actually change between light/dark/high-contrast and between compact/normal/comfortable density modes.

**Type:** Playwright visual-regression e2e (would require enabling Playwright snapshot tests, which the repo currently doesn't use).

**Effort:** M (would also pioneer the snapshot pattern).

**Defer to:** post-v1. The visual test infrastructure is a separate quality-of-life project.

### TC-10 — Smoke perf — assert `__bcGridPerf` global is the benchmarks-app one (audit-c2-005 F10)
**Gap:** If the smoke perf URL is mistakenly pointed at examples or docs apps, the test fails with an unhelpful "fps below bar" instead of a clear setup error.

**Type:** Add an early `expect(typeof window.__bcGridPerf?.mountGrid).toBe("function")` assertion in each smoke test.

**Effort:** XS (3-line edit per test).

---

## Coverage matrix (current state vs. target)

Rough sketch of where coverage stands at this snapshot. Numbers are eyeballed from test files + grep for assertions.

| Area | Unit tests | E2E tests | Notes |
|---|---:|---:|---|
| Virtualizer engine (Fenwick, in-flight, RAF, pinned) | ~96 | ~35 | Excellent. Pre-#50 baseline. |
| Animations (FLIP, slide, flash) | ~30 | covered by sort/scroll | Good. |
| Theming tokens / density | ~10 | none direct | Light/dark visual coverage missing. |
| Core types | (compile-only) | n/a | Type-check is the test. |
| **React layer overall** | ~90 | ~50 | Solid. |
| Sort (single + multi-col) | ~30 | 5 (multi) + 3 (single via vertical-slice) | Good. |
| Filter (text inline) | 4 | indirect (vertical-slice) | OK; future filter types each need own e2e. |
| Selection (algebra + checkbox col) | ~17 | 7 (checkbox) + 4 (click-modes) | Good. |
| Keyboard nav | ~16 | indirect | **TC-03 needed for Space-toggle.** |
| Persistence | 7 | 1 | One-shot covered; debounce not. **Cross-tab not covered.** |
| Search-highlight | 7 | 0 | **TC-02 needed.** |
| Tooltip | 0 | 2 | **TC-04 needed for a11y + escape + active-cell.** |
| Server-row-model engine | 4 | 0 | Engine clean; **TC-01 needed for React layer wiring.** |
| Export — CSV | 8 | 0 | Good (string assertions are sufficient for CSV). |
| Export — XLSX | 0 | 0 | **TC-05 needed.** |
| Export — PDF | 0 | 0 | **TC-06 needed.** |
| Live regions (polite) | 0 | 1 | Polite region asserted; assertive region is stubbed. |
| Bundle-size gate (the gate's own logic) | 0 | n/a | **TC-08 (low).** |
| Smoke perf gate | 3 active + 1 skipped | n/a | Setup-error guard missing (TC-10). |

**Total deltas to reach "comfortable" coverage:** 6 new test files (TC-01 + TC-02 + TC-03 + TC-05 + TC-06 + extension to tooltips.pw.ts) + 1 small assertion fix (TC-10). All sized S except TC-05 = M.

**Suggested order:** TC-01, TC-02, TC-03 first (high priority + Phase 5.5 alignment), then TC-04, TC-05, TC-06 in any order during Phase 6.

---

## How to claim a test-coverage task

Same protocol as feature tasks per `AGENTS.md §5`:

1. Find a `TC-NN` item above that's still `[ready]`.
2. Add an entry to `queue.md` under a new "Test-coverage backlog" section (or the appropriate Phase section if it ties to a feature):
   ```
   - [in-flight: <agent>] **TC-02 search-highlight-e2e** — see docs/coordination/test-coverage-punchlist.md TC-02. **Branch**: agent/<id>/tc-02-search-highlight-e2e. **Effort**: S.
   ```
3. Open the PR with `[review: <agent> #N]` tag flip in the same commit.
4. The test must pass on `examples-chromium` minimum; cross-browser is encouraged but not required for v0.1-alpha test infrastructure.

c2 will update this punchlist when items merge.
