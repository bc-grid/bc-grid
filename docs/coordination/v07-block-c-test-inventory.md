# v0.7 Block C — Editor migration test inventory

**Status:** prep work for `v07-radix-combobox-editors` (PR-C2). Compiled while Block C is blocked on worker2's PR-A1 (`v07-radix-shadcn-deps-and-scaffolding`).
**Date:** 2026-05-04
**Owner:** worker3 (Claude — editor + keyboard/a11y + lookup UX lane)
**RFC:** `docs/design/shadcn-radix-correction-rfc.md` §Block C
**Handoff item:** `agent/worker3/v07-radix-combobox-editors` per `docs/coordination/handoff-worker3.md` §Block C PR-C2.

PR-C2 deletes `packages/editors/src/internal/combobox.tsx` (~600 LOC) + `combobox-search.tsx` (~440 LOC). Per RFC §Migration constraints #2: **Playwright coverage added BEFORE deletion**. This doc inventories existing coverage on the three combobox-driven editors (`selectEditor`, `multiSelectEditor`, `autocompleteEditor`) and maps it against the test bar the handoff specs:

> Add Playwright assertions: select-edit happy path, multi-select toggle, autocomplete typeahead with async options, prepareresult preload, Enter contract pinned in #427, focus return after commit.

The matrix below tells PR-C2 (whoever picks it up) exactly what's already covered, what's skipped, and what new assertions need to land before the deletion is safe.

---

## Coverage matrix

### `selectEditor`

**Playwright** — `apps/examples/tests/editor-select.pw.ts`:

| Test | Line | Status |
| --- | --- | --- |
| mounts a Combobox trigger with the editor-kind data attribute | 45 | ✅ |
| renders one option per column.options entry | 56 | ✅ |
| pre-selects the existing cell value | 70 | ✅ |
| commit persists the new selection to the cell display | 81 | ✅ |
| mounts in popup mode (in-cell-editor-mode-rfc §4: dropdown overflows) | 105 | ✅ |
| preloads options from column.fetchOptions on first paint | 132 | ⛔ **`test.skip`** — RFC bar requires this to pass before deletion |

**Unit** — `packages/editors/tests/select.test.ts`:
- 9 tests covering: accessible name resolution, options resolution (flat + row-scoped), label normalisation, value stringify, seed matching, printable seed first-match, swatch/icon preservation (audit P0-4), missing initial value placeholder.
- 3 prepare-hook tests (preload via `column.fetchOptions`, undefined when no fetchOptions, reject propagation for graceful prepare).

### `multiSelectEditor`

**Playwright** — `apps/examples/tests/editor-multi-select.pw.ts`:

| Test | Line | Status |
| --- | --- | --- |
| mounts a multi-mode Combobox trigger with the editor-kind data attribute | 51 | ✅ |
| renders one option per column.options entry | 66 | ✅ |
| pre-selects every value present in the row's flags array | 79 | ✅ |
| commit produces an array of typed values + cell renderer reflects every value | 93 | ✅ |
| validation rejection keeps the editor open and announces via assertive region | 137 | ✅ |
| mounts in popup mode (in-cell-editor-mode-rfc §4: dropdown + chip lane overflow) | 162 | ✅ |
| preloads options from column.fetchOptions on first paint | 187 | ⛔ **`test.skip`** — same gap as select |
| **MISSING:** explicit toggle/untoggle behaviour | — | ⚠️ Toggle is implicit in the commit test (line 93) but not isolated. Per RFC handoff "multi-select toggle" bar, suggest a focused Space-toggles-on-active-option test. |

**Unit** — `packages/editors/tests/multiSelect.test.ts`:
- 3 prepare-hook tests (mirror selectEditor's).

### `autocompleteEditor`

**Playwright** — `apps/examples/tests/editor-autocomplete.pw.ts`:

| Test | Line | Status |
| --- | --- | --- |
| mounts a Combobox-search input with the editor-kind data attribute | 53 | ✅ |
| input pre-fills with the existing cell value | 72 | ✅ |
| typing fires fetchOptions and the listbox updates with filtered options | 82 | ✅ (covers async typeahead) |
| commit produces a string value (valueParser trims) reflected by the cell renderer | 99 | ✅ |
| validation rejection keeps the editor open and announces via assertive region | 120 | ✅ |
| mounts in popup mode (in-cell-editor-mode-rfc §4: async dropdown overflows) | 137 | ✅ |
| **MISSING:** `prepareResult` preload paints first-frame options before keystroke | — | ⚠️ Covered at unit level (`autocomplete.test.ts:133`) but no e2e assertion that the dropdown actually paints with prepared options on mount before any keystroke. |
| **MISSING:** supersedure aborts in-flight `fetchOptions` (race-handling) | — | ⚠️ Covered at unit level (`autocomplete.test.ts:15-65`, 4 tests) but no e2e validation. RFC's `cmdk` swap may need this to surface in the new primitive. |

**Unit** — `packages/editors/tests/autocomplete.test.ts`:
- 4 request-controller tests (abort superseded lookups, ignore stale, failed lookup leaves options unchanged, missing fetchOptions clears).
- 3 prepare-hook tests (mirror select / multiSelect).

### Internal `Combobox` primitive — to be deleted

**Unit** — `packages/editors/tests/combobox.test.ts`:
- `findOptionIndexByValue` (3 tests): exact match, string-coerce, missing → -1.
- `selectedIndicesFromValues` (5 tests): index mapping, caller-order preservation, drops missing, empty array, drops nullish.
- **`#427` Enter contract (5 tests, multi-mode silent-data-loss prevention):**
  - Enter handler gates `updateSelection` on `!isMulti`.
  - Enter returns early without `preventDefault` so the editor portal sees the same event.
  - Space remains the toggle gesture in every mode.
  - Source-comment cites the audit + the silent-data-loss reason.
- `initialOptions` wiring (3+ tests): ComboboxBaseProps declares `initialOptions`, primitive prefers `initialOptions` over `options`, etc.

**These tests are source-shape + helper-pure regression guards.** They pin the contract on the in-house `Combobox`. After PR-C2 deletes the primitive, the equivalents on the new shadcn / cmdk-backed Combobox need different test mechanics (DOM-mounted via `@testing-library/react` per RFC's PR-A2 happy-dom infra).

The Enter contract (#427) is the highest-risk migration item: cmdk's default Enter behaviour in multi-select mode needs a behaviour audit + a pinned test before deletion. Per the source comment in `combobox.test.ts:117`: "the silent-data-loss reason."

---

## PR-C2 acceptance bar — what must land before deletion

Before `combobox.tsx` + `combobox-search.tsx` can be deleted, every row below must be ✅:

| Bar | Currently | Gap to close |
| --- | --- | --- |
| select edit — happy path | ✅ Playwright covers mount/options/pre-select/commit/popup | None |
| multi-select toggle | ✅ implicit; ⚠️ no isolated toggle test | Add focused "Space toggles active option" Playwright assertion |
| autocomplete typeahead with async options | ✅ keystroke fires fetchOptions + listbox updates | None |
| **prepareresult preload (e2e)** | ⛔ both select-batch + multi-select tests are `test.skip` | **Un-skip both + add equivalent for autocomplete.** RFC explicitly requires this. |
| Enter contract #427 | ✅ unit-level source-shape; ⛔ no e2e | **Add e2e: multi-mode Enter does NOT toggle the active option (mirrors the unit guard). Single-mode Enter picks + commits.** |
| focus return after commit | ⛔ `editor-focus-retention.pw.ts` — both tests are `test.skip` | **Implement the example-app fixture the skips reference, or add direct focus-return assertions to each editor's existing happy-path test.** |
| swatch / icon rendering (audit P0-4) | ✅ unit `select.test.ts:89-122` | Add e2e if the cmdk migration changes the markup contract — check `data-bc-grid-editor-swatch` survives the migration. |

Plus the acceptance bar from the RFC §Migration constraints (every PR):

1. ✅ no public API change (verified via `bun run api-surface`)
2. ⛔ Playwright coverage added BEFORE deletion (the gaps above)
3. ⛔ Bundle baseline (PR-A1 establishes; PR-C2 may grow only when the matching deletion lands in the same PR)

---

## Recommended PR-C2 task ordering

Once worker2's PR-A1 + PR-A2 land, PR-C2's body should be:

1. **Add the missing Playwright assertions FIRST** (un-skip preload, add Enter-contract e2e, add focus-return assertions, add multi-toggle isolated test). These should pass against the current in-house Combobox to baseline behaviour.
2. **Then** swap each editor's body to import from `packages/editors/src/shadcn/Combobox.tsx` (the shadcn / cmdk-backed foundation from PR-C1).
3. **Then** delete `combobox.tsx` + `combobox-search.tsx`.
4. **Then** verify all the Playwright tests added in step 1 still pass against the new foundation.
5. **Then** migrate the unit tests in `combobox.test.ts` — the helpers (`findOptionIndexByValue`, `selectedIndicesFromValues`, `editorOptionToString`) survive as pure helpers; the source-shape Enter-contract pins move to either a happy-dom DOM-mounted test or a Playwright assertion.

This sequencing keeps the tree green at every step: between steps 1 and 2 all tests pass against the OLD primitive, between steps 2 and 3 all tests pass against the NEW primitive, step 3 is just file removal that the test suite never touches.

---

## Out of scope for PR-C2

- `triggerComponent` + `optionItemComponent` slot wiring — those land in PR-C3 (`v07-shadcn-editor-render-prop-slots`) on top of the new foundation, mirroring the `inputComponent` / `checkboxComponent` pattern from #480 / #488 / #489. The closed PR #497 had a children-as-slot prototype — it's the wrong shape for shadcn's Command primitive (which uses `cmdk`'s internal item rendering, not children-as-slot). PR-C3 will design fresh against the actual shadcn primitive.
- Listbox virtualization for 5k+ option lists — `v07-editor-perf-large-option-lists`, queued separately. cmdk has its own virtualization story; deferring until the shadcn migration lands and the bench can measure the actual frame budget.
- Autocomplete `inputComponent` slot (the autocomplete-trigger-as-`<input>` slot) — closed in #500; folds into PR-C3.

---

## Why this inventory matters

PR-C2 is a destructive PR (deletes ~1k LOC). Without an explicit pre-flight checklist, the migration risks regressing subtle behaviours that the existing combobox unit-level pins catch (Enter contract, multi-mode silent-data-loss, race-handling on superseded fetches). This doc converts the migration constraint into a closeable checklist: every gap above must turn ✅ before the deletion lands.

If you're picking up PR-C2 (worker3 again, or coordinator), start by un-skipping the four `test.skip` Playwright tests + adding the Enter-contract e2e. Those alone close ~70% of the bar; the rest are mechanical from there.
