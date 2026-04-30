import { describe, expect, test } from "bun:test"
import {
  DEFAULT_SIDEBAR_WIDTH,
  nextSidebarPanelForActivation,
  normalizeSidebarPanelId,
  resolveSidebarPanels,
  resolveSidebarWidth,
} from "../src/sidebar"
import type { BcSidebarPanel } from "../src/types"

describe("sidebar state", () => {
  test("toggles a requested panel and closes when the active tab is requested again", () => {
    expect(nextSidebarPanelForActivation(null, "columns")).toBe("columns")
    expect(nextSidebarPanelForActivation("columns", "filters")).toBe("filters")
    expect(nextSidebarPanelForActivation("filters", "filters")).toBeNull()
  })

  test("normalizes active panel ids against registered panels", () => {
    const panels = [{ id: "columns" }, { id: "filters" }]

    expect(normalizeSidebarPanelId("columns", panels)).toBe("columns")
    expect(normalizeSidebarPanelId("pivot", panels)).toBeNull()
    expect(normalizeSidebarPanelId(null, panels)).toBeNull()
    expect(normalizeSidebarPanelId(undefined, panels)).toBeNull()
  })
})

describe("sidebar panel resolution", () => {
  test("resolves built-in and custom panel slots without duplicate ids", () => {
    const panels: readonly BcSidebarPanel[] = [
      "columns",
      "columns",
      "filters",
      {
        id: "audit",
        label: "Audit",
        icon: () => null,
        render: () => null,
      },
    ]

    expect(resolveSidebarPanels(panels).map((panel) => panel.id)).toEqual([
      "columns",
      "filters",
      "audit",
    ])
  })

  test("drops custom panels without usable ids or labels", () => {
    const panels: readonly BcSidebarPanel[] = [
      { id: " ", label: "Blank id", icon: () => null, render: () => null },
      { id: "audit", label: " ", icon: () => null, render: () => null },
      { id: "audit", label: "Audit", icon: () => null, render: () => null },
    ]

    expect(resolveSidebarPanels(panels).map((panel) => panel.id)).toEqual(["audit"])
  })

  test("uses the default width unless a positive finite width is supplied", () => {
    expect(resolveSidebarWidth(undefined)).toBe(DEFAULT_SIDEBAR_WIDTH)
    expect(resolveSidebarWidth(0)).toBe(DEFAULT_SIDEBAR_WIDTH)
    expect(resolveSidebarWidth(Number.NaN)).toBe(DEFAULT_SIDEBAR_WIDTH)
    expect(resolveSidebarWidth(320)).toBe(320)
  })
})
