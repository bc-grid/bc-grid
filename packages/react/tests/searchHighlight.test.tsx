import { describe, expect, test } from "bun:test"
import { isValidElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { highlightSearchText, splitSearchText } from "../src/bodyCells"

describe("splitSearchText", () => {
  test("returns the original value when search text is empty", () => {
    expect(splitSearchText("Invoice INV-1001", "")).toEqual([
      { match: false, text: "Invoice INV-1001" },
    ])
    expect(splitSearchText("Invoice INV-1001", "   ")).toEqual([
      { match: false, text: "Invoice INV-1001" },
    ])
  })

  test("splits case-insensitive matches and preserves original casing", () => {
    expect(splitSearchText("Acme account AC-44", "ac")).toEqual([
      { match: true, text: "Ac" },
      { match: false, text: "me " },
      { match: true, text: "ac" },
      { match: false, text: "count " },
      { match: true, text: "AC" },
      { match: false, text: "-44" },
    ])
  })

  test("returns a single non-match part when the query is absent", () => {
    expect(splitSearchText("Invoice INV-1001", "xyz")).toEqual([
      { match: false, text: "Invoice INV-1001" },
    ])
  })
})

describe("highlightSearchText", () => {
  test("wraps matched runs in mark elements", () => {
    const rendered = highlightSearchText("Acme account", "ac")
    expect(Array.isArray(rendered)).toBe(true)
    const parts = rendered as unknown[]

    expect(parts[0]).toSatisfy(isValidElement)
    expect(parts[0]).toMatchObject({
      props: {
        className: "bc-grid-search-match",
        "data-bc-grid-search-match": "true",
        children: "Ac",
      },
      type: "mark",
    })
    expect(parts[1]).toBe("me ")
    expect(parts[2]).toSatisfy(isValidElement)
  })

  test("renders multiple case-insensitive matches without extra layout wrappers", () => {
    const html = renderToStaticMarkup(highlightSearchText("Acme account AC-44", "ac"))

    expect(html).toBe(
      '<mark class="bc-grid-search-match" data-bc-grid-search-match="true">Ac</mark>me <mark class="bc-grid-search-match" data-bc-grid-search-match="true">ac</mark>count <mark class="bc-grid-search-match" data-bc-grid-search-match="true">AC</mark>-44',
    )
    expect(html.match(/<mark/g)).toHaveLength(3)
    expect(html).not.toContain("<span")
    expect(html).not.toContain("style=")
  })
})
