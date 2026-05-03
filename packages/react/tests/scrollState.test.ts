import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Source-shape regression guards for `v06-scroll-state-controlled-prop`
 * (v0.6.0-alpha.1 critical, maintainer ask 2026-05-03).
 *
 * The behaviour itself (debounced onScrollChange, one-time
 * initialScrollOffset restore at mount) needs a DOM-mounted test
 * to verify; coordinator runs that via the Playwright spec at
 * `apps/examples/tests/scroll-state-restore.pw.ts`. This file pins
 * the wiring shape so a refactor that drops the debounce constant,
 * the cleanup effect, or the read-from-ref symmetry catches loudly.
 *
 * Per `docs/recipes/grid-state-persistence.md` for the full
 * state-restore pattern.
 */

const here = fileURLToPath(new URL(".", import.meta.url))
const gridSource = readFileSync(`${here}../src/grid.tsx`, "utf8")
const typesSource = readFileSync(`${here}../src/types.ts`, "utf8")

describe("public type surface — initialScrollOffset + onScrollChange + getScrollOffset", () => {
  test("BcGridProps exposes initialScrollOffset with the documented shape", () => {
    expect(typesSource).toMatch(
      /initialScrollOffset\?:\s*\{\s*top:\s*number;\s*left:\s*number\s*\}/,
    )
  })

  test("BcGridProps exposes onScrollChange with the documented signature", () => {
    expect(typesSource).toMatch(
      /onScrollChange\?:\s*\(next:\s*\{\s*top:\s*number;\s*left:\s*number\s*\}\)\s*=>\s*void/,
    )
  })

  test("recipe doc reference is preserved in JSDoc (load-bearing)", () => {
    // The two props' JSDoc points consumers at the recipe doc which
    // shows the FULL state-restore pattern (layout + selection +
    // expansion + scroll). A doc sweep that strips the reference
    // breaks discoverability — pin the link.
    expect(typesSource).toMatch(/grid-state-persistence\.md/)
  })
})

describe("grid.tsx wiring — debounce + initial restore + getScrollOffset", () => {
  test("debounce interval is pinned as a named constant", () => {
    // The interval is consumer-observable (their persistence call
    // rate). Pin it as a constant so a future tuning becomes a
    // deliberate change reviewed in PR rather than a number flipped
    // inline. ~120ms is the sweet spot per the recipe doc.
    expect(gridSource).toMatch(/SCROLL_CHANGE_DEBOUNCE_MS\s*=\s*120/)
  })

  test("handleScroll uses the debounce constant + setTimeout, with cleanup before each schedule", () => {
    // Pin the schedule-and-clear pattern so a refactor that drops
    // the clear (firing N callbacks for N scroll events) trips here.
    expect(gridSource).toMatch(
      /if\s*\(scrollChangeTimerRef\.current\)\s*clearTimeout\(scrollChangeTimerRef\.current\)/,
    )
    expect(gridSource).toMatch(
      /scrollChangeTimerRef\.current\s*=\s*setTimeout\([\s\S]+?SCROLL_CHANGE_DEBOUNCE_MS\)/,
    )
  })

  test("debounce timer is cleared on unmount (no callback after the grid is gone)", () => {
    // Without the cleanup effect a fast-unmounting consumer would
    // see onScrollChange fire AFTER they've torn down their state
    // store. Pin the unmount-clear so a refactor doesn't drop it.
    expect(gridSource).toMatch(
      /useEffect\(\s*\(\)\s*=>\s*\(\)\s*=>\s*\{\s*if\s*\(scrollChangeTimerRef\.current\)\s*clearTimeout/,
    )
  })

  test("debounced callback reads from scrollOffsetRef.current (final position, not start-of-debounce)", () => {
    // The whole point of the debounce: the persisted value should
    // reflect where the user FINALLY settled, not the position at
    // the tick that started the debounce. Pin that the timeout
    // body reads from the live ref.
    expect(gridSource).toMatch(
      /onScrollChange\(\{[\s\S]*?top:\s*scrollOffsetRef\.current\.top,[\s\S]*?left:\s*scrollOffsetRef\.current\.left,?[\s\S]*?\}\)/,
    )
  })

  test("initialScrollOffset is captured into a ref ONCE at mount", () => {
    // The prop is read on first render only — subsequent updates
    // are ignored. This mirrors the initialLayout pattern. Pin the
    // ref capture so a refactor that re-reads the prop on each
    // render (and stomps on user-driven scroll) trips here.
    expect(gridSource).toMatch(/initialScrollOffsetRef\s*=\s*useRef\(props\.initialScrollOffset\)/)
  })

  test("initial-restore effect mirrors the DOM scroll back into updateScrollOffset", () => {
    // Programmatic scrollTop/scrollLeft sets DON'T fire the native
    // scroll event — the virtualizer + internal state would lag
    // behind the DOM until the user touched the wheel. Pin the
    // mirror so the post-restore state stays consistent.
    expect(gridSource).toMatch(
      /updateScrollOffset\(\{\s*top:\s*scroller\.scrollTop,\s*left:\s*scroller\.scrollLeft\s*\}\)/,
    )
  })

  test("getScrollOffset reads from the live ref (not React state, which lags one frame)", () => {
    // Consumers calling getScrollOffset() mid-scroll need the
    // freshest value the grid has, not the last committed state
    // tick. Pin the ref read shape.
    expect(gridSource).toMatch(
      /return\s*\{\s*top:\s*scrollOffsetRef\.current\.top,\s*left:\s*scrollOffsetRef\.current\.left\s*\}/,
    )
  })
})
