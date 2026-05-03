import { describe, expect, test } from "bun:test"
import type { BcCellEditorPrepareParams, BcReactGridColumn } from "@bc-grid/react"
import {
  type EditorOption,
  editorAccessibleName,
  editorOptionToString,
  findOptionIndexBySeed,
  resolveEditorOptions,
  resolveSelectEditorState,
} from "../src/chrome"
import { selectEditor } from "../src/select"

interface OptionRow {
  id: string
}

type FetchOptions = (query: string, signal: AbortSignal) => Promise<readonly EditorOption[]>

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

  test("preserves swatch and icon-presence on resolved options (audit P0-4)", () => {
    // EditorOption.swatch carries a CSS color string; the Combobox
    // primitive renders it as a 16×16 chip beside the label. icon is
    // a ReactNode escape hatch (status pill, avatar, etc.). The
    // resolver passes both through verbatim — no validation, no
    // coercion — so consumer customisation survives.
    const swatchOption = { value: "antique-walnut", label: "Antique Walnut", swatch: "#5C3A21" }
    const iconNode = { type: "span", props: { children: "★" } }
    const iconOption = { value: "vip", label: "VIP", icon: iconNode }

    const resolved = resolveEditorOptions(
      [swatchOption, iconOption, { value: "plain", label: "Plain" }],
      {},
    )

    expect(resolved[0]).toEqual(swatchOption)
    expect(resolved[1]).toEqual(iconOption)
    expect(resolved[2]).toEqual({ value: "plain", label: "Plain" })
  })

  test("drops empty / non-string swatches without leaking them to the option", () => {
    const resolved = resolveEditorOptions(
      [
        { value: "a", label: "A", swatch: "" },
        { value: "b", label: "B", swatch: 5 },
        { value: "c", label: "C", swatch: null },
      ],
      {},
    )

    for (const opt of resolved) {
      expect(opt.swatch).toBeUndefined()
    }
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

describe("selectEditor.prepare — first-page preload (v06-prepareresult-preload-select-multi)", () => {
  // Mirrors the autocomplete editor's prepare hook (#403). The hook
  // calls `column.fetchOptions("", signal)` once at activation so the
  // Combobox dropdown paints with async-loaded options on first frame
  // instead of forcing consumers to roll a custom `cellEditor` for
  // remote enums. The Component reads the result via
  // `prepareResult.initialOptions` and falls through to
  // `column.options` when the column has no `fetchOptions`.

  function makeColumn(fetchOptions?: FetchOptions): BcReactGridColumn<OptionRow, unknown> {
    return {
      columnId: "status",
      header: "Status",
      ...(fetchOptions ? { fetchOptions } : {}),
    } as unknown as BcReactGridColumn<OptionRow, unknown>
  }

  function makeParams(
    column: BcReactGridColumn<OptionRow, unknown>,
  ): BcCellEditorPrepareParams<OptionRow> {
    return {
      row: { id: "row-1" },
      rowId: "row-1" as never,
      columnId: "status" as never,
      column,
    }
  }

  test("preloads via column.fetchOptions and returns { initialOptions }", async () => {
    const calls: Array<{ query: string }> = []
    const column = makeColumn(async (query) => {
      calls.push({ query })
      return [
        { value: "open", label: "Open" },
        { value: "closed", label: "Closed" },
      ]
    })

    expect(selectEditor.prepare).toBeDefined()
    const result = await selectEditor.prepare?.(makeParams(column) as never)

    expect(calls).toEqual([{ query: "" }])
    expect(result).toEqual({
      initialOptions: [
        { value: "open", label: "Open" },
        { value: "closed", label: "Closed" },
      ],
    })
  })

  test("resolves to undefined when the column has no fetchOptions", async () => {
    // Static-`column.options` columns don't need a preload; the
    // framework forwards `prepareResult: undefined` and the Component
    // resolves options synchronously via `resolveEditorOptions`.
    const result = await selectEditor.prepare?.(makeParams(makeColumn()) as never)
    expect(result).toBeUndefined()
  })

  test("propagates fetchOptions rejection so the framework's graceful path can mount", async () => {
    // fetchOptions throwing must reject the prepare Promise — the
    // framework's prepareRejected path then mounts the editor with
    // `prepareResult: undefined` (audit P1-W3-2 graceful degradation,
    // pinned in editingStateMachine.test.ts). The editor still works;
    // the user just doesn't get the preload.
    const column = makeColumn(async () => {
      throw new Error("offline")
    })

    await expect(selectEditor.prepare?.(makeParams(column) as never)).rejects.toThrow("offline")
  })
})
