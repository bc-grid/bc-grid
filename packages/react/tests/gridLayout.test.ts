import { describe, expect, test } from "bun:test"
import {
  DEFAULT_BODY_HEIGHT,
  autoHeightHeaderViewportStyle,
  headerScrollTransform,
  headerViewportStyle,
  pinnedLaneStyle,
  resolveContentFitHeight,
  resolveFallbackBodyHeight,
  resolveGridFitHeight,
  resolveViewportFitHeight,
  rootStyle,
  scrollerStyle,
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

describe("scrollerStyle", () => {
  test("undefined body height + fixed mode → flex 1 1 auto, scroll-on-overflow", () => {
    const style = scrollerStyle(undefined)
    expect(style).toMatchObject({
      flex: "1 1 auto",
      minHeight: 0,
      overflow: "auto",
      position: "relative",
    })
    expect(style.height).toBeUndefined()
  })

  test("numeric body height + fixed mode → fixed-height internal scroller", () => {
    const style = scrollerStyle(360)
    expect(style).toMatchObject({
      flex: "0 0 auto",
      height: 360,
      overflow: "auto",
      position: "relative",
    })
    expect(style.minHeight).toBeUndefined()
  })

  test("page-flow mode hands the scrollbar back to the document", () => {
    const style = scrollerStyle(undefined, true)
    expect(style.overflowX).toBe("auto")
    expect(style.overflowY).toBe("hidden")
    expect(style.flex).toBe("0 0 auto")
    // No fixed height + no minHeight: the scroller grows with its canvas.
    expect(style).not.toHaveProperty("height")
    expect(style).not.toHaveProperty("minHeight")
  })

  test("page-flow mode ignores any body-height hint", () => {
    // Even if a numeric bodyHeight bleeds through, page-flow takes priority.
    const style = scrollerStyle(360, true)
    expect(style.overflowX).toBe("auto")
    expect(style.overflowY).toBe("hidden")
    expect(style).not.toHaveProperty("height")
  })
})

describe("headerViewportStyle", () => {
  test("fixed-height mode keeps the header in the normal grid flow", () => {
    expect(headerViewportStyle).toMatchObject({
      flex: "0 0 auto",
      overflow: "hidden",
      position: "relative",
      zIndex: 3,
    })
  })

  test("auto-height mode makes the header sticky above body cells", () => {
    expect(autoHeightHeaderViewportStyle).toMatchObject({
      flex: "0 0 auto",
      overflow: "hidden",
      position: "sticky",
      top: 0,
      zIndex: 4,
    })
  })
})

describe("headerScrollTransform", () => {
  test("uses the same translate contract as body horizontal scrolling", () => {
    expect(headerScrollTransform(0)).toBe("translate3d(0px, 0, 0)")
    expect(headerScrollTransform(240)).toBe("translate3d(-240px, 0, 0)")
  })
})

describe("pinnedLaneStyle", () => {
  test("keeps lane descendants pointer-interactive", () => {
    const style = pinnedLaneStyle("left", 36, 120, 600)
    expect(style.pointerEvents).toBeUndefined()
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
