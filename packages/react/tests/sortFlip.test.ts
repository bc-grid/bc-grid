import { describe, expect, test } from "bun:test"
import type { RowId } from "@bc-grid/core"
import { type RowFlipSnapshot, resolveStableRowFlipCandidates } from "../src/gridInternals"

describe("sort FLIP stability helpers", () => {
  test("plans translate-only row movement when visible row identity and size are stable", () => {
    const plan = resolveStableRowFlipCandidates(
      captured([
        ["r1", 0],
        ["r2", 40],
        ["r3", 80],
      ]),
      [snapshot("r3", 0, 0), snapshot("r1", 1, 40), snapshot("r2", 2, 80)],
    )

    expect(plan.status).toBe("animate")
    if (plan.status !== "animate") throw new Error(plan.reason)
    expect(plan.candidates.map((candidate) => [candidate.rowId, candidate.rowIndex])).toEqual([
      ["r3", 0],
      ["r1", 1],
      ["r2", 2],
    ])
    expect(
      plan.candidates.every((candidate) => candidate.first.height === candidate.last.height),
    ).toBe(true)
  })

  test("returns an empty animation plan when rows did not move", () => {
    const plan = resolveStableRowFlipCandidates(
      captured([
        ["r1", 0],
        ["r2", 40],
      ]),
      [snapshot("r1", 0, 0), snapshot("r2", 1, 40)],
    )

    expect(plan).toEqual({ status: "animate", candidates: [] })
  })

  test("skips when virtualization changes the visible row count or identity", () => {
    expect(
      resolveStableRowFlipCandidates(captured([["r1", 0]]), [
        snapshot("r1", 0, 0),
        snapshot("r2", 1, 40),
      ]),
    ).toEqual({ status: "skip", reason: "row-count-changed" })

    expect(
      resolveStableRowFlipCandidates(
        captured([
          ["r1", 0],
          ["r2", 40],
        ]),
        [snapshot("r1", 0, 40), snapshot("r3", 1, 0)],
      ),
    ).toEqual({ status: "skip", reason: "missing-current-row" })
  })

  test("skips duplicate rows and invalid row indexes", () => {
    expect(
      resolveStableRowFlipCandidates(
        captured([
          ["r1", 0],
          ["r2", 40],
        ]),
        [snapshot("r1", 0, 0), snapshot("r1", 1, 40)],
      ),
    ).toEqual({ status: "skip", reason: "duplicate-current-row" })

    expect(
      resolveStableRowFlipCandidates(captured([["r1", 0]]), [snapshot("r1", Number.NaN, 0)]),
    ).toEqual({ status: "skip", reason: "invalid-row-index" })
  })

  test("skips row size changes so sort FLIP never scales text or row height", () => {
    const plan = resolveStableRowFlipCandidates(captured([["r1", 0]]), [
      snapshot("r1", 0, 40, { height: 48 }),
    ])

    expect(plan).toEqual({ status: "skip", reason: "row-size-changed" })
  })

  test("skips stale captures that moved outside the current visible window", () => {
    expect(
      resolveStableRowFlipCandidates(captured([["r1", -400]]), [snapshot("r1", 0, 0)]),
    ).toEqual({ status: "skip", reason: "row-moved-outside-visible-window" })

    expect(
      resolveStableRowFlipCandidates(captured([["r1", 0]], { left: 80 }), [snapshot("r1", 0, 40)]),
    ).toEqual({ status: "skip", reason: "row-moved-outside-visible-window" })
  })
})

function captured(
  rows: readonly (readonly [string, number])[],
  rectOverrides: Partial<RectOptions> = {},
): Map<RowId, RectOptions> {
  return new Map(rows.map(([rowId, top]) => [rowId as RowId, rect(top, rectOverrides)]))
}

function snapshot(
  rowId: string,
  rowIndex: number,
  top: number,
  rectOverrides: Partial<RectOptions> = {},
): RowFlipSnapshot {
  return { rowId: rowId as RowId, rowIndex, rect: rect(top, rectOverrides) }
}

interface RectOptions {
  top: number
  left: number
  width: number
  height: number
}

function rect(top: number, overrides: Partial<RectOptions> = {}): RectOptions {
  return {
    top,
    left: overrides.left ?? 0,
    width: overrides.width ?? 320,
    height: overrides.height ?? 40,
  }
}
