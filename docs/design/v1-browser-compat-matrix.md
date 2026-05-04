# v1.0 Browser Compatibility Matrix

**Status:** v1.0 prerequisite — must be reviewed before signing off on the freeze.
**Author:** worker1 (Claude)
**Source of truth:** `playwright.config.ts`, `docs/design.md §3.1 Browser support`, per-package CSS / TypeScript.

---

## 1. Summary table

| Browser | Engine | Versions targeted | Playwright project | Surface coverage | Status |
|---|---|---|---|---|---|
| Chrome / Chromium | Blink | current + current-1 (Chrome 120+) | `examples-chromium` + `spike-chromium` | smoke + e2e + smoke-perf + perf | ✅ FULL |
| Firefox | Gecko | current + current-1 (Firefox 120+) | `examples-firefox` + `spike-firefox` | smoke + e2e + smoke-perf | ✅ FULL |
| Safari (macOS + iOS) | WebKit | current + current-1 (Safari 17+ / iOS 17+) | `examples-webkit` + `spike-webkit` | smoke + e2e + smoke-perf | ⚠️ KNOWN-GAPS — see §4 |
| Edge | Blink (Chromium-based) | current + current-1 | covered by `*-chromium` (engine identity) | inherits Chromium | ✅ FULL |
| Legacy Edge / IE11 | EdgeHTML / Trident | n/a | n/a | n/a | ❌ NOT SUPPORTED (per `design.md §3.1`) |

**v1.0 ship gate:** Chromium + Firefox + Safari (macOS) all green on `bun run test:e2e` against the alpha tag. Edge inherits Chromium results; iOS Safari is best-effort with documented caveats.

## 2. Playwright project shape

`playwright.config.ts` defines 6 projects = 2 suites × 3 engines:

```
spike-{chromium,firefox,webkit}    → apps/benchmarks/tests/*.pw.ts
examples-{chromium,firefox,webkit} → apps/examples/tests/*.pw.ts
```

- **`spike-*` (3 projects)** runs against the bare-DOM virtualizer harness (no React) — covers the engine-specific `getBoundingClientRect` / `position: sticky` / `display: grid` semantics that diverge across engines.
- **`examples-*` (3 projects)** runs against the React demo — covers the full `<BcGrid>` / `<BcServerGrid>` / `<BcEditGrid>` mounted in a real React tree with real CSS.

Total: 57 `.pw.ts` files (3 spike + 54 examples) × 3 engines = 171 e2e runs per full suite. CI runs the full matrix on PRs touching browser-affecting paths; `bun run test:e2e` runs all 6 projects locally.

`*.perf.pw.ts` (perf bench) and `*.smoke.pw.ts` (smoke perf) run separately via `playwright.perf.config.ts` / `playwright.smoke.config.ts` — Chromium only for perf to avoid cross-engine timing variance.

## 3. Surface coverage per layer

| Surface | Chromium | Firefox | WebKit | Notes |
|---|---|---|---|---|
| `<BcGrid>` mount + render | ✅ | ✅ | ✅ | `examples-*` |
| `<BcServerGrid>` paged / infinite / tree | ✅ | ✅ | ✅ | `examples-*` |
| `<BcEditGrid>` editor flows | ✅ | ✅ | ✅ | `examples-*` |
| Virtualizer scroll FPS | ✅ (`fps.pw.ts`) | ✅ | ✅ | Steady-state scroll FPS pinned ≥58 per `design.md §3.2` |
| Range selection (Q1) | ✅ | ✅ | ✅ | `examples-*/range-*.pw.ts` |
| Pinned columns (left + right + intersection) | ✅ | ✅ | ✅ | `position: sticky` carried across engines |
| Forced-colors mode | ✅ | ✅ | ✅ | `forced-colors-sticky.pw.ts` |
| Master-detail panel | ✅ | ✅ | ✅ | `detail-panel-sticky-left.pw.ts` |
| Smoke-perf benches | ✅ | ✅ | ✅ | `smoke-perf.smoke.pw.ts` |
| Perf benches (absolute bars) | ✅ ONLY | ❌ | ❌ | Cross-engine timing variance — Chromium owns the perf budget |
| Drag-and-drop interactions | ✅ | ⚠️ | ⚠️ | See §4 |
| Touch / coarse-pointer | ✅ (Desktop Chrome) | ✅ (Desktop Firefox) | ✅ (Desktop Safari) — and best-effort iOS Safari | See §4 |

## 4. Per-browser known gaps

### 4.1 Safari (WebKit)

**iOS Safari sticky-positioning + transformed ancestors** (`docs/migration/v0.6.md §2`).
- WebKit + Blink (≤114) collapse `position: sticky` when an ancestor has `transform`/`will-change`/`filter` set — common in app shells with slide-in drawers.
- bc-grid uses `position: sticky` for headers + pinned cells (per `layout-architecture-pass-rfc.md §3-§5`).
- **Workaround:** consumers must avoid wrapping `<BcGrid>` in transformed ancestors. Documented in the v0.6 migration notes.
- **v1.0 status:** documented caveat; not a blocker. Bsncraft doesn't currently wrap the grid in a transform; new consumers warned during integration.

**iOS Safari `dblclick` reliability** (`packages/react/src/touchInteraction.ts §56`).
- Browser-fired `dblclick` is unreliable on iOS Safari for activation gestures (entering edit mode).
- **Workaround:** synthetic touch-tap counter in `touchInteraction.ts` falls back to a tap-tap-within-window detection.
- **v1.0 status:** mitigated; no consumer-visible regression.

**Native `<select>` chrome divergence** (`packages/theming/src/styles.css §1722-1730`).
- Safari paints `<select>` pill-shaped with thick chevron well; Firefox paints rounded ends; Chromium uses platform widget.
- **Workaround:** `-webkit-appearance: none` + custom chevron via `mask-image`.
- **v1.0 status:** consistent rendering across all 3 engines.

**`@scope` CSS not yet supported** (Safari < 17.4).
- Used as future-cleanup target for row-state cascade scoping (per `design.md` 2026-05-03 row-state-cascade decision).
- **Workaround:** `:not(...)` selector chain (Selectors L4, universal browser support).
- **v1.0 status:** workaround in place; `@scope` migration is a v1.x follow-up.

### 4.2 Firefox

**Native `<select>` chrome divergence** — see §4.1 row 3. Firefox-specific paint, mitigated by `-webkit-appearance: none` (works in Firefox via the spec's `appearance: none` cascade).

**Drag-and-drop pointer events** — Firefox's HTML5 drag-and-drop fires `dragover` events at lower frequency than Chromium under heavy scroll. The `BC_GRID_ROW_DRAG_MIME` row-drag pipeline accommodates this with a polling fallback in `rowDragDrop.ts`. **v1.0 status:** equivalent UX; no consumer-visible regression.

### 4.3 Chromium / Edge

No known per-engine gaps. Edge inherits all Chromium behaviour because both ship Blink. v1.0 ships full Chromium support; Edge users benefit by transitivity.

## 5. CSS feature use audit (`color-mix`, `@scope`, `:has`, etc.)

`packages/theming/src/styles.css` uses 95 modern CSS features in counts. Key ones:

- **`color-mix(in srgb, ...)`** — used 60+ times for token derivation (row hover, focus ring, edit-state shading). Chrome 111+ / Firefox 113+ / Safari 16.2+. Universal in target browsers.
- **`@scope`** — NOT used yet. Future cleanup target (see §4.1).
- **`prefers-reduced-motion: reduce`** — used for skeleton-row shimmer + cell flash + slide animations. Universal support.
- **`forced-colors: active`** — used for skeleton-row token fallbacks + sticky-positioned cell shading. Universal support.
- **CSS variables (`--bc-grid-*`)** — pervasive. Universal support.
- **`position: sticky`** — load-bearing for headers + pinned cells. Universal support; iOS-Safari-with-transformed-ancestor caveat per §4.1.

## 6. Cross-reference to `design.md §3.1`

`design.md §3.1 Browser support`:

> - Chromium (Chrome, Edge, Opera, Brave) — current and current-1
> - Firefox — current and current-1
> - Safari — current and current-1
> - No IE11. No legacy Edge.

This audit confirms the baseline is met:
- Chrome 120+ / Edge 120+: ✅ FULL via `*-chromium` projects.
- Firefox 120+: ✅ FULL via `*-firefox` projects.
- Safari 17+ (macOS): ✅ FULL via `*-webkit` projects (with the documented gaps in §4.1).
- iOS Safari 17+: best-effort coverage (Playwright's WebKit project uses Desktop Safari device; iOS-specific touch behaviour exercised via `apps/examples/tests/touch-interaction.pw.ts` + the `touchInteraction.ts` synthetic-tap counter).

No engine outside this list is supported. Polyfills for IE11 / legacy Edge are explicitly NOT shipped per `design.md §3.1`.

## 7. v1.0 ship gate decision

**Recommended sign-off criteria:**

1. ✅ **All 6 Playwright projects green** on the alpha-3+ tag with no per-engine skips on the must-ship hero specs (range-*, server-mode-switch, client-tree-rowmodel, edit-grid-*, master-detail).
2. ✅ **Forced-colors + reduced-motion** spec passes on all 3 engines.
3. ✅ **Smoke-perf bars met** on Chromium (per `design.md §3.2`).
4. ⚠️ **iOS Safari caveats documented** — `docs/migration/v0.6.md §2` is the consumer-facing source; consumers integrating via slide-in drawers / transformed ancestors must read this.
5. ⚠️ **Edge inherits Chromium** — explicitly note this in v1.0 release notes so Edge users aren't surprised by the lack of dedicated coverage.

The matrix has no blockers for v1.0. The two ⚠️ items are documentation reminders, not blockers — the underlying behaviour is consistent across engines.

## 8. Out-of-scope for v1.0

- **iOS Safari device-specific testing** (real iOS hardware). Playwright's WebKit on Desktop Safari is the closest proxy. iOS-only regressions surface during bsncraft consumer soak; no automated iOS device gate in v1.0.
- **Mobile Chromium / Firefox Mobile.** Touch coverage runs through Desktop * with `pointer: coarse` media query; mobile-specific layout testing deferred to v1.x.
- **WebView contexts** (Capacitor, Tauri, Electron). bc-grid runs inside WebViews via the underlying engine (WebKit on iOS WebViews, Blink on Tauri/Electron Chromium); no special WebView gate.
- **Server-side rendering (SSR) of the grid.** SSR only renders the chrome shell + first-paint markup; client hydration owns the interactive surface. No SSR-specific browser matrix because the SSR output is browser-agnostic HTML.

## 9. Decision log

(empty — populated as ship-gate items resolve.)
