import { describe, expect, test } from "bun:test"
import {
  DEFAULT_BODY_HEIGHT,
  resolveFallbackBodyHeight,
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
