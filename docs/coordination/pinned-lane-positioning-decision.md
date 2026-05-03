# Pinned-lane positioning architecture — group decision

**Status:** OPEN. Awaiting input from worker1, worker2, worker3 before coordinator picks a fix.

**Created:** 2026-05-04 by Claude coordinator after bsncraft v0.6.0-alpha.1 P0 surfaced that the v0.5.0 GA P0 fix (#443) doesn't actually close the pinned-right bug for non-5-column consumers.

**Maintainer note:** this isn't a unilateral coordinator call. Three CSS architecture options below; I want each worker to read + comment with their lane's preference + any tradeoffs I missed.

---

## The bug

Bsncraft (`<BcServerGrid rowModel="paged">` with 4 visible body columns: detail toggle + code + name + actions) reports the pinned-right `__bc_actions` column rendering on the LEFT side, overlapping the auto-injected `__bc_detail` column. Same setup that #443 was supposed to fix; the fix shipped but doesn't reach the consumer's case.

## The architecture today

`packages/theming/src/styles.css`:

```css
.bc-grid-header,
.bc-grid-row {
  display: grid;
  grid-template-columns: var(--bc-grid-columns);
  min-width: 45rem;
}

/* 5 hardcoded fr-tracks regardless of actual column count */
:root {
  --bc-grid-columns:
    minmax(7rem, 0.8fr) minmax(12rem, 1.4fr) minmax(6rem, 0.75fr)
    minmax(7rem, 0.75fr) minmax(7rem, 0.8fr);
}

/* From the v0.5.0 GA P0 fix #443 */
.bc-grid-pinned-lane-left  { grid-column: 1 / 2;   justify-self: start; }
.bc-grid-pinned-lane-right { grid-column: -2 / -1; justify-self: end;   }
```

**Body cells are `position: absolute`** (per `cellStyle` in `gridInternals.ts`) — they don't use grid layout at all. Their `left` coordinate comes from the virtualizer.

**Header cells are also `position: absolute`** (verified via `headerCells.tsx:407` `position: "absolute"` in cellStyle).

**Lane wrappers are `position: sticky; left: 0` (left lane) or `right: 0` (right lane)** + inline `width: <pinnedXxxWidth>`. Sticky positioning is what keeps them at the viewport's edge during horizontal scroll.

## Why the v0.5.0 GA fix doesn't reach bsncraft

`grid-column: -2 / -1` resolves against `--bc-grid-columns` track count. The default is 5 hardcoded `minmax()` fr-tracks. When the row has 4 actual columns:

- Row width = `virtualWindow.totalWidth` (sum of column widths, e.g. 434px)
- BUT `min-width: 45rem` (720px) forces the row to 720px
- Grid template forces 5 tracks across 720px (~144px each)
- `grid-column: -2 / -1` lands the right lane in TRACK 5 (x=576-720)
- With `justify-self: end` + `width: 50px`, lane occupies x=670-720 of the row

Sticky `right: 0` should pull it to viewport's right edge. But the consumer reports it renders on the LEFT. **I haven't fully diagnosed why** — the analysis says the math works out. Possible angles still open:

1. `--bc-grid-columns` is `:root`-scoped at line ~1 of the CSS but the consumer might override or shadow it without including the bc-grid var. If the var is unset on the row, `grid-template-columns: ` is empty → row falls back to auto-placement of children → both lanes land at column 1.
2. The 5-track template assumes 5+ data columns. For consumers with fewer, `grid-column: -2 / -1` may not land where intended.
3. Some third interaction with `display: grid` on the row + sticky lanes that I haven't traced.

## Options on the table

### Option A: Remove `display: grid` from `.bc-grid-row`, keep on `.bc-grid-header`

**My first attempt** (worktree: `agent/coordinator/bsncraft-v060-pinned-right-actually-fix`, since reverted at maintainer pushback).

- Body cells are absolute → grid layout was never load-bearing for them
- Lane wrappers fall out of grid → they become block-flow children of an absolute parent
- **Problem maintainer flagged**: in default block flow, two block-positioned-sticky lanes stack vertically. Bad layout.
- **Possible mitigation**: use `display: flex; flex-direction: row` on the body row. Lanes are flex children, sticky still works. Cells absolute (out of flow).

### Option B: Keep `display: grid` but use a layout-agnostic template

Make `--bc-grid-columns` either dynamic (computed from column count) or use an auto-flow template that doesn't depend on track count:

```css
.bc-grid-row {
  display: grid;
  grid-template-columns: auto 1fr auto;  /* 3 tracks: left lane, center, right lane */
}

.bc-grid-pinned-lane-left  { grid-column: 1; }
.bc-grid-pinned-lane-right { grid-column: 3; }
```

**Pros:** small change, works for any column count, sticky positioning unchanged.
**Cons:** the middle `1fr` track interacts with absolute cells weirdly (cells overlap the track but don't size it). Need to verify the track sizing doesn't push the right lane off the row.

### Option C: Keep `display: grid` + pin lanes via `grid-column-start: -1` / `1` semantics

`grid-column: -1` means "the LAST grid line" — works regardless of track count. With `justify-self: end`, the lane aligns at the row's right edge (at the last grid line).

```css
.bc-grid-pinned-lane-right {
  grid-column-start: -1;
  justify-self: end;
}
```

**Pros:** zero dependency on `--bc-grid-columns` count; works for any number of columns.
**Cons:** `grid-column-start: -1` places the item at the last grid LINE (one past the last track). With nothing at line -1, the auto-placement algorithm may put the item somewhere unexpected. Needs browser-test.

### Option D: Compute `--bc-grid-columns` dynamically from the actual column array

Set `--bc-grid-columns` inline on the row root from `resolvedColumns.length` * `<track-spec>`. Then `grid-column: -2 / -1` always resolves correctly.

**Pros:** keeps the existing fix shape; just fixes the underlying var.
**Cons:** new render-time CSS var coupling. Inline style on every row. Bundle cost (small).

### Option E: Don't use grid placement at all; rely on `position: sticky` + DOM order

Lane wrappers are first/last children of the row. Sticky positioning with `left: 0` / `right: 0` and inline width should handle the visual without needing grid. The "natural position" during non-scroll shouldn't matter because sticky takes over the moment the user scrolls.

**Pros:** simplest mental model.
**Cons:** "natural position" of a sticky element in default block flow with absolute siblings is at the top:0 left:0 of the row (block-flow line 1). Both lanes would stack vertically by default. Need a layout primitive to put them on the same line — which brings us back to flex or grid.

---

## Question for each worker

Pick the option you think is right for v0.6.0-alpha.2 + write 2-4 lines on why, focused on YOUR lane's concerns:

- **worker1 (server-grid lane)**: does this affect your client-tree-rowmodel work or any server-grid render path you've been touching? Does the row's `display: grid` interact with the outline column at all?
- **worker2 (filters + chrome lane)**: you authored the original layout pass PR (b) (#416 detail panel sticky-left) and the layout architecture pass RFC consumed several lane wrapper edge cases. Does any of your sticky-positioning work depend on the row being a grid container?
- **worker3 (editor + UX lane)**: the editor portal's in-cell mount renders inside a body cell — does the row's `display: grid` affect editor positioning at all? Does your scroll-state controlled prop work (#450) interact with the lane wrappers?

Reply by editing this file with a section like:

```markdown
## worker1 verdict

I prefer Option <X> because <reason>. Caveat for my lane: <thing>.
```

Or if you have a sixth option I haven't considered, propose it.

After all three workers weigh in, coordinator picks + ships. Estimated turnaround: 30 min if workers are active.
