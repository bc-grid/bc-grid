import { describe, expect, test } from "bun:test"
import { parseTsvClipboard } from "../src"

describe("@bc-grid/core TSV clipboard parser", () => {
  test("parses a simple row/column matrix", () => {
    expect(parseTsvClipboard("A\tB\nC\tD")).toEqual({
      cells: [
        ["A", "B"],
        ["C", "D"],
      ],
      diagnostics: [],
    })
  })

  test("supports CR row delimiters from legacy clipboard payloads", () => {
    expect(parseTsvClipboard("A\tB\rC\tD").cells).toEqual([
      ["A", "B"],
      ["C", "D"],
    ])
  })

  test("preserves quoted tabs, newlines, and doubled quotes", () => {
    const parsed = parseTsvClipboard('"A\tB"\t"C\nD"\r\n"E ""quote"""\tF')

    expect(parsed.cells).toEqual([
      ["A\tB", "C\nD"],
      ['E "quote"', "F"],
    ])
    expect(parsed.diagnostics).toEqual([])
  })

  test("preserves empty cells and ragged row shapes", () => {
    expect(parseTsvClipboard("A\t\tC\n\tB\t").cells).toEqual([
      ["A", "", "C"],
      ["", "B", ""],
    ])
  })

  test("keeps trailing tabs but drops the final row created only by a trailing newline", () => {
    expect(parseTsvClipboard("A\tB\t\nC\tD\n").cells).toEqual([
      ["A", "B", ""],
      ["C", "D"],
    ])
  })

  test("keeps intentional blank rows between row delimiters", () => {
    expect(parseTsvClipboard("A\n\nB").cells).toEqual([["A"], [""], ["B"]])
  })

  test("treats empty clipboard text as a single empty cell", () => {
    expect(parseTsvClipboard("")).toEqual({ cells: [[""]], diagnostics: [] })
  })

  test("reports unterminated quoted cells without throwing", () => {
    const parsed = parseTsvClipboard('"A\tB\nC')

    expect(parsed.cells).toEqual([["A\tB\nC"]])
    expect(parsed.diagnostics).toEqual([
      {
        code: "unterminated-quoted-cell",
        rowIndex: 0,
        columnIndex: 0,
        charIndex: 6,
      },
    ])
  })

  test("reports unexpected quotes in unquoted cells and keeps parsing", () => {
    const parsed = parseTsvClipboard('A"B\tC')

    expect(parsed.cells).toEqual([['A"B', "C"]])
    expect(parsed.diagnostics).toEqual([
      {
        code: "unexpected-quote",
        rowIndex: 0,
        columnIndex: 0,
        charIndex: 1,
      },
    ])
  })

  test("reports characters after closing quotes and keeps the best-effort value", () => {
    const parsed = parseTsvClipboard('"A"x\tB')

    expect(parsed.cells).toEqual([["Ax", "B"]])
    expect(parsed.diagnostics).toEqual([
      {
        code: "unexpected-character-after-closing-quote",
        rowIndex: 0,
        columnIndex: 0,
        charIndex: 3,
      },
    ])
  })
})
