import { describe, expect, test } from "bun:test"
import { featureDiscoveryRows, featureShortcuts, shortcutHref } from "../src/featureDiscovery"

describe("feature discovery fixtures", () => {
  test("exposes quick links for the high-value demo entry points", () => {
    expect(featureShortcuts.map((shortcut) => shortcut.id)).toEqual([
      "inline-filters",
      "popup-filters",
      "master-detail",
      "column-pinning",
      "column-persistence",
      "server-edit-grid",
    ])
    expect(shortcutHref("popup-filters")).toBe("?filterPopup=1#customer-grid")
    expect(shortcutHref("master-detail")).toBe("?masterDetail=1#customer-grid")
    expect(shortcutHref("column-persistence")).toBe("?urlstate=1&toolPanel=columns#customer-grid")
    expect(shortcutHref("server-edit-grid")).toBe("#server-edit-grid")
  })

  test("feature map points required demos at real shortcuts", () => {
    const rowsByFeature = new Map(featureDiscoveryRows.map((row) => [row.feature, row]))

    expect(rowsByFeature.get("Inline filters")?.shortcutHref).toBe(shortcutHref("inline-filters"))
    expect(rowsByFeature.get("Popup filters")?.shortcutHref).toBe(shortcutHref("popup-filters"))
    expect(rowsByFeature.get("Master detail")?.shortcutHref).toBe(shortcutHref("master-detail"))
    expect(rowsByFeature.get("Sort, resize, pin")?.shortcutHref).toBe(
      shortcutHref("column-pinning"),
    )
    expect(rowsByFeature.get("Column persistence")?.shortcutHref).toBe(
      shortcutHref("column-persistence"),
    )
    expect(rowsByFeature.get("Lookup/select editors")?.shortcutHref).toBe("?edit=1#customer-grid")
    expect(rowsByFeature.get("Server row model")?.shortcutHref).toBe(
      shortcutHref("server-edit-grid"),
    )
  })
})
