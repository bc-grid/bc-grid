# Post-v1 backlog

**Author:** c2 (coordinator)
**Date:** 2026-04-30
**Snapshot:** post-`audit-c2-005` + follow-ups

This is the parking lot for items deferred out of the 2-week v1.0 parity sprint. Each item has a clear "why deferred" so we don't lose the rationale when v1.1 planning starts.

The list is grouped by *origin*: where the item came from (audit, RFC open question, user feedback, or scope cut from v1).

---

## From audit-c2-005

### audit-005-F1 — Wire `setPageSizeState` and `setGroupByState` setters when chrome lands
**Why deferred:** Track 5 chrome (status bar / sidebar / pagination control) is the natural owner of these state mutations. Wiring the setters in isolation now would create dead code — nothing in v0.1-alpha can mutate them.

**Trigger:** When `chrome-pagination` and/or `chrome-groupby-control` impl tasks land in Track 5.

**Effort:** XS (1-2 lines per setter wire-through, plus `BcGridApi.setPageSize`/`setGroupBy`).

### audit-005-F2 — Cross-tab `storage` event listener for persistence
**Why deferred:** Adds ~30 lines + listener cleanup paths. The current "load on mount, write on debounce" model is acceptable for v1 single-tab usage. Multi-tab divergence is a known limitation, documented.

**Effort:** S.

**Implementation sketch:**
```ts
useEffect(() => {
  if (!gridId) return
  const handler = (e: StorageEvent) => {
    if (!e.key?.startsWith(`bc-grid:${gridId}:`)) return
    // Re-read and dispatch a state-merge action
  }
  window.addEventListener("storage", handler)
  return () => window.removeEventListener("storage", handler)
}, [gridId])
```

### audit-005-F4 + F8 — Tooltip portal-polish
**Combined item:** consumer ref merge (so `cellRenderer` can attach refs) + theme-token scoping (so non-shadcn hosts get themed tooltips).

**Why deferred:** Both are quality-of-life. v1 ships with shadcn-host as the documented default per audit-c2-004; the theming gap only matters for non-shadcn hosts. Ref merge matters only if someone writes a cell renderer that attaches a ref.

**Effort:** S.

### audit-005-F5 — `usePagedServerState.getModelState` cleanup
**Why deferred:** The outer `BcServerGrid.getServerRowModelState()` correctly overrides the inner controller's hard-coded `selection: undefined`. Inner is private. Cleanup is cosmetic.

**Effort:** XS.

### audit-005-F6 — Excel autoFilter guard for empty rows
**Why deferred:** ExcelJS handles it, output is technically correct (just weird). Single-line fix that c2 happily takes when convenient.

**Effort:** XS.

### audit-005-F9 — Document `__bc-grid-*__` reserved prefix
**Why deferred:** The selection-checkbox column is the only such column today. Track 0 group-by-client and Track 4 pivot will introduce more synthetic columns; the convention is naturally documented when they land.

**Effort:** XS (api.md JSDoc edit).

### audit-005-F10 — `__bcGridPerf` setup-error guard
**Why deferred:** Defensive-only; only triggers if the smoke perf URL is misconfigured, which is unlikely in CI. See test-coverage-punchlist TC-10.

**Effort:** XS.

---

## From RFC open questions

### range-rfc — `copyRange(range, { includeHidden: boolean })` post-v1 option
**Source:** `range-rfc.md` open questions section.

**Why deferred:** Hidden-column copy is a niche use case. v1 ships with hidden cols *excluded* from copy (matches `aria-colcount` semantics). Adding the option later is purely additive — no breaking change.

**Effort:** S.

### aggregation-rfc — `inverse?(acc, row)` op for incremental subtraction
**Source:** `aggregation-rfc.md` group-row recompute discussion.

**Why deferred:** v1 forces a full per-group recompute on row removal/reassignment, matching the streaming section's choice for removes/updates. Incremental subtraction would require an `inverse` op on the `Aggregation` factory; not all aggregations have a sensible inverse (e.g., `min`/`max` need re-derivation from the source rows). Adding it as an opt-in factory option is a clean extension.

**Effort:** M (engine impl + per-built-in inverse where possible).

### charts-rfc — range and pivot scopes
**Source:** `charts-rfc.md` task split.

**Why deferred (technically: phased):** v1 ships flat-row + aggregated chart support (`scope: "filtered" | "selected" | "all"`). Range and pivot scopes ship as `charts-range-helper` and `charts-pivot-helper` tasks **during v1**, dependent on Track 2 / Track 4 second half landing first. If those tracks slip past the 2-week sprint, the helpers move post-v1.

**Effort:** S each.

### filter-registry-rfc — URL-state persistence backend
**Source:** Track 6 `filter-persistence` task in queue.md is currently `[blocked: depends on filter-registry-rfc]`.

**Why deferred (could land in v1):** depends on Track 6 implementer choosing to land URL backend in the same PR as `localStorage` backend, or split. Not a v1 blocker if they ship `localStorage` only first.

**Effort:** S (additional backend).

### server-row-model — perf tuning
**Source:** `server-row-model-perf-tuning` task in queue.md, blocked on `infinite-mode-block-cache + mutation-pipeline`.

**Why deferred:** Can't tune what isn't built. After Track 3's full server-row-model lands (paged + infinite + tree), measure cache hit rate, block fetch latency, debounce settings at 100k+ rows.

**Effort:** M.

---

## From v1 scope cuts

### Q3 keys (Shift+Arrow, Ctrl+A) — selection-extending keyboard
**Status:** Currently swallowed without action. Q3-reserved per accessibility-rfc.

**Why deferred:** Selection-by-keyboard is a Q3 feature (not v1). Click-mode selection is fully implemented; Space-toggle (single-row keyboard parity) is fully implemented. Multi-row keyboard selection is a separate feature that introduces an "extension anchor" concept.

**Effort:** M.

### Q2 editing keys (F2, Enter, Escape)
**Status:** Currently noop per accessibility-rfc. Editor framework is RFC-approved (#45) but not implemented.

**Why deferred:** Editor framework + 7 built-in editors + validation + dirty tracking = ~3-4 person-days of impl, sized as Track 1 in v1-parity-sprint. Could land late-v1 or slip post-v1 depending on where Track 1 ends up.

**Effort:** L (whole track).

### Mobile / touch
**Status:** No touch gesture support. Pointer events handle single-tap selection; multi-touch + long-press + edge-scroll are not wired.

**Why deferred:** Mobile is a NEW track explicitly listed in Track 7 (Polish + Charts + Mobile). Likely slips post-v1 unless an agent picks it up; even at v1.1 it's M-L effort.

**Effort:** L.

### Tree mode
**Status:** Track 3 design includes `rowModel="tree"` but the impl task is `[blocked: depends on infinite-mode-block-cache]`. Even with that unblocked, tree adds significant complexity (lazy children, expand/collapse, ServerTreeRow rendering).

**Why deferred:** Realistic v1 sprint can ship paged + infinite. Tree is a stretch goal; if it slips it's the natural top-of-stack for v1.1.

**Effort:** L.

### NVDA / VoiceOver / JAWS spot-check
**Status:** `screenreader-spot-check` task in queue.md (not yet claimed). axe-core is enforced for compile-time a11y; live screen-reader testing is manual.

**Why deferred:** Manual session against real readers; not a code task. Should be done before v1 GA but not v0.1-alpha.

**Effort:** S (1 session each for NVDA + VoiceOver; JAWS if available).

### Visual regression test infrastructure
**Status:** Repo doesn't currently use Playwright snapshots. See test-coverage-punchlist TC-09.

**Why deferred:** Pioneering snapshot tests is its own project — needs CI image freezing, Linux/macOS rendering parity decisions, baseline management. Worth doing post-v1.

**Effort:** M (infrastructure) + (M-L for actual visual coverage).

---

## From user feedback / one-off

### bc-next integration cutover
**Status:** AR Customers ledger demo (PR #42) is a faithful rebuild of the ERP shape on bc-grid. The bc-next ERP itself still uses AG Grid; cutover is a separate post-1.0 follow-up.

**Why deferred:** The user's stated goal is "v1.0 parity grid for the ERP UX" — not "swap AG Grid in bc-next". Cutover is a downstream consumer task and depends on v1.0 GA.

**Effort:** L (consumer-side refactor of every grid call site; not bc-grid effort).

### CSV export — formula injection escape (`escapeFormulas: boolean`)
**Source:** Post-merge comment on PR #72.

**Why deferred:** Niche security feature (Excel auto-evaluates `=`/`+`/`-`/`@` prefixes). Default-off is correct (would mangle phone numbers). Opt-in option to be added in csv-export-v2.

**Effort:** XS.

### Tooltip — touch device behaviour
**Status:** Hover triggers don't fire on touch. Focus does, so tap-to-focus shows the tooltip. Long-press is conventionally what shows tooltips on mobile, but neither bc-grid nor most React libraries handle this.

**Why deferred:** Mobile track owns it. See "Mobile / touch" above.

**Effort:** S (within mobile track).

---

## How items leave this backlog

1. v1.x release planning kicks off after v1.0 GA.
2. We sweep this doc + queue.md's `[blocked: ...]` items + post-v1 GitHub issues into a v1.1 milestone.
3. Items are sorted by user-impact × effort; top items become next-sprint queue tasks.

c2 will update this doc whenever an audit, RFC, or user-feedback yields a new "deferred to post-v1" item.
