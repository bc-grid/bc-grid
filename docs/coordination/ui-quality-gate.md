# UI quality gate

**Owner:** coordinator (Codex).
**Audience:** any agent opening a PR that touches visible chrome (CSS, themed React markup, or new UI primitives).
**Status:** binding from 2026-05-01. UI PRs that don't pass this gate are rejected at review.

The bar for UI work is **shadcn/Radix-first enterprise grid quality, with AG Grid as a reference for restraint and clarity.** Workers MUST self-inspect against this checklist before opening a UI PR. Reviewers MUST reject (not "request changes" — *reject*) any PR that fails a hard rejection criterion below; the worker re-opens after fixing.

This gate does not replace the existing PR checklist in `AGENTS.md §6`. It sits on top of it, specifically for visible-chrome work.

---

## 1. The bar

bc-grid's visible chrome should look at home next to:

- **shadcn/ui blocks** (`https://ui.shadcn.com/blocks`) — the dashboard, table, sidebar, and form blocks. shadcn sets the baseline for spacing, radius, focus rings, hover transitions, and quiet defaults.
- **Radix UI primitives** (`https://www.radix-ui.com/primitives`) — the interaction contracts (`data-state`, `data-side`, `data-align`, focus management, keyboard navigation) we already mirror.
- **AG Grid Enterprise** (`https://www.ag-grid.com/example`) — the *restraint* of an enterprise grid: tight rows, neutral chrome, controls hidden until needed, no decorative gradients, no novelty animations. Reference for what serious data-grid users expect at scale.

If the PR's surface would look amateurish next to those references, it does not ship. Inspect your output against the reference (open the shadcn block / AG Grid demo in a browser and compare side-by-side) before requesting review.

**No AG Grid source.** Reference inputs are public docs, examples, screenshots, and black-box behavior only. Pattern validation is allowed; source-derived implementation is not. See `docs/coordination/ag-grid-clean-room-audit-plan.md`.

---

## 2. Hard rejection criteria

A UI PR is rejected if any of these are true. These are not style nits — they break the bar.

### 2.1 Cell density / overlap

- **REJECT:** Visible controls (filter operator dropdowns, regex/case toggles, value pickers, sort indicators that aren't icons) crammed into header or filter cells at narrow widths. If the cell can land at 80–120px in a real grid, the controls must still fit cleanly. shadcn's bar: every visible control either fits or is hidden behind a popup trigger.
- **REJECT:** Inline filter rows that try to expose advanced operators in every cell. Advanced operators, regex/case toggles, multi-select, and value pickers belong in popup or panel surfaces. AG Grid's bar: the inline filter row is a single quiet input per cell; everything else is one click away.
- **REJECT:** Header text that wraps to two lines because a control was bolted on. Either the control hides behind a trigger, or the header text wins.

### 2.2 Resize affordances

- **REJECT:** Loud accent-coloured resize handles or bars that are visible by default. Resize handles must be subtle (1–2px), neutral (`var(--bc-grid-border)` or `var(--bc-grid-column-resize-affordance)`), and react only when the *handle itself* is hovered or focused. AG Grid's bar: resize handles are invisible until the mouse is over them.
- **REJECT:** Resize handle that lights up on hover of the *entire column* (not just the handle). The seam should respond to direct interaction only.
- **REJECT:** Resize handle that occupies more than ~6px of hit area. Wider handles steal clicks from cell selection.

### 2.3 Pinned / sticky surfaces

- **REJECT:** Pinned columns whose body cells are not opaque against horizontally scrolled content. Every pinned cell rule must consume `var(--bc-grid-pinned-bg)` (and the per-row-state pinned tokens) with `background-clip: padding-box`. If body text shows through during horizontal scroll, the column is broken.
- **REJECT:** Pinned column without a `data-scrolled-left` / `data-scrolled-right` boundary shadow seam. The seam is not decorative — it tells the user "this column is sticky, not just at the edge of the data."
- **REJECT:** Sticky overlays (column chooser menu, filter popup, context menu, tooltip) that don't paint a solid `var(--bc-grid-context-menu-bg)` / `var(--bc-grid-card-bg)` against the data behind them.

### 2.4 Motion

- **REJECT:** Any animation that scales, morphs, or rotates visible *text*. Group-toggle and detail-toggle chevrons are SVG glyphs; CSS rotation applies to the SVG only, never to surrounding text. (Pinned in `master-detail-motion-cleanup-v040` theming-tests.)
- **REJECT:** Sort flip / row reorder animations that morph cell heights. Translate-only transforms; if the FLIP isn't safe (row identity / virtualization / size changed), skip the animation rather than ship a janky one.
- **REJECT:** "We'll polish this later" expand/collapse animations. If the motion isn't polished and reduced-motion-safe, disable it or simplify it. A correct still frame beats a janky transition.
- **REJECT:** Hover transitions that snap-cut. Use `transition: <property> var(--bc-grid-motion-duration-fast) var(--bc-grid-motion-ease-standard)` for bg / border / color shifts; the existing `*` reduced-motion rule zeroes them.

### 2.5 Icon buttons

- **REJECT:** Buttons that render with browser-default chrome (no explicit border / bg / focus rule). Native `<button>` elements look raw inside themed surfaces; every interactive button must have a CSS rule covering default / `:hover` / `:active` / `:focus-visible` / `:disabled`.
- **REJECT:** Icon buttons whose icon is text glyph (`x`, `>`, `…`) instead of an inline SVG. Text glyphs don't adapt across light / dark / forced-colors and don't accept stroke-width tuning. Use the shared icon modules (`internal/header-icons.tsx`, `internal/pagination-icons.tsx`, `internal/panel-icons.tsx`, `internal/disclosure-icon.tsx`) or add a new module if a new family is genuinely missing.
- **REJECT:** Disabled treatment that uses `cursor: not-allowed` instead of `cursor: default` + `pointer-events: none`. The bc-grid canon is the latter (set by pagination / filter-panel / context-menu items); a new button that introduces `not-allowed` adds inconsistency.
- **REJECT:** Focus-visible state that paints a colored border tint *and* a bg shift *and* an outline ring. Pick one signal — the canonical shadcn pattern is `outline: 2px solid var(--bc-grid-focus-ring)` + `outline-offset: 2px` only.
- **REJECT:** Hover state that paints a colored border tint *and* a bg shift. The bg shift is the hover signal; the colored border adds visual weight at every pointer move.
- **REJECT:** Active / pressed state without an `:active` flash. shadcn buttons flash `var(--bc-grid-accent-soft)` on tap-down so the click registers visually before the handler resolves.

### 2.6 Density consistency

- **REJECT:** Header height that doesn't match the row-density token (`--bc-grid-header-height`). Custom header chrome must read the existing density variables (compact / normal / comfortable from `@bc-grid/theming`) — no hard-coded `height: 36px`.
- **REJECT:** Mixing 1.75rem / 2rem / 2.25rem icon-button heights inside the same surface. Pick the rhythm of the surface (header / filter row / panel / footer) and stay on it.
- **REJECT:** Borders that mix `var(--bc-grid-border)` and `var(--bc-grid-input-border)` arbitrarily. The split is intentional: card / surface borders use `--bc-grid-border`; control borders (inputs, selects, buttons that look like inputs) use `--bc-grid-input-border`. Apps that override `--input` separately from `--border` rely on the split.

### 2.7 Token discipline

- **REJECT:** Direct reads of shadcn / Tailwind v4 tokens (`var(--background)`, `var(--accent)`, `var(--ring)`, etc.) outside the bridge block at the top of `packages/theming/src/styles.css`. Every chrome rule consumes the `--bc-grid-*` companion. (Pinned by the `chrome surfaces consume --bc-grid-* only` invariant in `packages/theming/tests/theming.test.ts`.)
- **REJECT:** Inline `style={…}` for visual chrome. Move it to CSS so the theming layer can extend / override / pin it. Inline styles are reserved for *layout values* that depend on runtime data (computed widths, virtualizer offsets), never for visual treatment.
- **REJECT:** Hard-coded HSL / hex / rgb colours in chrome rules. Colours flow through tokens; tokens flow through the bridge.

---

## 3. Reference notes

### 3.1 What shadcn blocks demonstrate

Open `https://ui.shadcn.com/blocks` and look at the dashboard / table / sidebar blocks. Note these patterns and mirror them in bc-grid chrome:

- **Quiet defaults.** Buttons render with `background: transparent` until hovered. Borders are `1px solid hsl(var(--border))` or omitted. Cards use `bg-card` (we bridge to `--bc-grid-card-bg`).
- **One signal per state.** Hover = bg shift only. Focus = outline ring. Active = stronger bg flash. Selected (in menus) = accent-soft bg only — no inset stripe, no bordered frame.
- **Compact rhythm.** Tables and sidebars use 2rem (h-8) icon-button heights, 0.75rem padding for cards, 0.5rem gap for inline groups. Don't invent new sizes.
- **`data-state` hooks everywhere.** `data-state="open" | "closed"` on dropdowns, `data-state="open" | "collapsed"` on sidebars, `data-state="checked" | "unchecked"` on switches. Theme via attribute selectors, not class toggles.

Do not copy code — the patterns are the point, not the strings. shadcn ships components; we ship chrome that fits next to them.

### 3.2 What AG Grid demonstrates

Open `https://www.ag-grid.com/example` (the official live demo) and observe these *restraint* patterns. AG Grid is licensed source — do not clone, inspect, or copy. We're observing pattern, not lifting code.

- **Resize handles disappear.** No visible affordance until you hover the seam itself. The handle is 4–6px wide.
- **Header chrome is empty until needed.** The sort indicator is an arrow at the right edge, surfaced only on sortable columns. The column-menu trigger is a kebab that fades in on header-cell hover or focus. No always-visible icons clutter the header.
- **Filter row is one input per cell.** Operator dropdowns, set-filter pickers, regex toggles all live in a popup behind a funnel button. The inline row is a single quiet input.
- **Pinned cells are completely opaque.** No transparency, no fade-on-scroll, no body-text bleed-through. The boundary shadow is a deliberate seam, not a gradient artifact.
- **Row density is tight.** AG Grid's "normal" density is what we'd call "compact" elsewhere. Enterprise users want more rows on screen, not airier spacing.
- **Animations are absent or subtle.** Expand/collapse toggles use plain `display` swaps (no height morphing), sort changes are instant (no FLIP), and tooltip / popup mounts are 100ms or less.

If your PR's surface looks visually busier than AG Grid's equivalent, it's wrong. AG Grid's enterprise users tolerate AG Grid because it gets out of their way. bc-grid must match that restraint to displace AG Grid.

### 3.3 What bc-grid already ships

Before adding anything, audit what already exists. The `internal/*` icon modules, the `--bc-grid-*` token cascade, the `data-state` / `data-side` / `data-align` attribute hooks, the `usePopupDismiss` / `useRovingFocus` / `computePopupPosition` shared helpers, the pinned-cell row-state token family, the `cursor: default` + `pointer-events: none` disabled pattern, the `:active` accent-soft flash — these are already in place. Most UI work is *adopting* the existing patterns, not inventing new ones.

If your PR introduces a new pattern that overlaps with an existing one, that's friction at review. Either reuse the existing pattern or write a one-paragraph audit note explaining why the existing pattern doesn't fit.

---

## 4. Self-inspection checklist

Before requesting review on a UI PR:

- [ ] Open the surface in a browser (or screenshot it). Compare side-by-side against the closest shadcn block and the closest AG Grid screen. If yours looks busier, noisier, or more decorative — fix before requesting review.
- [ ] Open the surface in dark mode. Forced-colors mode (Windows High Contrast) if reachable. Confirm every chrome rule still reads cleanly through the token cascade.
- [ ] Resize the surface to a narrow width (~320px viewport for desktop chrome; the relevant cell width for cell-level chrome). Confirm controls still fit.
- [ ] Tab through the surface. Every focus-visible state has a single outline ring. No bg shift, no colored border on focus.
- [ ] Hover every interactive element. Single signal per state. No layered tints.
- [ ] Disable a control. Confirm `cursor: default` + `pointer-events: none` + 0.55 opacity (the canonical bc-grid disabled treatment).
- [ ] Walk the new code against `§2 Hard rejection criteria` line by line. Anything you can't tick is the thing to fix.

If you can't open the surface visually (testing constraints, no live grid available), add a short paragraph in the PR description explaining how you verified the visual treatment — usually by referencing existing chrome that follows the same pattern.

---

## 5. What this gate is *not*

- **Not a substitute for tests.** Theming-test invariants and SSR markup tests still pin the contract. The gate is the *visual* check; tests are the *contract* check. PRs need both.
- **Not a license to redesign.** Reviewers reject on objective failures against §2; they don't block on personal preference. If you disagree with an existing pattern, file a separate task — don't unilaterally rewrite it inside an unrelated PR.
- **Not a Playwright requirement.** Workers do not run Playwright; the coordinator does, at merge review. The self-inspection above is a *visual* check the worker runs locally before opening the PR. Playwright covers behavior, not aesthetic quality.

---

## 6. Pointer for reviewers

When reviewing a UI PR, the first comment should be either:

- **"Visual gate: pass"** — every §2 criterion holds and the surface reads as deliberate.
- **"Visual gate: rejected — <criterion>"** — name the specific §2 line that fails. The worker fixes and re-requests review.

If the PR ships code-level changes (helpers, types, behavior) alongside the chrome work, review those independently — the visual gate covers chrome only.
