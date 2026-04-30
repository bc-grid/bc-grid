import { describe, expect, test } from "bun:test"
import { defaultMessages } from "../src/gridInternals"

/**
 * Per `accessibility-rfc §Live Regions`:
 * "Live text is localized through the React layer; no hard-coded
 * English inside engine packages."
 *
 * The grid surfaces every user-visible string through `BcGridMessages`
 * so a host app can localise the whole grid by passing a
 * `messages` prop. These tests assert that the default English strings
 * exist (and are non-empty) for every key the React layer actually
 * uses, so a missing default surfaces here rather than as a runtime
 * crash inside `headerCells` / `gridInternals`.
 */
describe("defaultMessages — required filter / live-region strings", () => {
  test("filter placeholders + aria-label resolver are populated", () => {
    expect(defaultMessages.filterPlaceholder).toBe("Filter")
    expect(defaultMessages.filterMinPlaceholder).toBe("Min")
    expect(defaultMessages.filterMaxPlaceholder).toBe("Max")
    expect(defaultMessages.filterAriaLabel({ columnLabel: "Customer" })).toBe("Filter Customer")
  })

  test("live-region announce templates substitute their params", () => {
    expect(defaultMessages.sortAnnounce({ columnLabel: "Code", direction: "asc" })).toContain(
      "Code",
    )
    expect(defaultMessages.sortAnnounce({ columnLabel: "Code", direction: "asc" })).toContain(
      "ascending",
    )
    expect(defaultMessages.sortAnnounce({ columnLabel: "Code", direction: "desc" })).toContain(
      "descending",
    )
    expect(defaultMessages.filterAnnounce({ visibleRows: 12, totalRows: 42 })).toContain("12")
    expect(defaultMessages.filterAnnounce({ visibleRows: 12, totalRows: 42 })).toContain("42")
    expect(defaultMessages.filterClearedAnnounce({ totalRows: 42 })).toContain("42")
    expect(defaultMessages.selectionAnnounce({ count: 1 })).toContain("1")
    expect(defaultMessages.selectionAnnounce({ count: 5 })).toContain("5")
  })

  test("edit-commit announce templates carry column / row / value substitutions", () => {
    const committed = defaultMessages.editCommittedAnnounce({
      columnLabel: "Status",
      rowLabel: "C-0042",
      formattedValue: "Open",
    })
    expect(committed).toContain("Status")
    expect(committed).toContain("C-0042")
    expect(committed).toContain("Open")
  })

  test("validation / server error templates surface the column + error", () => {
    const validation = defaultMessages.editValidationErrorAnnounce({
      columnLabel: "Total",
      error: "must be positive",
    })
    expect(validation).toContain("Total")
    expect(validation).toContain("must be positive")

    const server = defaultMessages.editServerErrorAnnounce({
      columnLabel: "Total",
      error: "Network error",
    })
    expect(server).toContain("Total")
    expect(server).toContain("Network error")
    // Server-error message tells the user the value was reverted —
    // important for AT users who rely on assertive-region narration.
    expect(server.toLowerCase()).toContain("revert")
  })
})
