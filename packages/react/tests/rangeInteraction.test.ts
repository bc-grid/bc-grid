import { describe, expect, test } from "bun:test"
import type { BcRangeSelection, ColumnId, RowId } from "@bc-grid/core"
import {
  createRangeInteractionModel,
  shouldClearRangeSelectionForModelChange,
} from "../src/rangeInteraction"

const selection: BcRangeSelection = {
  ranges: [
    {
      start: { rowId: "r1" as RowId, columnId: "name" as ColumnId },
      end: { rowId: "r2" as RowId, columnId: "amount" as ColumnId },
    },
  ],
  anchor: { rowId: "r1" as RowId, columnId: "name" as ColumnId },
}

const emptySelection: BcRangeSelection = { ranges: [], anchor: null }

function model(rowIds: readonly string[], columnIds: readonly string[]) {
  return createRangeInteractionModel(
    rowIds.map((rowId) => rowId as RowId),
    columnIds.map((columnId) => ({ columnId: columnId as ColumnId })),
  )
}

describe("range interaction model hardening", () => {
  test("does not clear on initial mount or empty selection", () => {
    const current = model(["r1", "r2"], ["name", "amount"])

    expect(shouldClearRangeSelectionForModelChange(selection, null, current)).toBe(false)
    expect(
      shouldClearRangeSelectionForModelChange(emptySelection, current, model(["r2"], ["name"])),
    ).toBe(false)
  })

  test("keeps range state when row and column order are unchanged", () => {
    expect(
      shouldClearRangeSelectionForModelChange(
        selection,
        model(["r1", "r2"], ["name", "amount"]),
        model(["r1", "r2"], ["name", "amount"]),
      ),
    ).toBe(false)
  })

  test("clears active ranges when sorting reorders visible rows", () => {
    expect(
      shouldClearRangeSelectionForModelChange(
        selection,
        model(["r1", "r2", "r3"], ["name", "amount"]),
        model(["r3", "r2", "r1"], ["name", "amount"]),
      ),
    ).toBe(true)
  })

  test("clears active ranges when filtering or data changes remove visible rows", () => {
    expect(
      shouldClearRangeSelectionForModelChange(
        selection,
        model(["r1", "r2", "r3"], ["name", "amount"]),
        model(["r1", "r3"], ["name", "amount"]),
      ),
    ).toBe(true)
  })

  test("clears active ranges when visible column order changes", () => {
    expect(
      shouldClearRangeSelectionForModelChange(
        selection,
        model(["r1", "r2"], ["name", "amount"]),
        model(["r1", "r2"], ["amount", "name"]),
      ),
    ).toBe(true)
  })
})
