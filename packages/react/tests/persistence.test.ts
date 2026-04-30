import { describe, expect, test } from "bun:test"
import {
  type HistoryLike,
  type LocationLike,
  type StorageLike,
  gridStorageKey,
  readPersistedGridState,
  readUrlPersistedGridState,
  writePersistedGridState,
  writeUrlPersistedGridState,
} from "../src/persistence"

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

describe("grid state persistence", () => {
  test("uses the documented per-state localStorage key convention", () => {
    expect(gridStorageKey("accounts-receivable.customers", "columnState")).toBe(
      "bc-grid:accounts-receivable.customers:columnState",
    )
    expect(gridStorageKey("accounts-receivable.customers", "pageSize")).toBe(
      "bc-grid:accounts-receivable.customers:pageSize",
    )
    expect(gridStorageKey("accounts-receivable.customers", "sidebarPanel")).toBe(
      "bc-grid:accounts-receivable.customers:sidebarPanel",
    )
  })

  test("reads and validates persisted grid state", () => {
    const storage = new MemoryStorage()
    const gridId = "accounts"
    storage.setItem(
      gridStorageKey(gridId, "columnState"),
      JSON.stringify([
        {
          columnId: "customer",
          hidden: false,
          pinned: "left",
          position: 1,
          sortDirection: "asc",
          sortIndex: 0,
          width: 240,
        },
        {
          columnId: "ignored-invalid-values",
          pinned: "middle",
          position: -1,
          width: -20,
        },
      ]),
    )
    storage.setItem(gridStorageKey(gridId, "pageSize"), JSON.stringify(100))
    storage.setItem(gridStorageKey(gridId, "density"), JSON.stringify("compact"))
    storage.setItem(gridStorageKey(gridId, "groupBy"), JSON.stringify(["tier", "status"]))
    storage.setItem(gridStorageKey(gridId, "sidebarPanel"), JSON.stringify("columns"))

    expect(readPersistedGridState(gridId, storage)).toEqual({
      columnState: [
        {
          columnId: "customer",
          hidden: false,
          pinned: "left",
          position: 1,
          sortDirection: "asc",
          sortIndex: 0,
          width: 240,
        },
        { columnId: "ignored-invalid-values" },
      ],
      density: "compact",
      groupBy: ["tier", "status"],
      pageSize: 100,
      sidebarPanel: "columns",
    })
  })

  test("ignores malformed or unsupported persisted values", () => {
    const storage = new MemoryStorage()
    const gridId = "accounts"
    storage.setItem(gridStorageKey(gridId, "columnState"), "not-json")
    storage.setItem(gridStorageKey(gridId, "pageSize"), JSON.stringify(0))
    storage.setItem(gridStorageKey(gridId, "density"), JSON.stringify("dense"))
    storage.setItem(gridStorageKey(gridId, "groupBy"), JSON.stringify(["tier", 42]))
    storage.setItem(gridStorageKey(gridId, "sidebarPanel"), JSON.stringify(""))

    const state = readPersistedGridState(gridId, storage)
    expect(state.columnState).toBeUndefined()
    expect(state.pageSize).toBeUndefined()
    expect(state.density).toBeUndefined()
    expect(state.groupBy).toBeUndefined()
    expect(state.sidebarPanel).toBeUndefined()
  })

  test("writes state and removes omitted keys", () => {
    const storage = new MemoryStorage()
    const gridId = "accounts"

    writePersistedGridState(
      gridId,
      {
        columnState: [{ columnId: "customer", width: 240 }],
        density: "comfortable",
        groupBy: ["tier"],
        pageSize: 50,
        sidebarPanel: "filters",
      },
      storage,
    )

    expect(storage.getItem(gridStorageKey(gridId, "columnState"))).toBe(
      JSON.stringify([{ columnId: "customer", width: 240 }]),
    )
    expect(storage.getItem(gridStorageKey(gridId, "pageSize"))).toBe(JSON.stringify(50))
    expect(storage.getItem(gridStorageKey(gridId, "density"))).toBe(JSON.stringify("comfortable"))
    expect(storage.getItem(gridStorageKey(gridId, "groupBy"))).toBe(JSON.stringify(["tier"]))
    expect(storage.getItem(gridStorageKey(gridId, "sidebarPanel"))).toBe(JSON.stringify("filters"))

    writePersistedGridState(gridId, {}, storage)

    expect(storage.getItem(gridStorageKey(gridId, "columnState"))).toBeNull()
    expect(storage.getItem(gridStorageKey(gridId, "pageSize"))).toBeNull()
    expect(storage.getItem(gridStorageKey(gridId, "density"))).toBeNull()
    expect(storage.getItem(gridStorageKey(gridId, "groupBy"))).toBeNull()
    expect(storage.getItem(gridStorageKey(gridId, "sidebarPanel"))).toBeNull()
  })

  test("treats browser storage as best effort", () => {
    const throwingStorage: StorageLike = {
      getItem() {
        throw new Error("blocked")
      },
      removeItem() {
        throw new Error("blocked")
      },
      setItem() {
        throw new Error("blocked")
      },
    }

    expect(() => readPersistedGridState("accounts", throwingStorage)).not.toThrow()
    expect(() =>
      writePersistedGridState("accounts", { density: "normal" }, throwingStorage),
    ).not.toThrow()
  })
})

describe("grid URL state persistence", () => {
  test("reads and validates column state + sort from a configured search param", () => {
    const payload = JSON.stringify({
      columnState: [
        { columnId: "customer", hidden: true, position: 2, width: 260 },
        { columnId: "bad-width", width: -1 },
      ],
      sort: [
        { columnId: "balance", direction: "desc" },
        { columnId: "ignored", direction: "sideways" },
      ],
    })
    const location = locationLike(`?tab=customers&grid=${encodeURIComponent(payload)}`)

    expect(readUrlPersistedGridState({ searchParam: "grid" }, location)).toEqual({
      columnState: [
        { columnId: "customer", hidden: true, position: 2, width: 260 },
        { columnId: "bad-width" },
      ],
      sort: [{ columnId: "balance", direction: "desc" }],
    })
  })

  test("ignores missing, blank, and malformed URL state", () => {
    expect(
      readUrlPersistedGridState({ searchParam: "grid" }, locationLike("?tab=customers")),
    ).toEqual({})
    expect(readUrlPersistedGridState({ searchParam: " " }, locationLike("?grid={}"))).toEqual({})
    expect(
      readUrlPersistedGridState({ searchParam: "grid" }, locationLike("?grid=not-json")),
    ).toEqual({})
  })

  test("writes URL state without dropping unrelated search params or hash", () => {
    const history = historyLike()
    const location = locationLike("?tab=customers#ledger")

    writeUrlPersistedGridState(
      { searchParam: "grid" },
      {
        columnState: [{ columnId: "customer", width: 240 }],
        sort: [{ columnId: "balance", direction: "asc" }],
      },
      history,
      location,
    )

    const url = history.urls.at(-1)
    expect(url?.startsWith("/?tab=customers&grid=")).toBe(true)
    expect(url?.endsWith("#ledger")).toBe(true)
    const encoded = new URL(`https://example.test${url}`).searchParams.get("grid")
    expect(encoded ? JSON.parse(encoded) : null).toEqual({
      columnState: [{ columnId: "customer", width: 240 }],
      sort: [{ columnId: "balance", direction: "asc" }],
    })
  })

  test("removes URL state when no persisted values are present", () => {
    const history = historyLike()
    const location = locationLike("?tab=customers&grid=%7B%7D#ledger")

    writeUrlPersistedGridState({ searchParam: "grid" }, {}, history, location)

    expect(history.urls.at(-1)).toBe("/?tab=customers#ledger")
  })
})

function locationLike(searchAndHash: string): LocationLike {
  const [search = "", hash = ""] = searchAndHash.split("#")
  return {
    pathname: "/",
    search,
    hash: hash ? `#${hash}` : "",
  }
}

function historyLike(): HistoryLike & { urls: string[] } {
  const urls: string[] = []
  return {
    urls,
    replaceState(_state, _unused, url) {
      urls.push(String(url))
    },
  }
}
