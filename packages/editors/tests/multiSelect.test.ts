import { describe, expect, test } from "bun:test"
import type { BcCellEditorPrepareParams, BcReactGridColumn } from "@bc-grid/react"
import type { EditorOption } from "../src/chrome"
import { multiSelectEditor } from "../src/multiSelect"

interface OptionRow {
  id: string
}

type FetchOptions = (query: string, signal: AbortSignal) => Promise<readonly EditorOption[]>

describe("multiSelectEditor.prepare — first-page preload (v06-prepareresult-preload-select-multi)", () => {
  // Mirrors `selectEditor.prepare` and the autocomplete editor's
  // prepare hook (#403). The hook calls `column.fetchOptions("",
  // signal)` once at activation so the multi-select Combobox dropdown
  // paints with async-loaded options on first frame. The Component
  // reads the result via `prepareResult.initialOptions` and falls
  // through to `column.options` when the column has no `fetchOptions`.

  function makeColumn(fetchOptions?: FetchOptions): BcReactGridColumn<OptionRow, unknown> {
    return {
      columnId: "tags",
      header: "Tags",
      ...(fetchOptions ? { fetchOptions } : {}),
    } as unknown as BcReactGridColumn<OptionRow, unknown>
  }

  function makeParams(
    column: BcReactGridColumn<OptionRow, unknown>,
  ): BcCellEditorPrepareParams<OptionRow> {
    return {
      row: { id: "row-1" },
      rowId: "row-1" as never,
      columnId: "tags" as never,
      column,
    }
  }

  test("preloads via column.fetchOptions and returns { initialOptions }", async () => {
    const calls: Array<{ query: string }> = []
    const column = makeColumn(async (query) => {
      calls.push({ query })
      return [
        { value: "red", label: "Red" },
        { value: "blue", label: "Blue" },
        { value: "green", label: "Green" },
      ]
    })

    expect(multiSelectEditor.prepare).toBeDefined()
    const result = await multiSelectEditor.prepare?.(makeParams(column) as never)

    expect(calls).toEqual([{ query: "" }])
    expect(result).toEqual({
      initialOptions: [
        { value: "red", label: "Red" },
        { value: "blue", label: "Blue" },
        { value: "green", label: "Green" },
      ],
    })
  })

  test("resolves to undefined when the column has no fetchOptions", async () => {
    const result = await multiSelectEditor.prepare?.(makeParams(makeColumn()) as never)
    expect(result).toBeUndefined()
  })

  test("propagates fetchOptions rejection so the framework's graceful path can mount", async () => {
    // The framework's prepareRejected path mounts the editor with
    // `prepareResult: undefined` so the multi-select still works
    // without the preload — this test pins the rejection bubbles up.
    const column = makeColumn(async () => {
      throw new Error("offline")
    })

    await expect(multiSelectEditor.prepare?.(makeParams(column) as never)).rejects.toThrow(
      "offline",
    )
  })
})
