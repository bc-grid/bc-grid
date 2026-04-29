import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { loadPersistedState, persistState } from "../src/persistence"

const originalWindow = (globalThis as { window?: unknown }).window

function installLocalStorage(): Record<string, string> {
  const store: Record<string, string> = {}
  ;(globalThis as { window: object }).window = {
    localStorage: {
      getItem: (key: string) => (key in store ? (store[key] ?? null) : null),
      setItem: (key: string, value: string) => {
        store[key] = value
      },
      removeItem: (key: string) => {
        store[key] = undefined as unknown as string
      },
      clear: () => {
        for (const k of Object.keys(store)) {
          store[k] = undefined as unknown as string
        }
      },
      key: (index: number) => Object.keys(store)[index] ?? null,
      get length() {
        return Object.keys(store).length
      },
    },
  }
  return store
}

function clearWindow(): void {
  if (originalWindow === undefined) {
    ;(globalThis as { window?: unknown }).window = undefined
  } else {
    ;(globalThis as { window?: unknown }).window = originalWindow
  }
}

describe("loadPersistedState — gridId guard", () => {
  beforeEach(() => installLocalStorage())
  afterEach(clearWindow)

  test("returns the fallback when gridId is undefined (consumer opted out)", () => {
    expect(loadPersistedState(undefined, "columnState", [{ columnId: "x", width: 100 }])).toEqual([
      { columnId: "x", width: 100 },
    ])
  })
})

describe("loadPersistedState / persistState — round trip", () => {
  beforeEach(() => installLocalStorage())
  afterEach(clearWindow)

  test("persistState then loadPersistedState returns the same value", () => {
    const value = [
      { columnId: "name", width: 200 },
      { columnId: "balance", width: 120 },
    ]
    persistState("test-grid", "columnState", value)
    expect(loadPersistedState("test-grid", "columnState", [])).toEqual(value)
  })

  test("loadPersistedState returns fallback when key is empty", () => {
    expect(
      loadPersistedState("never-written", "columnState", [{ columnId: "x", width: 50 }]),
    ).toEqual([{ columnId: "x", width: 50 }])
  })

  test("loadPersistedState returns fallback when stored JSON is malformed", () => {
    // Manually write garbage.
    ;(
      globalThis as { window: { localStorage: { setItem: (k: string, v: string) => void } } }
    ).window.localStorage.setItem("bc-grid:test-grid:columnState", "{not-json")
    expect(loadPersistedState("test-grid", "columnState", [])).toEqual([])
  })

  test("loadPersistedState applies the type predicate when supplied", () => {
    persistState("test-grid", "columnState", { wrong: "shape" })
    const result = loadPersistedState(
      "test-grid",
      "columnState",
      [{ columnId: "fallback", width: 0 }],
      (parsed): parsed is readonly { columnId: string; width: number }[] => Array.isArray(parsed),
    )
    expect(result).toEqual([{ columnId: "fallback", width: 0 }])
  })

  test("storage keys are namespaced by gridId so two grids don't collide", () => {
    persistState("grid-a", "columnState", [{ columnId: "code", width: 100 }])
    persistState("grid-b", "columnState", [{ columnId: "code", width: 200 }])
    expect(loadPersistedState("grid-a", "columnState", [])).toEqual([
      { columnId: "code", width: 100 },
    ])
    expect(loadPersistedState("grid-b", "columnState", [])).toEqual([
      { columnId: "code", width: 200 },
    ])
  })
})

describe("persistence — SSR safety", () => {
  afterEach(clearWindow)

  test("loadPersistedState returns fallback when window is undefined (SSR)", () => {
    ;(globalThis as { window?: unknown }).window = undefined
    expect(loadPersistedState("any", "columnState", "fallback")).toBe("fallback")
  })

  test("persistState is a no-op when window is undefined (SSR)", () => {
    ;(globalThis as { window?: unknown }).window = undefined
    // Should not throw.
    expect(() => persistState("any", "columnState", { x: 1 })).not.toThrow()
  })
})
