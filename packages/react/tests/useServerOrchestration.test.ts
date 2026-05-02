import { describe, expect, test } from "bun:test"
import {
  buildOptimisticEditPatch,
  createServerLoadAbortError,
  isLoadAborted,
} from "../src/internal/useServerOrchestration"

describe("buildOptimisticEditPatch (shared)", () => {
  test("formats mutationId as <prefix>:<sequence>", () => {
    expect(
      buildOptimisticEditPatch({
        rowId: "row-1",
        changes: { name: "Acme" },
        prefix: "useServerPagedGrid",
        sequence: 7,
      }),
    ).toEqual({
      mutationId: "useServerPagedGrid:7",
      rowId: "row-1",
      changes: { name: "Acme" },
    })
  })

  test("supports any prefix so each hook scopes its own mutation IDs", () => {
    expect(
      buildOptimisticEditPatch({
        rowId: "row-2",
        changes: { status: "paid" },
        prefix: "useServerInfiniteGrid",
        sequence: 1,
      }).mutationId,
    ).toBe("useServerInfiniteGrid:1")
    expect(
      buildOptimisticEditPatch({
        rowId: "row-3",
        changes: { count: 1 },
        prefix: "useServerTreeGrid",
        sequence: 1,
      }).mutationId,
    ).toBe("useServerTreeGrid:1")
  })

  test("preserves multi-column changes intact", () => {
    const patch = buildOptimisticEditPatch({
      rowId: "row-4",
      changes: { name: "Beta", status: "active", balance: 1234.56 },
      prefix: "useServerPagedGrid",
      sequence: 0,
    })
    expect(patch.changes).toEqual({ name: "Beta", status: "active", balance: 1234.56 })
  })
})

describe("isLoadAborted", () => {
  test("returns true when the signal is aborted", () => {
    const controller = new AbortController()
    controller.abort()
    expect(isLoadAborted(controller.signal)).toBe(true)
  })

  test("returns false when the signal exists but has not aborted", () => {
    const controller = new AbortController()
    expect(isLoadAborted(controller.signal)).toBe(false)
  })

  test("returns false when no signal is supplied", () => {
    expect(isLoadAborted(undefined)).toBe(false)
  })
})

describe("createServerLoadAbortError", () => {
  test("returns an Error whose name is AbortError so the model layer's isAbortError predicate matches it", () => {
    const error = createServerLoadAbortError()
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe("AbortError")
    expect(error.message).toBe("Aborted")
  })
})
