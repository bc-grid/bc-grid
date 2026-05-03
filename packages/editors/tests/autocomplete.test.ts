import { describe, expect, test } from "bun:test"
import type { BcCellEditorPrepareParams, BcReactGridColumn } from "@bc-grid/react"
import {
  type AutocompleteFetchOptions,
  autocompleteEditor,
  createAutocompleteRequestController,
} from "../src/autocomplete"
import type { EditorOption } from "../src/chrome"

interface VendorRow {
  id: string
}

describe("autocomplete editor request controller", () => {
  test("aborts superseded lookups and ignores stale results", async () => {
    const first = deferred<readonly EditorOption[]>()
    const second = deferred<readonly EditorOption[]>()
    const calls: Array<{ query: string; signal: AbortSignal }> = []
    const loading: boolean[] = []
    const appliedOptions: Array<readonly EditorOption[]> = []
    const fetchOptions: AutocompleteFetchOptions = (query, signal) => {
      calls.push({ query, signal })
      return query === "a" ? first.promise : second.promise
    }

    const controller = createAutocompleteRequestController({
      fetchOptions,
      setLoading: (next) => loading.push(next),
      setOptions: (next) => appliedOptions.push(next),
    })

    const firstSignal = controller.request("a")
    const secondSignal = controller.request("b")

    expect(firstSignal?.aborted).toBe(true)
    expect(secondSignal?.aborted).toBe(false)
    expect(calls.map((call) => call.query)).toEqual(["a", "b"])

    first.resolve([{ value: "a", label: "Alpha" }])
    await flushMicrotasks()

    expect(appliedOptions).toEqual([])
    expect(loading).toEqual([true, true])

    second.resolve([{ value: "b", label: "Beta" }])
    await flushMicrotasks()

    expect(appliedOptions).toEqual([[{ value: "b", label: "Beta" }]])
    expect(loading[loading.length - 1]).toBe(false)
  })

  test("abort prevents late results from replacing the current option list", async () => {
    const lookup = deferred<readonly EditorOption[]>()
    const appliedOptions: Array<readonly EditorOption[]> = []
    const controller = createAutocompleteRequestController({
      fetchOptions: () => lookup.promise,
      setLoading: () => {},
      setOptions: (next) => appliedOptions.push(next),
    })

    const signal = controller.request("alpha")
    controller.abort()
    lookup.resolve([{ value: "alpha", label: "Alpha" }])
    await flushMicrotasks()

    expect(signal?.aborted).toBe(true)
    expect(appliedOptions).toEqual([])
  })

  test("failed lookups leave options unchanged and clear pending state", async () => {
    const loading: boolean[] = []
    const appliedOptions: Array<readonly EditorOption[]> = []
    const controller = createAutocompleteRequestController({
      fetchOptions: async () => {
        throw new Error("lookup failed")
      },
      setLoading: (next) => loading.push(next),
      setOptions: (next) => appliedOptions.push(next),
    })

    controller.request("bad")
    await flushMicrotasks()

    expect(appliedOptions).toEqual([])
    expect(loading).toEqual([true, false])
  })

  test("missing fetchOptions clears stale options and pending state", () => {
    const loading: boolean[] = []
    const appliedOptions: Array<readonly EditorOption[]> = []
    const controller = createAutocompleteRequestController({
      fetchOptions: undefined,
      setLoading: (next) => loading.push(next),
      setOptions: (next) => appliedOptions.push(next),
    })

    const signal = controller.request("alpha")

    expect(signal).toBeNull()
    expect(appliedOptions).toEqual([[]])
    expect(loading).toEqual([false])
  })
})

describe("autocompleteEditor.prepare — first-page preload (audit P1-W3-2)", () => {
  // The prepare hook calls `column.fetchOptions("", signal)` once at
  // activation so the SearchCombobox dropdown paints with options on
  // first frame instead of rendering blank "Loading…" until the user
  // types. The result is a `{ initialOptions }` envelope that
  // SearchCombobox consumes via `props.initialOptions`.

  function makeColumn(
    fetchOptions?: AutocompleteFetchOptions,
  ): BcReactGridColumn<VendorRow, unknown> {
    return {
      columnId: "vendor",
      header: "Vendor",
      ...(fetchOptions ? { fetchOptions } : {}),
    } as unknown as BcReactGridColumn<VendorRow, unknown>
  }

  function makeParams(
    column: BcReactGridColumn<VendorRow, unknown>,
  ): BcCellEditorPrepareParams<VendorRow> {
    return {
      row: { id: "row-1" },
      rowId: "row-1" as never,
      columnId: "vendor" as never,
      column,
    }
  }

  test("preloads via column.fetchOptions and returns { initialOptions }", async () => {
    const calls: Array<{ query: string }> = []
    const column = makeColumn(async (query) => {
      calls.push({ query })
      return [
        { value: "v1", label: "Acme Co." },
        { value: "v2", label: "Beta Ltd." },
      ]
    })

    expect(autocompleteEditor.prepare).toBeDefined()
    const result = await autocompleteEditor.prepare?.(makeParams(column) as never)

    // Empty-string query is the convention for "first page" / "give
    // me whatever you'd show before any user input." It mirrors what
    // the SearchCombobox would otherwise dispatch on first paint when
    // `initialOptions` is omitted.
    expect(calls).toEqual([{ query: "" }])
    expect(result).toEqual({
      initialOptions: [
        { value: "v1", label: "Acme Co." },
        { value: "v2", label: "Beta Ltd." },
      ],
    })
  })

  test("resolves to undefined when the column has no fetchOptions", async () => {
    // Pure-`column.options` autocomplete columns don't need a preload
    // — SearchCombobox's existing static-option path covers them. The
    // editor portal forwards `prepareResult: undefined` and the
    // Component falls through to its existing wiring.
    const result = await autocompleteEditor.prepare?.(makeParams(makeColumn()) as never)
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

    await expect(autocompleteEditor.prepare?.(makeParams(column) as never)).rejects.toThrow(
      "offline",
    )
  })
})

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}
