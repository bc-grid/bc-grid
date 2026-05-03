import { describe, expect, test } from "bun:test"
import { resolveColumns } from "../src/gridInternals"
import type { BcReactGridColumn } from "../src/types"

type Row = { id: string }

const col = (
  columnId: string,
  partial: Partial<BcReactGridColumn<Row>> = {},
): BcReactGridColumn<Row> => ({
  columnId,
  field: columnId,
  ...partial,
})

describe("resolveColumns flex distribution", () => {
  test("returns explicit widths (or DEFAULT_COL_WIDTH for flex columns) when availableWidth is omitted", () => {
    const cols = [col("a", { width: 100 }), col("b", { flex: 1 }), col("c", { width: 80 })]
    const resolved = resolveColumns(cols, [])
    expect(resolved.map((c) => c.width)).toEqual([100, 120, 80])
  })

  test("returns explicit widths when no column declares flex", () => {
    const cols = [col("a", { width: 100 }), col("b", { width: 200 }), col("c", { width: 80 })]
    const resolved = resolveColumns(cols, [], 1000)
    expect(resolved.map((c) => c.width)).toEqual([100, 200, 80])
  })

  test("flex columns share the spare width proportionally", () => {
    const cols = [col("fixed", { width: 100 }), col("a", { flex: 1 }), col("b", { flex: 3 })]
    const resolved = resolveColumns(cols, [], 500)
    expect(resolved[0]?.width).toBe(100)
    expect(resolved[1]?.width).toBe(100)
    expect(resolved[2]?.width).toBe(300)
    expect(resolved[2]?.left).toBe(200)
  })

  test("flex columns honour minWidth, releasing the remainder to siblings", () => {
    const cols = [
      col("fixed", { width: 100 }),
      col("narrow", { flex: 1, minWidth: 200 }),
      col("wide", { flex: 1 }),
    ]
    const resolved = resolveColumns(cols, [], 500)
    expect(resolved[0]?.width).toBe(100)
    expect(resolved[1]?.width).toBe(200)
    expect(resolved[2]?.width).toBe(200)
  })

  test("flex columns honour maxWidth, releasing the remainder to siblings", () => {
    const cols = [
      col("fixed", { width: 100 }),
      col("capped", { flex: 3, maxWidth: 150 }),
      col("greedy", { flex: 1 }),
    ]
    const resolved = resolveColumns(cols, [], 500)
    expect(resolved[1]?.width).toBe(150)
    expect(resolved[2]?.width).toBe(250)
  })

  test("under-fill: total fixed width equals or exceeds available width — flex columns shrink to minWidth", () => {
    const cols = [col("fixed", { width: 400 }), col("flex", { flex: 1, minWidth: 200 })]
    const resolved = resolveColumns(cols, [], 500)
    expect(resolved[0]?.width).toBe(400)
    expect(resolved[1]?.width).toBe(200)
  })

  test("nested grid scenario: bsncraft contacts column defs at 1320px panel width", () => {
    const cols = [
      col("sequence", { width: 70 }),
      col("name", { flex: 1.5, minWidth: 180 }),
      col("phone", { width: 140 }),
      col("mobile", { width: 140 }),
      col("email", { flex: 1, minWidth: 200 }),
      col("contactType", { width: 90 }),
    ]
    const resolved = resolveColumns(cols, [], 1320)
    const fixedSum = 70 + 140 + 140 + 90
    expect(fixedSum).toBe(440)
    const totalFlex = resolved.reduce((sum, c) => sum + c.width, 0)
    expect(totalFlex).toBe(1320)
    const name = resolved.find((c) => c.columnId === "name")
    const email = resolved.find((c) => c.columnId === "email")
    expect(name).toBeDefined()
    expect(email).toBeDefined()
    if (!name || !email) return
    expect(name.width).toBeGreaterThanOrEqual(180)
    expect(email.width).toBeGreaterThanOrEqual(200)
    expect(name.width / email.width).toBeCloseTo(1.5, 1)
  })

  test("availableWidth of 0 is ignored (no flex applied — falls through to DEFAULT_COL_WIDTH)", () => {
    const cols = [col("a", { flex: 1 }), col("b", { flex: 1 })]
    const zeroResolved = resolveColumns(cols, [], 0)
    expect(zeroResolved[0]?.width).toBe(120)
    expect(zeroResolved[1]?.width).toBe(120)
  })

  test("flex distribution recomputes column.left from the new widths", () => {
    const cols = [col("a", { flex: 1 }), col("b", { flex: 2 })]
    const resolved = resolveColumns(cols, [], 600)
    expect(resolved[0]?.left).toBe(0)
    expect(resolved[0]?.width).toBe(200)
    expect(resolved[1]?.left).toBe(200)
    expect(resolved[1]?.width).toBe(400)
  })

  test("columnState.flex overrides column.flex when both are set", () => {
    const cols = [col("a", { flex: 1 }), col("b", { flex: 1 })]
    const resolved = resolveColumns(cols, [{ columnId: "a", flex: 3 }], 800)
    expect(resolved[0]?.width).toBe(600)
    expect(resolved[1]?.width).toBe(200)
  })

  test("columnState.flex null clears column.flex and preserves committed width", () => {
    const cols = [col("name", { flex: 2 }), col("address", { flex: 1 })]
    const resolved = resolveColumns(cols, [{ columnId: "name", flex: null, width: 200 }], 800)

    expect(resolved[0]?.flex).toBeUndefined()
    expect(resolved[0]?.width).toBe(200)
    expect(resolved[1]?.flex).toBe(1)
    expect(resolved[1]?.width).toBe(600)
  })
})
