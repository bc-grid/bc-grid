import { describe, expect, test } from "bun:test"
import * as internals from "../src/gridInternals"
import {
  DEFAULT_BODY_HEIGHT,
  cellStyle,
  headerBandStyle,
  pinnedLaneStyle,
  resolveContentFitHeight,
  resolveFallbackBodyHeight,
  resolveGridFitHeight,
  resolveViewportFitHeight,
  rootStyle,
  viewportStyle,
} from "../src/gridInternals"

describe("rootStyle", () => {
  test("numeric height pins the root height", () => {
    expect(rootStyle(560)).toMatchObject({
      display: "flex",
      flexDirection: "column",
      height: 560,
      position: "relative",
    })
    expect(rootStyle(560).minHeight).toBeUndefined()
  })

  test("undefined height lets the parent flex shrink the root", () => {
    const style = rootStyle(undefined)
    expect(style.height).toBeUndefined()
    expect(style.minHeight).toBe(0)
  })

  test("'auto' returns no fixed height — page-flow mode owns the layout", () => {
    const style = rootStyle("auto")
    expect(style).not.toHaveProperty("height")
    expect(style.minHeight).toBe(0)
    expect(style.display).toBe("flex")
    expect(style.flexDirection).toBe("column")
  })
})

describe("viewportStyle", () => {
  test("undefined body height + fixed mode → flex 1 1 auto, scroll-on-overflow", () => {
    const style = viewportStyle(undefined, false, 640)
    expect(style).toMatchObject({
      "--bc-grid-viewport-width": "640px",
      flex: "1 1 auto",
      minHeight: 0,
      overflow: "auto",
      position: "relative",
    })
    expect(style.height).toBeUndefined()
  })

  test("numeric body height + fixed mode → fixed-height internal viewport", () => {
    const style = viewportStyle(360, false, 1024)
    expect(style).toMatchObject({
      "--bc-grid-viewport-width": "1024px",
      flex: "0 0 auto",
      height: 360,
      overflow: "auto",
      position: "relative",
    })
    expect(style.minHeight).toBeUndefined()
  })

  test("page-flow mode hands the scrollbar back to the document", () => {
    const style = viewportStyle(undefined, true, 720)
    expect(style["--bc-grid-viewport-width" as keyof typeof style]).toBe("720px")
    expect(style.overflowX).toBe("auto")
    expect(style.overflowY).toBe("hidden")
    expect(style.flex).toBe("0 0 auto")
    expect(style).not.toHaveProperty("height")
    expect(style).not.toHaveProperty("minHeight")
  })

  test("page-flow mode ignores any body-height hint", () => {
    const style = viewportStyle(360, true, Number.NaN)
    expect(style["--bc-grid-viewport-width" as keyof typeof style]).toBe("800px")
    expect(style.overflowX).toBe("auto")
    expect(style.overflowY).toBe("hidden")
    expect(style).not.toHaveProperty("height")
  })
})

describe("headerBandStyle", () => {
  test("pins the header band at the viewport's top edge above body pinned lanes", () => {
    expect(headerBandStyle(960, 72)).toMatchObject({
      height: 72,
      minWidth: "100%",
      position: "sticky",
      top: 0,
      width: 960,
      // z-index 4 must be > body pinnedLaneStyle's z-index (3) so
      // body pinned cells don't paint over the sticky header on
      // vertical scroll. Bsncraft v0.5.0 GA P0 regression — pre-fix,
      // both used z-index 3 and DOM-order tie-break put body rows
      // (later in DOM) above the header.
      zIndex: 4,
    })
  })

  test("clamps width below 1 to keep the band layoutable in zero-width canvases", () => {
    expect(headerBandStyle(0, 36).width).toBe(1)
  })
})

describe("pinnedLaneStyle", () => {
  test("left lane sticks at viewport-left=0", () => {
    const style = pinnedLaneStyle("left", 36, 120)
    expect(style).toMatchObject({
      height: 36,
      position: "sticky",
      width: 120,
      // z-index 3 must be < headerBandStyle's z-index (4) so the
      // sticky header band paints above body pinned lanes on
      // vertical scroll. Bsncraft v0.5.0 GA P0 regression.
      zIndex: 3,
      left: 0,
    })
    expect(style).not.toHaveProperty("right")
  })

  test("right lane sticks at viewport-right=0 via CSS right (no JS-computed left)", () => {
    const style = pinnedLaneStyle("right", 36, 120)
    expect(style).toMatchObject({
      height: 36,
      position: "sticky",
      width: 120,
      zIndex: 3,
      right: 0,
    })
    expect(style).not.toHaveProperty("left")
  })

  test("header band z-index strictly greater than body pinned lane z-index", () => {
    // Pin the cross-helper invariant so a future refactor that bumps
    // one without the other catches in CI. Bsncraft v0.5.0 GA P0
    // regression — they used to tie at 3.
    const headerZ = headerBandStyle(960, 36).zIndex as number
    const leftLaneZ = pinnedLaneStyle("left", 36, 120).zIndex as number
    const rightLaneZ = pinnedLaneStyle("right", 36, 120).zIndex as number
    expect(headerZ).toBeGreaterThan(leftLaneZ)
    expect(headerZ).toBeGreaterThan(rightLaneZ)
  })
})

describe("cellStyle (post-RFC: no transform; lane wrappers carry sticky)", () => {
  test("never emits a transform field — sticky composition pins pinned cells natively", () => {
    expect(
      cellStyle({ align: "left", height: 36, left: 120, pinned: "left", width: 80 }),
    ).not.toHaveProperty("transform")
    expect(
      cellStyle({ align: "right", height: 36, left: 240, pinned: "right", width: 80 }),
    ).not.toHaveProperty("transform")
    expect(
      cellStyle({ align: "left", height: 36, left: 0, pinned: null, width: 120 }),
    ).not.toHaveProperty("transform")
  })

  test("center cells stay absolute-positioned within their row", () => {
    const style = cellStyle({ align: "left", height: 36, left: 240, pinned: null, width: 120 })
    expect(style.position).toBe("absolute")
    expect(style.zIndex).toBe(1)
  })

  test("pinned cells stay absolute-positioned within their lane wrapper", () => {
    const style = cellStyle({ align: "left", height: 36, left: 0, pinned: "left", width: 120 })
    expect(style.position).toBe("absolute")
    expect(style.zIndex).toBe(2)
  })
})

describe("regression guards: deleted JS scroll-sync helpers stay deleted", () => {
  test("headerScrollTransform / syncHeaderRowsScroll / pinnedTransformValue not exported", () => {
    expect("headerScrollTransform" in internals).toBe(false)
    expect("syncHeaderRowsScroll" in internals).toBe(false)
    expect("pinnedTransformValue" in internals).toBe(false)
    expect("headerViewportStyle" in internals).toBe(false)
    expect("autoHeightHeaderViewportStyle" in internals).toBe(false)
    expect("scrollerStyle" in internals).toBe(false)
  })
})

describe("resolveFallbackBodyHeight", () => {
  test("numeric height yields height - headerHeight, never below rowHeight", () => {
    expect(resolveFallbackBodyHeight(560, 36, 40)).toBe(520)
    // Header taller than total height: never below the row height floor.
    expect(resolveFallbackBodyHeight(20, 36, 40)).toBe(36)
  })

  test("'auto' falls back to DEFAULT_BODY_HEIGHT for the pre-mount window", () => {
    expect(resolveFallbackBodyHeight("auto", 36, 40)).toBe(DEFAULT_BODY_HEIGHT)
  })

  test("undefined falls back to DEFAULT_BODY_HEIGHT", () => {
    expect(resolveFallbackBodyHeight(undefined, 36, 40)).toBe(DEFAULT_BODY_HEIGHT)
  })
})

describe("resolveViewportFitHeight", () => {
  test("measures from the grid top to the viewport bottom", () => {
    expect(resolveViewportFitHeight({ viewportHeight: 900, elementTop: 140, minHeight: 400 })).toBe(
      760,
    )
  })

  test("floors the measured height at the minimum", () => {
    expect(resolveViewportFitHeight({ viewportHeight: 500, elementTop: 420, minHeight: 360 })).toBe(
      360,
    )
  })
})

describe("resolveContentFitHeight", () => {
  test("adds header chrome, body rows, trailing chrome, and the border allowance", () => {
    expect(
      resolveContentFitHeight({
        headerChromeHeight: 80,
        bodyHeight: 5 * 36,
        minBodyHeight: 36,
        trailingChromeHeight: 36,
      }),
    ).toBe(298)
  })

  test("keeps one row of body height for empty row sets", () => {
    expect(
      resolveContentFitHeight({
        headerChromeHeight: 40,
        bodyHeight: 0,
        minBodyHeight: 36,
      }),
    ).toBe(78)
  })
})

describe("resolveGridFitHeight", () => {
  test("explicit height wins over fit", () => {
    expect(
      resolveGridFitHeight({
        explicitHeight: 480,
        fit: "content",
        contentHeight: 200,
        viewportHeight: 600,
        minViewportHeight: 400,
      }),
    ).toBe(480)
  })

  test("content fit maps to page-flow height", () => {
    expect(
      resolveGridFitHeight({
        explicitHeight: undefined,
        fit: "content",
        contentHeight: 800,
        viewportHeight: 600,
        minViewportHeight: 400,
      }),
    ).toBe("auto")
  })

  test("viewport fit uses the measured viewport height with a fallback", () => {
    expect(
      resolveGridFitHeight({
        explicitHeight: undefined,
        fit: "viewport",
        contentHeight: 200,
        viewportHeight: 620,
        minViewportHeight: 400,
      }),
    ).toBe(620)
    expect(
      resolveGridFitHeight({
        explicitHeight: undefined,
        fit: "viewport",
        contentHeight: 200,
        viewportHeight: null,
        minViewportHeight: 400,
      }),
    ).toBe(400)
  })

  test("auto fit stays page-flow until content exceeds the viewport", () => {
    expect(
      resolveGridFitHeight({
        explicitHeight: undefined,
        fit: "auto",
        contentHeight: 360,
        viewportHeight: 620,
        minViewportHeight: 400,
      }),
    ).toBe("auto")
    expect(
      resolveGridFitHeight({
        explicitHeight: undefined,
        fit: "auto",
        contentHeight: 900,
        viewportHeight: 620,
        minViewportHeight: 400,
      }),
    ).toBe(620)
  })
})
