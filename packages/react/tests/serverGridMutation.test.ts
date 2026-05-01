import { describe, expect, test } from "bun:test"
import type { BcCellEditCommitEvent, BcReactGridColumn } from "../src"
import {
  createDefaultServerEditMutationPatch,
  createServerEditMutationError,
} from "../src/serverGrid"

interface Row {
  id: string
  name: string
}

const nameColumn: BcReactGridColumn<Row, string> = {
  columnId: "name",
  field: "name",
  header: "Name",
}

const editEvent: BcCellEditCommitEvent<Row, string> = {
  column: nameColumn,
  columnId: "name",
  nextValue: "Acme Co.",
  previousValue: "Acme Inc.",
  row: { id: "customer-1", name: "Acme Inc." },
  rowId: "customer-1",
  source: "keyboard",
}

describe("server edit mutation helpers", () => {
  test("builds the default ServerRowPatch from a cell edit commit", () => {
    expect(createDefaultServerEditMutationPatch(editEvent, "mutation-1")).toEqual({
      changes: { name: "Acme Co." },
      mutationId: "mutation-1",
      rowId: "customer-1",
    })
  })

  test("uses server rejection reasons as edit errors", () => {
    expect(
      createServerEditMutationError({
        mutationId: "mutation-1",
        reason: "Name is required.",
        status: "rejected",
      }).message,
    ).toBe("Name is required.")
  })

  test("provides a conflict fallback edit error", () => {
    expect(
      createServerEditMutationError({
        mutationId: "mutation-1",
        status: "conflict",
      }).message,
    ).toBe("Server reported an edit conflict.")
  })
})
