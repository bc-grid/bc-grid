# RFC: Accessibility (accessibility-rfc)

**Status:** Not started
**Owner:** TBD (claim from `docs/queue.md`)
**Reviewer:** fresh agent
**Blocks:** `virtualizer-impl`, `react-impl-v0`

---

Accessibility informs architecture. The DOM-structure decisions made by the virtualizer determine what's possible for screen readers; bolting ARIA on after Q4 means rebuilding the engine. This RFC settles those decisions before implementation.

## Target

WCAG 2.1 AA. Tested on:
- macOS VoiceOver
- Windows NVDA + JAWS (current)
- Chrome / Firefox / Safari current

## What this RFC must decide

### 1. Role choice

- `role="grid"` for flat data
- `role="treegrid"` for grouped / tree data
- Decision: pick semantics for grouped-but-not-tree (group rows expandable but still essentially flat)

### 2. `aria-rowcount` semantics

- Total dataset (including unloaded server-side rows)?
- Or rendered row count?
- AG Grid uses total. Spec: align with AG Grid. Server-row-model dictates the value via row-model state.

### 3. `aria-rowindex` on partial sets

- The virtualiser renders ~50 of 100k rows. How does the screen reader know "row 47 of 100,000"?
- Spec: every rendered row carries `aria-rowindex` reflecting its position in the full dataset, not the rendered subset.
- For server-side: the row model must know its absolute index even when virtualised.

### 4. Focus retention across virtualisation

- When focused row scrolls out of viewport, two options:
  - **(a)** Keep the row's DOM node (so focus stays). Virtualiser must coordinate with focus state to keep it rendered.
  - **(b)** Hand focus to a placeholder row at the viewport edge.
- AG Grid uses (a) — focused row stays in DOM. Lean: same.
- Spec: virtualiser exposes "always render row X" hook for the focus owner.

### 5. Pinned rows / columns + ARIA

- Pinned rows are visually adjacent to body rows but live in separate DOM containers. ARIA must announce them in the right order.
- Pinned columns same problem horizontally.
- Spec: rendered DOM order matches reading order; pinned cells get `aria-rowindex` / `aria-colindex` consistent with their visual position.

### 6. Keyboard navigation (WAI-ARIA grid pattern)

- Tab moves to next interactive element OUTSIDE the grid (not within)
- Arrow keys move cell focus within
- Home / End / PageUp / PageDown
- Ctrl+Home / Ctrl+End
- Enter (with cell focused) — opens editor
- Escape (in edit mode) — cancels
- Spec: full WAI-ARIA grid keyboard pattern, with bc-grid-specific extensions (range selection in Q3 — its keys live atop this base).

### 7. Screen reader live regions

- Cell-edit commit announces "Updated [column] to [value]"
- Sort change announces "Sorted by [column] ascending/descending"
- Filter change announces row count
- Selection change announces "[N] rows selected"
- Spec: which events announce, what they say, how (live region or aria-live attribute).

### 8. Reduced motion

- `prefers-reduced-motion: reduce` disables all animations.
- Spec: which transitions become instant; which become 50ms ease (gentle but not jarring).

### 9. High contrast / forced colours

- Windows high-contrast mode + macOS Increase Contrast.
- Spec: `forced-colors` media query overrides; ensure cell borders, focus ring, selection are visible.

### 10. Touch / pointer

- Spec: touch targets ≥ 44px; long-press for context menu; double-tap to enter edit.

## Test plan (Q1 deliverable)

- axe-core in CI for every PR
- Manual screen-reader passes per phase (architect or designated agent)
- Reduced-motion + forced-colors automated visual regression

## Open questions

- Is the cell-focused state announced on every arrow movement, or only on chunked moves?
- For range selection (Q3) — how do we announce range size to screen readers?
- Pivot mode (Q5) — `treegrid` or something else?
