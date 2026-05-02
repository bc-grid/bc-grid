import { describe, expect, test } from "bun:test"
import type { ColumnId, RowId } from "@bc-grid/core"
import {
  type BcCellEditEntry,
  discardRowOverlayEdits,
  pruneOverlayPatches,
  summariseRowEditState,
} from "../src/useEditingController"

const rowA = "row-a" as RowId
const rowB = "row-b" as RowId
const colName = "name" as ColumnId
const colTotal = "total" as ColumnId

function makeEntry(overrides: Partial<BcCellEditEntry> = {}): BcCellEditEntry {
  return {
    pending: false,
    ...overrides,
  }
}

describe("pruneOverlayPatches — overlay cleanup on data prop update", () => {
  test("clears entries whose canonical value matches the overlay patch", () => {
    const patches = new Map<RowId, Map<ColumnId, unknown>>([
      [rowA, new Map([[colName, "Acme Co."]])],
    ])
    const entries = new Map<RowId, Map<ColumnId, BcCellEditEntry>>([
      [rowA, new Map([[colName, makeEntry({ previousValue: "Acme Inc." })]])],
    ])
    const canonical = (rowId: RowId, columnId: ColumnId) => {
      if (rowId === rowA && columnId === colName) return "Acme Co."
      return undefined
    }

    const result = pruneOverlayPatches(patches, entries, canonical)
    expect(result).toEqual({ changed: true, cleared: 1 })
    expect(patches.size).toBe(0)
    expect(entries.size).toBe(0)
  })

  test("preserves pending entries — overlay still load-bearing", () => {
    const patches = new Map<RowId, Map<ColumnId, unknown>>([
      [rowA, new Map([[colName, "Acme Co."]])],
    ])
    const entries = new Map<RowId, Map<ColumnId, BcCellEditEntry>>([
      [rowA, new Map([[colName, makeEntry({ pending: true })]])],
    ])
    const canonical = () => "Acme Co."

    const result = pruneOverlayPatches(patches, entries, canonical)
    expect(result.changed).toBe(false)
    expect(patches.get(rowA)?.get(colName)).toBe("Acme Co.")
  })

  test("preserves error entries even when canonical matches the overlay", () => {
    const patches = new Map<RowId, Map<ColumnId, unknown>>([
      [rowA, new Map([[colName, "Acme Co."]])],
    ])
    const entries = new Map<RowId, Map<ColumnId, BcCellEditEntry>>([
      [rowA, new Map([[colName, makeEntry({ error: "Server rejected" })]])],
    ])
    const canonical = () => "Acme Co."

    const result = pruneOverlayPatches(patches, entries, canonical)
    expect(result.changed).toBe(false)
    expect(patches.get(rowA)?.get(colName)).toBe("Acme Co.")
  })

  test("leaves entries whose canonical does not match the overlay (still dirty)", () => {
    const patches = new Map<RowId, Map<ColumnId, unknown>>([
      [rowA, new Map([[colName, "Acme Co."]])],
    ])
    const entries = new Map<RowId, Map<ColumnId, BcCellEditEntry>>([
      [rowA, new Map([[colName, makeEntry()]])],
    ])
    const canonical = () => "Different Co." // canonical not yet caught up

    const result = pruneOverlayPatches(patches, entries, canonical)
    expect(result.changed).toBe(false)
    expect(patches.get(rowA)?.get(colName)).toBe("Acme Co.")
  })

  test("only clears matching column; other columns in the same row stay", () => {
    const patches = new Map<RowId, Map<ColumnId, unknown>>([
      [
        rowA,
        new Map<ColumnId, unknown>([
          [colName, "Acme Co."],
          [colTotal, 9999],
        ]),
      ],
    ])
    const entries = new Map<RowId, Map<ColumnId, BcCellEditEntry>>([
      [
        rowA,
        new Map<ColumnId, BcCellEditEntry>([
          [colName, makeEntry()],
          [colTotal, makeEntry()],
        ]),
      ],
    ])
    const canonical = (_rowId: RowId, columnId: ColumnId) => {
      if (columnId === colName) return "Acme Co." // caught up
      return 1234 // total still stale
    }

    const result = pruneOverlayPatches(patches, entries, canonical)
    expect(result).toEqual({ changed: true, cleared: 1 })
    expect(patches.get(rowA)?.has(colName)).toBe(false)
    expect(patches.get(rowA)?.get(colTotal)).toBe(9999)
    expect(entries.get(rowA)?.has(colName)).toBe(false)
  })

  test("idempotent: running twice with same canonical doesn't re-fire", () => {
    const patches = new Map<RowId, Map<ColumnId, unknown>>([
      [rowA, new Map([[colName, "Acme Co."]])],
    ])
    const entries = new Map<RowId, Map<ColumnId, BcCellEditEntry>>([
      [rowA, new Map([[colName, makeEntry()]])],
    ])
    const canonical = () => "Acme Co."

    expect(pruneOverlayPatches(patches, entries, canonical).changed).toBe(true)
    expect(pruneOverlayPatches(patches, entries, canonical).changed).toBe(false)
  })

  test("clears multiple rows in one pass", () => {
    const patches = new Map<RowId, Map<ColumnId, unknown>>([
      [rowA, new Map([[colName, "Acme Co."]])],
      [rowB, new Map([[colName, "Beta Ltd."]])],
    ])
    const entries = new Map<RowId, Map<ColumnId, BcCellEditEntry>>([
      [rowA, new Map([[colName, makeEntry()]])],
      [rowB, new Map([[colName, makeEntry()]])],
    ])
    const canonical = (rowId: RowId) =>
      rowId === rowA ? "Acme Co." : rowId === rowB ? "Beta Ltd." : undefined

    const result = pruneOverlayPatches(patches, entries, canonical)
    expect(result).toEqual({ changed: true, cleared: 2 })
    expect(patches.size).toBe(0)
    expect(entries.size).toBe(0)
  })
})

describe("summariseRowEditState — row aggregation for action column", () => {
  test("returns null when the row has no edits", () => {
    expect(summariseRowEditState(undefined)).toBeNull()
    expect(summariseRowEditState(new Map())).toBeNull()
  })

  test("pending=true if any cell in the row is pending", () => {
    const entries = new Map<ColumnId, BcCellEditEntry>([
      [colName, makeEntry()],
      [colTotal, makeEntry({ pending: true })],
    ])
    expect(summariseRowEditState(entries)).toEqual({ pending: true })
  })

  test("pending=false when no cell is in flight", () => {
    const entries = new Map<ColumnId, BcCellEditEntry>([[colName, makeEntry()]])
    expect(summariseRowEditState(entries)).toEqual({ pending: false })
  })

  test("error=first non-empty error encountered (insertion order)", () => {
    const entries = new Map<ColumnId, BcCellEditEntry>([
      [colName, makeEntry({ error: "Required" })],
      [colTotal, makeEntry({ error: "Out of range" })],
    ])
    expect(summariseRowEditState(entries)).toEqual({
      pending: false,
      error: "Required",
    })
  })

  test("error and pending coexist on the same row", () => {
    const entries = new Map<ColumnId, BcCellEditEntry>([
      [colName, makeEntry({ pending: true })],
      [colTotal, makeEntry({ error: "Server rejected" })],
    ])
    expect(summariseRowEditState(entries)).toEqual({
      pending: true,
      error: "Server rejected",
    })
  })
})

describe("discardRowOverlayEdits — multi-cell row rollback (audit P1-W3-3)", () => {
  test("drops every overlay patch + entry on the row when nothing is in flight", () => {
    const patches = new Map<RowId, Map<ColumnId, unknown>>([
      [
        rowA,
        new Map<ColumnId, unknown>([
          [colName, "Acme Co."],
          [colTotal, 9999],
        ]),
      ],
    ])
    const entries = new Map<RowId, Map<ColumnId, BcCellEditEntry>>([
      [
        rowA,
        new Map<ColumnId, BcCellEditEntry>([
          [colName, makeEntry()],
          [colTotal, makeEntry()],
        ]),
      ],
    ])

    const result = discardRowOverlayEdits(patches, entries, rowA)
    expect(result).toEqual({ discarded: 2 })
    expect(patches.has(rowA)).toBe(false)
    expect(entries.has(rowA)).toBe(false)
  })

  test("preserves pending entries (in-flight server commits) per editing-rfc §Concurrency", () => {
    // Discarding a pending entry would race the server's eventual
    // accept/reject — the overlay patch is the optimistic value the
    // server is settling against. Drop it now and the consumer's
    // upstream store would never see the rollback message.
    const patches = new Map<RowId, Map<ColumnId, unknown>>([
      [
        rowA,
        new Map<ColumnId, unknown>([
          [colName, "Acme Co."],
          [colTotal, 9999],
        ]),
      ],
    ])
    const entries = new Map<RowId, Map<ColumnId, BcCellEditEntry>>([
      [
        rowA,
        new Map<ColumnId, BcCellEditEntry>([
          [colName, makeEntry({ pending: true })],
          [colTotal, makeEntry()],
        ]),
      ],
    ])

    const result = discardRowOverlayEdits(patches, entries, rowA)
    expect(result).toEqual({ discarded: 1 })
    expect(patches.get(rowA)?.get(colName)).toBe("Acme Co.")
    expect(patches.get(rowA)?.has(colTotal)).toBe(false)
    expect(entries.get(rowA)?.get(colName)?.pending).toBe(true)
    expect(entries.get(rowA)?.has(colTotal)).toBe(false)
  })

  test("preserves error entries — surface stays for consumer dismissal", () => {
    // Discarding an errored entry would hide the failure. The user
    // must explicitly retry / clear via re-edit; row-discard is for
    // unsaved edits, not for clearing errored ones.
    const patches = new Map<RowId, Map<ColumnId, unknown>>([
      [rowA, new Map<ColumnId, unknown>([[colName, "Acme Co."]])],
    ])
    const entries = new Map<RowId, Map<ColumnId, BcCellEditEntry>>([
      [rowA, new Map([[colName, makeEntry({ error: "Server rejected" })]])],
    ])

    const result = discardRowOverlayEdits(patches, entries, rowA)
    expect(result).toEqual({ discarded: 0 })
    expect(patches.get(rowA)?.get(colName)).toBe("Acme Co.")
    expect(entries.get(rowA)?.get(colName)?.error).toBe("Server rejected")
  })

  test("returns 0 when the row has no overlay entries (no-op safe)", () => {
    const patches = new Map<RowId, Map<ColumnId, unknown>>()
    const entries = new Map<RowId, Map<ColumnId, BcCellEditEntry>>()

    expect(discardRowOverlayEdits(patches, entries, rowA)).toEqual({ discarded: 0 })
  })

  test("only touches the targeted row — other rows survive", () => {
    const patches = new Map<RowId, Map<ColumnId, unknown>>([
      [rowA, new Map([[colName, "Acme Co."]])],
      [rowB, new Map([[colName, "Beta Ltd."]])],
    ])
    const entries = new Map<RowId, Map<ColumnId, BcCellEditEntry>>([
      [rowA, new Map([[colName, makeEntry()]])],
      [rowB, new Map([[colName, makeEntry()]])],
    ])

    const result = discardRowOverlayEdits(patches, entries, rowA)
    expect(result).toEqual({ discarded: 1 })
    expect(patches.has(rowA)).toBe(false)
    expect(patches.get(rowB)?.get(colName)).toBe("Beta Ltd.")
    expect(entries.get(rowB)?.get(colName)).toBeDefined()
  })
})
