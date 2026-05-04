# RFC: shadcn / Radix architecture correction

**Status:** ratified by maintainer 2026-05-04. Binding for v0.7.0.
**Author:** Claude (coordinator) — drafted at maintainer's instruction.
**Driver:** maintainer audit on 2026-05-04 found that bc-grid drifted from its stated architecture during the v0.4 → v0.6 sprint. The README states "Built on shadcn/Radix primitives from the ground up. No CSS-variable retrofit" and `docs/design.md` states "shadcn/Radix primitives — copied in via shadcn CLI, not runtime dep" + "Renders the chrome with shadcn primitives." The shipping codebase has **zero** `@radix-ui/*` imports across `packages/*/src` (`grep -rln '@radix-ui' packages/*/src` returns nothing). Every menu, popover, dismiss-handler, combobox, tooltip, and chevron icon was hand-rolled.

This RFC is the architecture-correction plan. It is not a "v0.7 nice-to-have." It is restoration of the design that was specified from day 1 and silently violated.

## TL;DR

Two parallel tracks across worker2 (chrome lane) and worker3 (editor lane), nine PRs total. Track is sequenced so each PR is independently mergeable, behind a public-API-equivalent surface (no consumer break), with the in-house primitives deleted only after the Radix replacement passes Playwright + smoke-perf. Worker1 stays on the server-grid lane through the correction (work is independent).

**Critical sourcing rule:** the shadcn primitives bc-grid copies are sourced from **bsncraft's `@bsn/ui` package** (`~/work/bsncraft/packages/ui/src/components/`), not from generic shadcn CLI defaults. Reasons:

1. **bsncraft is the canonical consumer.** bc-grid exists to render bsncraft's data. The chrome must match bsncraft's design system pixel-for-pixel — same buttons, same dropdown shells, same tooltip styling.
2. **Monorepo merge is planned.** Per `~/work/bsncraft/bc-grid.md`, bc-grid will move into `bsncraft/packages/bc-grid/` as a workspace package. When that happens, every `import { Foo } from "../shadcn/foo"` inside bc-grid swaps to `import { Foo } from "@bsn/ui/components/foo"` — mechanical, no behavior change. Sourcing from `@bsn/ui` today makes the merge a path swap, not a re-design.
3. **Radix version pin lock-step.** `@bsn/ui` pins specific `@radix-ui/*` minor versions; bc-grid's `packages/react/package.json` MUST pin the same versions. Drift means the eventual merge would force one side or the other to bump.

**bsncraft pinned versions to mirror in bc-grid (verified 2026-05-04 from `bsncraft/apps/web/package.json` + `bsncraft/packages/ui/package.json`):**

```jsonc
"@radix-ui/react-alert-dialog":  "^1.1.15",
"@radix-ui/react-avatar":        "^1.1.11",
"@radix-ui/react-checkbox":      "^1.3.3",
"@radix-ui/react-collapsible":   "^1.1.12",
"@radix-ui/react-context-menu":  "^2.2.16",
"@radix-ui/react-dialog":        "^1.1.15",
"@radix-ui/react-dropdown-menu": "^2.1.16",
"@radix-ui/react-label":         "^2.1.8",
"@radix-ui/react-popover":       "^1.1.15",
"@radix-ui/react-radio-group":   "^1.3.8",
"@radix-ui/react-scroll-area":   "^1.2.10",
"@radix-ui/react-select":        "^2.2.6",
"@radix-ui/react-separator":     "^1.1.8",
"@radix-ui/react-slot":          "^1.2.4",
"@radix-ui/react-switch":        "^1.2.6",
"@radix-ui/react-tabs":          "^1.1.13",
"@radix-ui/react-tooltip":       "^1.2.8",
"class-variance-authority":      "^0.7.1",
"cmdk":                          "^1.1.1",
"lucide-react":                  "^1.8.0"
```

**Sourcing instruction (binding for PR-A1 and PR-C1):** copy the relevant `.tsx` files from `~/work/bsncraft/packages/ui/src/components/` into `packages/react/src/shadcn/` (chrome) and `packages/editors/src/shadcn/` (combobox foundation). Do NOT regenerate via `bunx shadcn@latest add` — that would produce shadcn-default versions that drift from `@bsn/ui`. Files to copy from `@bsn/ui`: `dropdown-menu.tsx`, `context-menu.tsx`, `tooltip.tsx`, `popover.tsx`, `checkbox.tsx`, `tabs.tsx`, `dialog.tsx`, `sheet.tsx`, `command.tsx`, `popover.tsx`, `select.tsx`, `separator.tsx`, `scroll-area.tsx`, `label.tsx`. Preserve any local modifications bsncraft has made to the shadcn defaults (e.g., custom variants, additional utility classes).

Bundle target: stay under the 150 KiB hard cap. The correction is approximately neutral — Radix Popper / Floating UI / Radix DropdownMenu / Radix Popover / Radix Tooltip / cmdk / lucide-react together add ~12-18 KiB gzip; deletion of `context-menu.tsx` (532 LOC) + `menu-item.tsx` (175 LOC) + `popup-position.ts` (172 LOC) + `popup-dismiss.ts` + `tooltip.tsx` (291 LOC) + `combobox-search.tsx` + `combobox.tsx` + `disclosure-icon.tsx` + 4 of the 5 hand-rolled icon files saves ~10-14 KiB gzip. Net somewhere in the ±5 KiB range with substantial reduction in maintained surface.

SSR-test trade-off: Radix is client-only. The current `renderToStaticMarkup` tests in `contextMenu.markup.test.tsx`, `chromeContextMenu.test.ts`, etc. cannot remain as-is. Replace them with happy-dom or jsdom-backed `@testing-library/react` tests, gated by a separate test runner config (so the rest of bun test stays pure-helper-fast). RFC §6 covers the test-infrastructure update.

## What's in source today (verified 2026-05-04)

| Hand-rolled file | LOC | Replacement |
| --- | --- | --- |
| `packages/react/src/internal/context-menu.tsx` | 532 | `@radix-ui/react-dropdown-menu` (or `@radix-ui/react-context-menu` for the right-click path) |
| `packages/react/src/internal/menu-item.tsx` | 175 | `DropdownMenu.Item` / `DropdownMenu.CheckboxItem` |
| `packages/react/src/internal/popup-position.ts` | 172 | `@floating-ui/react-dom` (already a transitive dep of Radix Popper) |
| `packages/react/src/internal/popup-dismiss.ts` | ~120 | Radix's built-in dismiss (`onPointerDownOutside`, `onEscapeKeyDown`, focus-return) |
| `packages/react/src/internal/use-roving-focus.ts` | ~80 | Radix `RovingFocusGroup` |
| `packages/react/src/internal/disclosure-icon.tsx` | ~30 | `lucide-react` `ChevronRight` |
| `packages/react/src/internal/context-menu-icons.tsx` | ~120 | `lucide-react` |
| `packages/react/src/internal/header-icons.tsx` | ~80 | `lucide-react` |
| `packages/react/src/internal/pagination-icons.tsx` | ~60 | `lucide-react` |
| `packages/react/src/internal/panel-icons.tsx` | ~80 | `lucide-react` |
| `packages/react/src/internal/chrome-context-menu.ts` | ~200 | Wires the new Radix DropdownMenu items — keeps the items API surface (`BcContextMenuItem` etc.) |
| `packages/react/src/internal/context-menu-layer.tsx` | ~100 | Wraps Radix `ContextMenu.Trigger` over the grid viewport |
| `packages/react/src/tooltip.tsx` | 291 | `@radix-ui/react-tooltip` |
| `packages/editors/src/internal/combobox.tsx` | ~250 | `cmdk` + Radix Popover (the shadcn Combobox pattern) |
| `packages/editors/src/internal/combobox-search.tsx` | ~180 | Same shadcn Combobox surface, search-mode |
| `packages/react/src/filter.ts` (popup variant) | parts | `@radix-ui/react-popover` |
| `packages/react/src/filterToolPanel.tsx` | parts | Radix `Tabs` for the columns/filters/pivot panel toggles; `Sheet` (Radix Dialog) if we want the panels to slide in |
| `packages/react/src/columnVisibility.tsx` | parts | Radix `Checkbox` + `RovingFocusGroup` for the columns panel |
| `packages/react/src/pivotToolPanel.tsx` | parts | Same as filterToolPanel |

**Total deletable:** ~2,400 LOC under `internal/` plus ~600 LOC of hand-rolled chrome, in exchange for ~12 small `import { ... } from "@radix-ui/*"` lines.

## Public API contract

The Radix correction is **not** a breaking change for consumers.

- `BcContextMenuItem` / `BcContextMenuItems` / `BcContextMenuContext` — types preserved verbatim. Consumer-supplied items render through Radix DropdownMenu instead of the in-house renderer.
- `DEFAULT_CONTEXT_MENU_ITEMS` — preserved.
- `BcGridProps.contextMenuItems` — preserved.
- `BcGridProps.tooltip` (if any consumer uses our `BcGridTooltip`) — preserved.
- All editor exports (`textEditor`, `selectEditor`, `multiSelectEditor`, `autocompleteEditor`, etc.) — preserved.
- The shadcn-native render-prop slots (`inputComponent`, `checkboxComponent`, deferred `triggerComponent` / `optionItemComponent`) — preserved and now actually have a shadcn primitive underneath, so the slot work makes architectural sense.

The **internal** modules under `packages/react/src/internal/` and `packages/editors/src/internal/` are not part of the public API surface (per `tools/api-surface/src/manifest.ts` — only the package index exports are enforced). Their replacement does not require api-surface freeze coordination.

## Sequencing — 9 PRs, parallelisable across worker2 + worker3

### Block A — foundation (worker2, sequential, ~half day)

**PR-A1: Add Radix runtime deps + shadcn primitive scaffolding (sourced from `@bsn/ui`).** Add `@radix-ui/*` packages to `packages/react/package.json` `dependencies` at the **exact versions** listed in this RFC's TL;DR. Add `cmdk@^1.1.1`, `lucide-react@^1.8.0`, `class-variance-authority@^0.7.1`. Update `bun.lock`. Then **copy** (not regenerate) the relevant primitive `.tsx` files from `~/work/bsncraft/packages/ui/src/components/` into `packages/react/src/shadcn/`: `dropdown-menu.tsx`, `context-menu.tsx`, `tooltip.tsx`, `popover.tsx`, `checkbox.tsx`, `tabs.tsx`, `dialog.tsx`, `sheet.tsx`, `command.tsx`, `select.tsx`, `separator.tsx`, `scroll-area.tsx`, `label.tsx`. If those files import a local utility (e.g., `cn` from `@bsn/ui/lib/utils`), copy that utility too OR redirect the import to bc-grid's existing `cn`/`composeClassName` helpers — match the source's behavior, not its import path. Update `tools/bundle-size/src/manifest.ts` baseline expectations. No consumer-visible change yet.

**PR-A2: Test infra — happy-dom backed `@testing-library/react`.** Add `happy-dom` + `@testing-library/react` as devDependencies under `packages/react`. Add a separate `bun test --preload tests/dom-setup.ts packages/react/tests/dom/*` script. Move existing `renderToStaticMarkup`-based markup tests that need to test interactive Radix behavior into the new `dom/` directory. Pure-helper tests stay where they are.

### Block B — chrome migration (worker2, sequential after Block A, 4 PRs)

**PR-B1: Replace context-menu (right-click + keyboard Shift+F10).** Use `@radix-ui/react-context-menu`. The grid viewport gets wrapped in `ContextMenu.Root` + `ContextMenu.Trigger`. The `BcContextMenuItem` array maps 1:1 onto `ContextMenu.Item` / `ContextMenu.CheckboxItem` / `ContextMenu.Sub`. Submenu collision-flip falls out for free via Radix's Floating UI integration — delete the hand-rolled `useLayoutEffect` measurement and `data-flip` attribute. Delete `context-menu.tsx`, `menu-item.tsx`, `chrome-context-menu.ts`, `disclosure-icon.tsx`, `context-menu-icons.tsx`. Replace icons with `lucide-react`.

**PR-B2: Replace tool panels (columns / filters / pivot) — Radix Tabs + Sheet.** The columns/filters/pivot toggle row becomes Radix `Tabs.List`. Each panel becomes `Tabs.Content`. If the panel slides over the grid, `Sheet` (Radix Dialog with side="right"). Internal column visibility list uses Radix `Checkbox` + `RovingFocusGroup` for keyboard nav. Delete the hand-rolled tool-panel chrome.

**PR-B3: Replace tooltip + popup-position + popup-dismiss.** `BcGridTooltip` → `@radix-ui/react-tooltip`. Header funnel filter popups → `@radix-ui/react-popover`. Delete `popup-position.ts`, `popup-dismiss.ts`, `use-roving-focus.ts`, `tooltip.tsx`. Anywhere else that uses these helpers, route through Radix.

**PR-B4: Replace remaining icon files.** `header-icons.tsx`, `pagination-icons.tsx`, `panel-icons.tsx`, `disclosure-icon.tsx` → `lucide-react`. Delete the hand-rolled SVG components. Status: in review via #522.

### Block C — editor migration (worker3, parallel with Block B, 3 PRs)

**PR-C1: Add shadcn Combobox foundation (sourced from `@bsn/ui`).** Add `cmdk@^1.1.1` + relevant `@radix-ui/*` deps to `packages/editors/package.json` at the same pinned versions as worker2's PR-A1 (see TL;DR). Copy `command.tsx` and `popover.tsx` from `~/work/bsncraft/packages/ui/src/components/` into `packages/editors/src/shadcn/` — same instructions as PR-A1: copy the source verbatim, redirect any local utility imports to bc-grid's helpers. No editor-visible change yet — just the new foundation.

**PR-C2: Migrate `selectEditor` + `multiSelectEditor` + `autocompleteEditor` to the shadcn Combobox.** Internally, each of the three combobox-driven editors now uses the new `Combobox` foundation from PR-C1. Closes the deferred `triggerComponent` / `optionItemComponent` slot work from #489 — those slots now have an actual shadcn primitive underneath. Delete `combobox.tsx` and `combobox-search.tsx` from `packages/editors/src/internal/`.

**PR-C3: Wire the deferred select-batch render-prop slots.** `createSelectEditor({ triggerComponent, optionItemComponent })`, `createMultiSelectEditor`, `createAutocompleteEditor`. Pattern matches #480 / #488 / #489. Recipe doc update at `docs/recipes/shadcn-editors.md`.

### Block D — sweep (coordinator, after Blocks B+C, 1 PR)

**PR-D: Sweep + design-doc update.** `grep -rn 'from "./internal/' packages/react/src` should return very few hits — only the legitimate chrome bits we're keeping (context-menu-layer.tsx after re-implementation, useServerOrchestration.ts, pasteDetection.ts, editorInputSlot.ts). Delete any orphans. Update `README.md` + `docs/design.md` to point at the actual Radix-backed implementation with file paths. Update `docs/coordination/release-milestone-roadmap.md` v0.7 entry.

## Migration constraints (binding for all 9 PRs)

1. **No consumer-visible regressions.** Every public API behaviour the old in-house implementation supported, the Radix replacement must support. Specifically: the `?filterPopup=1` example mode, the master/detail context-menu paths, the actions-column keyboard shortcuts (#464), the editor portal close-on-outside, the column-state persistence flows, and the saved-view recipe.

2. **Playwright coverage.** Each PR adds Playwright assertions for the migrated surface BEFORE deleting the in-house code. Coordinator owns the Playwright run on each PR.

3. **API-surface diff.** Each PR runs `bun run api-surface`. The diff must be empty (no public-API change) UNLESS the PR explicitly deprecates a type that's now redundant. If a deprecation is needed, RFC the deprecation in the same PR body.

4. **Bundle-size baseline.** PR-A1 establishes the new baseline. Each subsequent PR may grow the baseline only when the corresponding deletion lands in the same PR (or with a one-PR lag and a comment in `tools/bundle-size/src/manifest.ts` linking the deletion PR).

5. **No chrome features merged outside this RFC during the correction.** Any new chrome surface (toolbar slot extensions, tool-panel additions, context-menu items) lands AFTER the RFC's PRs merge, on top of the Radix foundation. This is non-negotiable — the cost of more in-house surface compounds.

## Out-of-scope for this RFC

- `@bc-grid/virtualizer` — not chrome, no Radix replacement.
- `@bc-grid/animations` — Web Animations API primitives, not chrome.
- `@bc-grid/aggregations` / `@bc-grid/filters` / `@bc-grid/server-row-model` — pure logic packages.
- The data-grid body itself (cells, rows, headers as DOM) — these are not "primitives" in the Radix sense; they're the grid's own DOM contract pinned by `data-density` / `data-bc-grid-*` attributes per `design.md §2026-04-29 CSS class convention`.
- The `BcGrid` / `BcEditGrid` / `BcServerGrid` component shells — public API, untouched.
- Server-grid row-model code (worker1's lane) — independent of chrome.

## Acceptance signal

Every PR in Blocks A-D merges. After PR-D, `grep -rln '@radix-ui' packages/*/src` returns at minimum: context-menu file, popover file, tooltip file, tabs file, dropdown file, dialog/sheet file. `grep -rln 'cmdk' packages/editors/src` returns the combobox foundation. `grep -rln 'lucide-react' packages/*/src` returns several icon-import sites. The codebase visibly matches the design doc.

## Why this is binding

The README and design doc described a shadcn/Radix-first architecture. Consumers (bsncraft) integrated against bc-grid expecting the chrome to inherit shadcn token coverage. Hand-rolled chrome means every consumer-reported edge case becomes a "we have to patch the in-house primitive" cycle, while the equivalent Radix component already has the bug fixed. This RFC restores the contract.

**Beyond restoration — the bsncraft monorepo merge.** Per `~/work/bsncraft/bc-grid.md`, bc-grid will move into `bsncraft/packages/bc-grid/` as a workspace package. When that happens, `packages/react/src/shadcn/*` and `packages/editors/src/shadcn/*` get **deleted**, and the imports in bc-grid swap to `import { Foo } from "@bsn/ui/components/foo"`. Single canonical copy of every shadcn primitive across the entire ERP. This RFC sets bc-grid up for that swap to be mechanical — same Radix versions, same component source, same utility helpers — so the merge is a 30-minute path-rename PR instead of a multi-day reconciliation.
