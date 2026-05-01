import { describe, expect, test } from "bun:test"
import type { BcColumnStateEntry, BcGridApi } from "@bc-grid/core"
import {
  computeAutosizeWidth,
  dispatchColumnCommand,
  upsertColumnStateEntry,
} from "../src/columnCommands"

describe("upsertColumnStateEntry", () => {
  test("appends a new entry when the column id isn't present", () => {
    const next = upsertColumnStateEntry([], "name", { width: 200 })
    expect(next).toEqual([{ columnId: "name", width: 200 }])
  })

  test("updates the targeted entry without touching the others", () => {
    const state: BcColumnStateEntry[] = [
      { columnId: "name", width: 100 },
      { columnId: "email", width: 200 },
      { columnId: "balance", width: 150 },
    ]
    const next = upsertColumnStateEntry(state, "email", { pinned: "left" })
    expect(next).toEqual([
      { columnId: "name", width: 100 },
      { columnId: "email", width: 200, pinned: "left" },
      { columnId: "balance", width: 150 },
    ])
  })

  test("partial patch merges with existing properties", () => {
    const state: BcColumnStateEntry[] = [
      { columnId: "name", width: 100, pinned: "left", hidden: false },
    ]
    const next = upsertColumnStateEntry(state, "name", { hidden: true })
    expect(next).toEqual([{ columnId: "name", width: 100, pinned: "left", hidden: true }])
  })

  test("setting pinned: null clears prior pinning", () => {
    const next = upsertColumnStateEntry([{ columnId: "name", pinned: "left" }], "name", {
      pinned: null,
    })
    expect(next).toEqual([{ columnId: "name", pinned: null }])
  })

  test("does not mutate the input array", () => {
    const state: readonly BcColumnStateEntry[] = [{ columnId: "name", width: 100 }]
    const next = upsertColumnStateEntry(state, "name", { width: 200 })
    expect(state).toEqual([{ columnId: "name", width: 100 }])
    expect(next).not.toBe(state)
  })
})

describe("computeAutosizeWidth", () => {
  test("returns null for an empty measurement set", () => {
    expect(computeAutosizeWidth([], { minWidth: 60, maxWidth: 800 })).toBeNull()
  })

  test("returns null when every measurement is non-positive", () => {
    expect(computeAutosizeWidth([0, 0, 0], { minWidth: 60, maxWidth: 800 })).toBeNull()
  })

  test("ceils to the widest measurement", () => {
    expect(computeAutosizeWidth([42.3], { minWidth: 60, maxWidth: 800 })).toBe(60)
    expect(computeAutosizeWidth([99.1, 105.4, 88], { minWidth: 60, maxWidth: 800 })).toBe(106)
  })

  test("clamps below minWidth", () => {
    expect(computeAutosizeWidth([10], { minWidth: 60, maxWidth: 800 })).toBe(60)
  })

  test("clamps above maxWidth", () => {
    expect(computeAutosizeWidth([1200], { minWidth: 60, maxWidth: 800 })).toBe(800)
  })

  test("respects unbounded maxWidth", () => {
    expect(computeAutosizeWidth([900], { minWidth: 60, maxWidth: Number.POSITIVE_INFINITY })).toBe(
      900,
    )
  })
})

interface ApiCallLog {
  setColumnPinned: Array<["left" | "right" | null, string]>
  setColumnHidden: Array<[boolean, string]>
  autoSizeColumn: Array<string>
}

function makeRecordingApi(): { api: BcGridApi<unknown>; log: ApiCallLog } {
  const log: ApiCallLog = {
    setColumnPinned: [],
    setColumnHidden: [],
    autoSizeColumn: [],
  }
  const api = {
    setColumnPinned: (columnId: string, pinned: "left" | "right" | null) => {
      log.setColumnPinned.push([pinned, columnId])
    },
    setColumnHidden: (columnId: string, hidden: boolean) => {
      log.setColumnHidden.push([hidden, columnId])
    },
    autoSizeColumn: (columnId: string) => {
      log.autoSizeColumn.push(columnId)
    },
  } as unknown as BcGridApi<unknown>
  return { api, log }
}

describe("dispatchColumnCommand", () => {
  // Pure dispatch contract: each column-context built-in routes to
  // exactly one BcGridApi mutation, with the right arguments. The
  // BcGridContextMenu renderer uses this same dispatch on activate;
  // unit-testing it independently keeps the contract green even
  // when the renderer evolves (worker2's menu-item primitive, etc.).

  test("pin-column-left → setColumnPinned(columnId, 'left')", () => {
    const { api, log } = makeRecordingApi()
    dispatchColumnCommand(api, "pin-column-left", "name")
    expect(log.setColumnPinned).toEqual([["left", "name"]])
    expect(log.setColumnHidden).toEqual([])
    expect(log.autoSizeColumn).toEqual([])
  })

  test("pin-column-right → setColumnPinned(columnId, 'right')", () => {
    const { api, log } = makeRecordingApi()
    dispatchColumnCommand(api, "pin-column-right", "balance")
    expect(log.setColumnPinned).toEqual([["right", "balance"]])
  })

  test("unpin-column → setColumnPinned(columnId, null)", () => {
    const { api, log } = makeRecordingApi()
    dispatchColumnCommand(api, "unpin-column", "email")
    expect(log.setColumnPinned).toEqual([[null, "email"]])
  })

  test("hide-column → setColumnHidden(columnId, true)", () => {
    const { api, log } = makeRecordingApi()
    dispatchColumnCommand(api, "hide-column", "email")
    expect(log.setColumnHidden).toEqual([[true, "email"]])
    // Hide should NEVER go through setColumnPinned even though both
    // commands target a single column — pin/hide are independent
    // axes on BcColumnStateEntry.
    expect(log.setColumnPinned).toEqual([])
  })

  test("autosize-column → autoSizeColumn(columnId)", () => {
    const { api, log } = makeRecordingApi()
    dispatchColumnCommand(api, "autosize-column", "balance")
    expect(log.autoSizeColumn).toEqual(["balance"])
  })

  test("each command call invokes exactly one api method (no fan-out)", () => {
    // A regression that wired hide-column to also call setColumnPinned
    // (or vice versa) would silently change the column state in two
    // axes; pin this contract so the next refactor can't slip.
    const commands = [
      "pin-column-left",
      "pin-column-right",
      "unpin-column",
      "hide-column",
      "autosize-column",
    ] as const
    for (const command of commands) {
      const { api, log } = makeRecordingApi()
      dispatchColumnCommand(api, command, "x")
      const total =
        log.setColumnPinned.length + log.setColumnHidden.length + log.autoSizeColumn.length
      expect(total).toBe(1)
    }
  })

  test("dispatch is idempotent over repeated calls (no hidden state in the helper)", () => {
    // The helper is a pure switch — calling it twice with the same
    // arguments must produce two identical api calls, not just one.
    // Catches a stale-cache regression where someone optimised by
    // memoising on command id.
    const { api, log } = makeRecordingApi()
    dispatchColumnCommand(api, "pin-column-left", "name")
    dispatchColumnCommand(api, "pin-column-left", "name")
    expect(log.setColumnPinned).toEqual([
      ["left", "name"],
      ["left", "name"],
    ])
  })
})
