import { describe, expect, test } from "bun:test"
import {
  editorAccessibleName,
  editorOptionToString,
  findOptionIndexBySeed,
  resolveEditorOptions,
  resolveSelectEditorState,
} from "../src/chrome"

const options = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: 3, label: "Escalated" },
]

describe("select-style editor helpers", () => {
  test("uses column header, field, then columnId for an accessible name", () => {
    expect(editorAccessibleName({ header: "Status", field: "status" }, "Select value")).toBe(
      "Status",
    )
    expect(editorAccessibleName({ header: null, field: "status" }, "Select value")).toBe("status")
    expect(editorAccessibleName({ columnId: "status-col" }, "Select value")).toBe("status-col")
    expect(editorAccessibleName({}, "Select value")).toBe("Select value")
  })

  test("resolves flat and row-scoped options without crashing bad row functions", () => {
    expect(resolveEditorOptions(options, {})).toEqual(options)
    expect(
      resolveEditorOptions((row: { locked: boolean }) => (row.locked ? [options[1]] : options), {
        locked: true,
      }),
    ).toEqual([options[1]])
    expect(
      resolveEditorOptions(() => {
        throw new Error("bad options")
      }, {}),
    ).toEqual([])
  })

  test("normalizes missing option labels from the typed option value", () => {
    expect(
      resolveEditorOptions(
        [{ value: 7 }, { value: { id: "owner-1" } }, { value: "closed", label: "Closed" }],
        {},
      ),
    ).toEqual([
      { value: 7, label: "7" },
      { value: { id: "owner-1" }, label: '{"id":"owner-1"}' },
      { value: "closed", label: "Closed" },
    ])
  })

  test("stringifies option values for native option attributes", () => {
    expect(editorOptionToString(null)).toBe("")
    expect(editorOptionToString("open")).toBe("open")
    expect(editorOptionToString(3)).toBe("3")
    expect(editorOptionToString({ id: 1 })).toBe('{"id":1}')
  })

  test("finds seed matches by option label or value prefix", () => {
    expect(findOptionIndexBySeed(options, "c")).toBe(1)
    expect(findOptionIndexBySeed(options, "3")).toBe(2)
    expect(findOptionIndexBySeed(options, "x")).toBe(-1)
    expect(findOptionIndexBySeed(options, "cl")).toBe(-1)
  })

  test("printable seed selects the first matching native select option", () => {
    const state = resolveSelectEditorState({
      initialValue: "open",
      options,
      seedKey: "c",
    })

    expect(state.defaultValue).toBe("closed")
    expect(state.hasSelectedOption).toBe(true)
    expect(state.seedMatched).toBe(true)
    expect(state.selectOptionValues).toEqual(["open", "closed", 3])
  })

  test("missing initial value keeps the placeholder mapped to undefined", () => {
    const state = resolveSelectEditorState({
      initialValue: "missing",
      options,
      seedKey: undefined,
    })

    expect(state.defaultValue).toBe("")
    expect(state.hasSelectedOption).toBe(false)
    expect(state.seedMatched).toBe(false)
    expect(state.selectOptionValues).toEqual([undefined, "open", "closed", 3])
  })
})
