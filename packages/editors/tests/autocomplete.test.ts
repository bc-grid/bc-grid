import { describe, expect, test } from "bun:test"
import {
  createAutocompleteRequestController,
  type AutocompleteFetchOptions,
} from "../src/autocomplete"
import type { EditorOption } from "../src/chrome"

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
