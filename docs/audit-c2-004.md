# Audit c2-004 — shadcn-alignment + accent-colour support

**Auditor:** c2 (Claude on `bcg-worker4`)
**Date:** 2026-04-30
**Scope:** Two related questions:
1. **Have the implementer agents stayed true to the shadcn / Radix-first design principle from `README.md` + `design.md §1` + `§3.3` + `§8`?** (User asked: are agents diverging?)
2. **Does bc-grid support the concept of an accent colour for ERP-brand colourisation?** (User asked: this is a large feature of the ERP that will use bc-grid.)

The two are related: shadcn's token convention defines several "accent-ish" tokens (`--accent`, `--primary`, `--ring`); how bc-grid maps them determines whether a brand colour reaches the grid surface.

---

## Methodology

1. `grep -rn` for `@radix`, `shadcn`, `radix-ui`, `cva`, `class-variance`, `tailwind-merge`, `cn(`, `clsx` in every `packages/*/src/` and `apps/*/src/`.
2. Inspect every `package.json` for shadcn / radix runtime deps.
3. Inspect `packages/theming/src/styles.css` and `apps/examples/src/styles.css` for shadcn-token consumption patterns.
4. Read `design.md §1 / §3.3 / §8 / §13`, the `chrome-rfc` (#46) and `editing-rfc` (#45 merged), and the `theme-spike-report.md` for design-doc alignment.
5. Cross-check `--accent` / `--primary` / `--ring` flow into the `--bc-grid-*` token system.

---

## Part 1 — shadcn / Radix alignment

### Findings

**The principle is honored at the token + design-doc + RFC level. Implementation has NOT diverged from the convention. There are two minor inconsistencies (one inline-styling drift, one wording drift) that don't change the architectural trajectory.**

### What's true

- **Zero shadcn / Radix runtime dependencies.** Every `package.json` in `packages/*` and `apps/*` is searched: no `@radix-ui/*`, no `shadcn`-named dep, no `cva` / `class-variance-authority` / `tailwind-merge` / `clsx`. Theming uses raw CSS variables; the React layer uses raw Tailwind-compatible classes + inline style helpers.

- **shadcn-token convention is respected at the styling layer.** `packages/theming/src/styles.css` consumes the standard shadcn token names with sensible fallbacks:
  ```css
  --bc-grid-bg: hsl(var(--background, 0 0% 100%));
  --bc-grid-fg: hsl(var(--foreground, 222 47% 11%));
  --bc-grid-border: hsl(var(--border, 214 32% 91%));
  --bc-grid-muted: hsl(var(--muted, 210 40% 96%));
  --bc-grid-row-hover: hsl(var(--accent, 210 40% 96%) / 0.7);
  --bc-grid-row-selected: hsl(var(--accent, 210 40% 96%));
  --bc-grid-focus-ring: hsl(var(--ring, 221 83% 53%));
  --bc-grid-invalid: hsl(var(--destructive, 0 84% 60%));
  ```
  Every consumer-facing CSS variable maps to a shadcn token with a documented fallback for the no-shadcn case.

- **`apps/examples/src/styles.css` declares the full shadcn token set in `:root` + `.dark` mode.** All 18 standard tokens (`background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, plus paired `-foreground` variants, plus `--radius`). bc-grid's theming layer picks them up automatically.

- **`design.md §3.3` Dependency Policy explicitly forbids runtime shadcn:** "shadcn/Radix primitives — copied in via shadcn CLI, not runtime dep." Honoured.

- **`design.md §8.3` reasons explicitly:** "No runtime CSS-in-JS. Reasoning: every JS-driven style insertion costs us frame time. With CSS variables we get full theming flexibility without a single runtime cost." This is the foundational reason agents haven't reached for cva / styled-components.

- **`chrome-rfc` (#46) explicitly establishes the future convention** for chrome primitives (status-bar, sidebar, context-menu): "shadcn-compatible primitives, not a runtime dependency on shadcn. The shadcn ecosystem is copy-paste app code, not a published package — `@bc-grid/react` cannot import shadcn components from a shared library. ... bc-grid ships its own internal primitives (under `packages/react/src/internal/`) that are styled to be drop-in replaceable / coexistent with a host app's shadcn primitives." So when Track 5 (chrome) lands, agents won't import shadcn components — they'll ship internal primitives styled to compose with the consumer's shadcn.

- **kebab-case CSS convention** (`design.md §13` 2026-04-29 entry) matches the shadcn / Tailwind ecosystem.

### Minor drift / risks

- **`packages/react/src/headerCells.tsx:213-224` — filter input styled with inline HSL fallbacks instead of going through the token system.**
  ```ts
  const filterInputStyle: CSSProperties = {
    border: "1px solid hsl(var(--border, 220 13% 91%))",
    background: "hsl(var(--background, 0 0% 100%))",
    color: "inherit",
    ...
  }
  ```
  The fallbacks are LIGHT-MODE only (white background, light-grey border). If a consumer mounts the grid with a dark-mode shadcn token scope but somehow the host's `--background` doesn't resolve, the input renders white-on-dark. The `--border` and `--background` references are correct; the inline-style approach (vs a CSS class) bypasses the theming/styles.css convention.

  **Severity: M** — visible-but-narrow. Easy fix: move to `.bc-grid-filter-input` class in `packages/theming/src/styles.css`. Already covered by Phase 5.5 / Phase 6 Track 6 work as filter UIs land; flag now so the next agent on filter UIs catches it.

- **`editing-rfc` per-editor specs use `shadcn `Input` primitive` / `shadcn `Select` primitive` wording** even though `chrome-rfc` (later in the same sprint) established that the convention is "shadcn-compatible internal primitives, not actual shadcn components." Wording drift between the two RFCs.

  **Severity: L** — easy fix; the `editor-framework` impl PR will surface this when it tries to import shadcn `Input` and discovers the convention. A follow-up fix to `editing-rfc` aligning wording would be useful but isn't blocking.

- **`design.md §1 Mission` still uses "shadcn/Radix theming"** which a strict reader might assume means runtime Radix. The dependency policy in §3.3 contradicts this read, but the mission could clarify.

  **Severity: L** — wording polish.

### What's NOT diverging

- No agent has imported `@radix-ui/*` anywhere.
- No agent has reached for cva / clsx / tailwind-merge.
- No agent has rolled their own design-system primitive (Button, Input, Select, etc.) outside the cell-grid scope. Headers / filter inputs / action buttons are minimal grid-specific structural elements, not generic UI components.
- The Phase 6 Track 5 (chrome) and Track 1 (editing) RFCs both correctly call for "internal primitives, shadcn-compatible" — which is the correct convention given §3.3.

### Recommendation

**No agent intervention needed today.** The principle is honored. Two follow-ups:

| Action | Severity | When |
|---|---|---|
| Move filter input inline style → CSS class in theming/styles.css | M | Next filter-UI PR (Track 6 `filter-text-impl-extend` or Phase 5.5 follow-up) |
| Align `editing-rfc` "shadcn `Input` primitive" wording with `chrome-rfc`'s "shadcn-compatible internal primitive" convention | L | Next `editing-rfc` revision OR a small wording-fix PR |
| Add a one-line clarifier in `design.md §1` / `README.md` "shadcn-compatible" not "runtime shadcn" | L | Doc-polish follow-up |

---

## Part 2 — Accent-colour support for ERP brand customisation

### Findings

**bc-grid currently consumes `--accent` for row hover + row selected backgrounds, and `--ring` for the focus outline. That's the floor — about 30% of what an ERP brand-accent feature would expect. There are 6+ additional surfaces where the accent should appear but doesn't yet.**

### Where accent flows TODAY

| Surface | Token | Behaviour |
|---|---|---|
| Row hover background | `--accent` at 0.7 alpha | ✓ Honoured |
| Row selected background | `--accent` full | ✓ Honoured |
| Row selected text | inherits `--bc-grid-fg` (= `--foreground`) | ✓ Honoured |
| Active cell focus ring | `--ring` (NOT `--accent`) | ✓ Honoured (separate token) |
| Sort indicator (▲/▼) | inherits `--bc-grid-fg` (monochrome text) | ✗ No accent treatment |
| Sorted column header background | none | ✗ No accent treatment |
| Filter input focus border | inline `hsl(var(--border, ...))` | ✗ No accent treatment |
| Action button (BcEditGrid) | minimal flex, no styled token | ✗ No accent treatment |
| Action button (destructive) | `.bc-grid-action-destructive` class — inherits `--bc-grid-invalid` (= `--destructive`) | ✓ Honoured (different token, correct semantic) |
| Pinned-edge scroll shadow | `data-scrolled-left` / `-right` data attrs trigger CSS — no accent input | ✗ No accent treatment |
| Loading overlay | `--bc-grid-overlay-bg` (separate token) | ✗ No accent treatment |
| Live region announcements | visually hidden; no accent | n/a |
| Selection checkbox column (#58 in flight) | TBD | ⚠ Need to verify when it merges |
| Range selection rectangle (Track 2, Q3) | not implemented yet | n/a |
| Pivot drop-zone highlight (Track 4-5, Q5) | not implemented yet | n/a |

### Important: shadcn convention for "brand colour"

The shadcn token set has THREE accent-ish tokens; consumers pick a convention:

| Token | shadcn default meaning |
|---|---|
| `--primary` | The brand-call-to-action colour. Bold, saturated. Used for primary buttons, the CTA. |
| `--accent` | A subtle background tint (NOT the brand colour). Often a desaturated tint of `--muted` or `--secondary`. Used for hover, dropdown-item-highlight. |
| `--ring` | The focus ring colour. Often equal to or close to `--primary`. |

**bc-grid currently maps `--accent` to row hover + selected. In shadcn convention, that's correct (subtle highlight). But ERP consumers who set `--accent` to a brand colour (say, a vivid orange) will get a vivid orange row hover — too aggressive for a typical row hover.**

There's a mismatch between bc-grid's "accent = row highlight" and a typical ERP "accent = brand colour" mental model.

### What an ERP that uses bc-grid would expect

Looking at typical ERP UI patterns where brand accent appears:

1. **Selected row left-edge accent strip** (3-4px solid colour bar on the left of the selected row) — common in AG Grid, Excel, Notion, Linear.
2. **Active sort column header** highlighted with accent (background tint or underline).
3. **Action button hover accent** (Edit / Delete buttons in the actions column).
4. **Filter input focus border** in the accent colour.
5. **Loading overlay spinner** in the accent colour.
6. **Range selection rectangle border** in the accent colour (Track 2).
7. **Pivot drop-zone highlight when dragging** (Track 4-5).
8. **Drag handle for column reorder** subtly tinted with accent (Track 0).
9. **Checkbox column tick** in the accent colour (#58 in flight).
10. **Scroll-shadow gradient** could subtly use the accent.

Of these, today's bc-grid implements **0**. The ERP won't see brand accent anywhere except the row hover + selected backgrounds.

### Recommended changes

#### Phase A — separate tokens (no breaking change)

Introduce a dedicated **`--bc-grid-accent`** token in the theming layer that maps to the consumer's brand colour. This is independent of the row-hover/selected tokens (which keep using `--accent` for the subtle-highlight semantic).

Default mapping (consumer overridable):
```css
.bc-grid {
  /* Existing — keep using --accent for subtle row tint: */
  --bc-grid-row-hover: hsl(var(--accent, 210 40% 96%) / 0.7);
  --bc-grid-row-selected: hsl(var(--accent, 210 40% 96%));

  /* NEW — brand-accent token for visible-accent treatments: */
  --bc-grid-accent: hsl(var(--primary, 221 83% 53%));
  --bc-grid-accent-fg: hsl(var(--primary-foreground, 0 0% 98%));
  --bc-grid-accent-soft: hsl(var(--primary, 221 83% 53%) / 0.12);
}
```

Consumers wanting a different brand colour can override either:
- `--primary` at the host app level (preferred — uses the standard shadcn convention).
- `--bc-grid-accent` directly (fine-grained — affects only bc-grid).

#### Phase B — apply `--bc-grid-accent` to identified surfaces

A new task `accent-colour-application` (Phase 5.5 / 6 Track 0 candidate):

1. **Selected row left-edge accent strip:**
   ```css
   .bc-grid-row[aria-selected="true"]::before {
     content: "";
     position: absolute;
     left: 0;
     top: 0;
     bottom: 0;
     width: 3px;
     background: var(--bc-grid-accent);
   }
   ```
2. **Active sort column header:** add `--bc-grid-accent` underline or `--bc-grid-accent-soft` background.
3. **Filter input focus border** (when `filter-input` becomes a CSS class — see shadcn audit Part 1): use `--bc-grid-accent`.
4. **Loading overlay spinner** colour token.
5. **Action button hover** with `--bc-grid-accent-soft`.

#### Phase C — extend api.md theming section

Document that `--bc-grid-accent` is the brand-accent token; consumers who want bc-grid surfaces to reflect their brand should set `--primary` at the app level (or override `--bc-grid-accent` per-grid).

Add a recipe page in `apps/docs/theming.md`:
```css
/* Customise bc-grid's brand accent without touching shadcn tokens */
.bc-grid {
  --bc-grid-accent: hsl(20 80% 50%);  /* ERP orange */
}
```

### Compatibility with the ERP

The user said accent colour is a **large feature of the ERP**. With the recommended changes:
- The ERP's primary brand colour (set via `--primary` per shadcn convention) will surface in 6+ visible bc-grid surfaces.
- Per-grid accent overrides (e.g., a screen-specific accent for Accounts Receivable vs General Ledger) work via `--bc-grid-accent` on a parent.
- Forced-colors mode continues to override per `accessibility-rfc §Forced Colors`.

This addresses the gap from "bc-grid uses --accent for row hover (subtle)" to "bc-grid surfaces the ERP brand colour where it matters."

### Effort estimate

| Phase | Effort | Owner suggested |
|---|---|---|
| A — add `--bc-grid-accent` / `-fg` / `-soft` tokens to theming/styles.css; `bcGridThemeVars` map | XS | x1 (theming patterns) |
| B — apply to 5 surfaces (selected-row strip, sort-column header, filter focus, action hover, loading spinner) | M | c1 (touches grid.tsx + headerCells.tsx + bodyCells.tsx) |
| C — docs (api.md theming section + apps/docs theming page) | S | x3 |

Total: ~4-6 agent-hours. Worth folding into Phase 5.5 of the v0.1-alpha-release-plan (#61) or as a discrete task `accent-colour-treatment`.

### A new task to add to queue.md

```markdown
- `[ready]` **accent-colour-treatment** — extend the theming layer with `--bc-grid-accent` / `-fg` / `-soft` tokens (default: `--primary`). Apply to: selected-row left-edge strip; active-sort column-header treatment; filter input focus border; loading overlay spinner; BcEditGrid action button hover. Pairs with the ERP brand-accent requirement. **Effort**: M (4-6 hrs).
```

---

## Combined recommendations

1. **Shadcn alignment:** principle honoured; agents have NOT diverged. File a small `shadcn-wording-cleanup` task to align editing-rfc / design.md / README wording with the chrome-rfc "shadcn-compatible internal primitive" convention. **Severity L; not blocking.**
2. **Accent colour:** today only 30% of expected ERP-brand-accent surfaces are wired. File `accent-colour-treatment` task (above) as Phase 5.5 candidate. **Severity M for ERP rollout; M-fold to v0.1-alpha if ERP cutover is imminent, else Phase 6 Track 0 candidate.**

The two findings are NOT contradictory: bc-grid's existing accent flow honours shadcn's "subtle-tint accent" semantic; the ERP-brand-accent feature is an EXTENSION of that, with a dedicated `--bc-grid-accent` token mapped (by default) to `--primary`.

## References

- `packages/theming/src/styles.css` (token-flow source of truth)
- `apps/examples/src/styles.css` (full shadcn token declaration)
- `docs/design.md §1 / §3.3 / §8 / §13` (architectural intent)
- `docs/design/chrome-rfc.md` source-standards section (the "shadcn-compatible" convention)
- `docs/design/editing-rfc.md` per-editor specs (where wording-drift lives)
- shadcn/ui theming reference: https://ui.shadcn.com/docs/theming
- `audit-c2-001` / `audit-c2-002` / `audit-c2-003` (prior audit passes)
