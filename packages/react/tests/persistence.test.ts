import { describe, expect, test } from "bun:test"
import {
  type HistoryLike,
  type LocationLike,
  type StorageLike,
  gridStorageKey,
  prunePersistedGridStateForColumns,
  pruneUrlPersistedGridStateForColumns,
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
    expect(gridStorageKey("accounts-receivable.customers", "sort")).toBe(
      "bc-grid:accounts-receivable.customers:sort",
    )
    expect(gridStorageKey("accounts-receivable.customers", "pageSize")).toBe(
      "bc-grid:accounts-receivable.customers:pageSize",
    )
    expect(gridStorageKey("accounts-receivable.customers", "sidebarPanel")).toBe(
      "bc-grid:accounts-receivable.customers:sidebarPanel",
    )
    expect(gridStorageKey("accounts-receivable.customers", "filter")).toBe(
      "bc-grid:accounts-receivable.customers:filter",
    )
    expect(gridStorageKey("accounts-receivable.customers", "pivotState")).toBe(
      "bc-grid:accounts-receivable.customers:pivotState",
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
    storage.setItem(
      gridStorageKey(gridId, "sort"),
      JSON.stringify([
        { columnId: "balance", direction: "desc" },
        { columnId: "ignored", direction: "sideways" },
      ]),
    )
    storage.setItem(gridStorageKey(gridId, "pageSize"), JSON.stringify(100))
    storage.setItem(gridStorageKey(gridId, "density"), JSON.stringify("compact"))
    storage.setItem(gridStorageKey(gridId, "groupBy"), JSON.stringify(["tier", "status"]))
    storage.setItem(
      gridStorageKey(gridId, "pivotState"),
      JSON.stringify({
        colGroups: ["month"],
        rowGroups: ["tier"],
        subtotals: { cols: false, rows: true },
        values: [
          { aggregation: { type: "sum" }, columnId: "balance", label: "Balance" },
          { aggregation: { type: "custom", custom: { id: "unsupported" } }, columnId: "risk" },
          { columnId: "" },
        ],
      }),
    )
    storage.setItem(
      gridStorageKey(gridId, "filter"),
      JSON.stringify({
        kind: "column",
        columnId: "status",
        type: "set",
        op: "in",
        values: ["Open", "Past Due"],
      }),
    )
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
      sort: [{ columnId: "balance", direction: "desc" }],
      density: "compact",
      filter: {
        kind: "column",
        columnId: "status",
        type: "set",
        op: "in",
        values: ["Open", "Past Due"],
      },
      groupBy: ["tier", "status"],
      pageSize: 100,
      pivotState: {
        colGroups: ["month"],
        rowGroups: ["tier"],
        subtotals: { cols: false, rows: true },
        values: [
          { aggregation: { type: "sum" }, columnId: "balance", label: "Balance" },
          { columnId: "risk" },
        ],
      },
      sidebarPanel: "columns",
    })
  })

  test("registered filter type strings round-trip through localStorage and URL state", () => {
    const filter = {
      kind: "column" as const,
      columnId: "code",
      type: "registered-priority",
      op: "custom",
      value: { prefix: "VIP" },
    }
    const storage = new MemoryStorage()

    writePersistedGridState("accounts", { filter }, storage)
    expect(readPersistedGridState("accounts", storage).filter).toEqual(filter)

    const historyCalls: string[] = []
    const history: HistoryLike = {
      replaceState(_state, _unused, url) {
        historyCalls.push(String(url))
      },
    }
    const location: LocationLike = { pathname: "/customers", search: "", hash: "#grid" }

    writeUrlPersistedGridState({ searchParam: "grid" }, { filter }, history, location)
    const writtenUrl = historyCalls.at(-1)
    if (!writtenUrl) throw new Error("expected URL write")
    const search = writtenUrl.slice(writtenUrl.indexOf("?"), writtenUrl.indexOf("#"))
    expect(
      readUrlPersistedGridState({ searchParam: "grid" }, { ...location, search }).filter,
    ).toEqual(filter)
  })

  test("ignores malformed or unsupported persisted values", () => {
    const storage = new MemoryStorage()
    const gridId = "accounts"
    storage.setItem(gridStorageKey(gridId, "columnState"), "not-json")
    storage.setItem(gridStorageKey(gridId, "sort"), JSON.stringify([{ columnId: "name" }]))
    storage.setItem(gridStorageKey(gridId, "pageSize"), JSON.stringify(0))
    storage.setItem(gridStorageKey(gridId, "density"), JSON.stringify("dense"))
    storage.setItem(gridStorageKey(gridId, "groupBy"), JSON.stringify(["tier", 42]))
    storage.setItem(gridStorageKey(gridId, "pivotState"), JSON.stringify({ rowGroups: ["tier"] }))
    storage.setItem(
      gridStorageKey(gridId, "filter"),
      JSON.stringify({ kind: "column", columnId: "", type: "text", op: "contains", value: "x" }),
    )
    storage.setItem(gridStorageKey(gridId, "sidebarPanel"), JSON.stringify(""))

    const state = readPersistedGridState(gridId, storage)
    expect(state.columnState).toBeUndefined()
    expect(state.sort).toBeUndefined()
    expect(state.pageSize).toBeUndefined()
    expect(state.density).toBeUndefined()
    expect(state.filter).toBeUndefined()
    expect(state.groupBy).toBeUndefined()
    expect(state.pivotState).toBeUndefined()
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
        filter: {
          kind: "column",
          columnId: "status",
          type: "text",
          op: "contains",
          value: "open",
        },
        sort: [{ columnId: "customer", direction: "asc" }],
        groupBy: ["tier"],
        pageSize: 50,
        pivotState: {
          colGroups: ["month"],
          rowGroups: ["status"],
          values: [{ aggregation: { type: "count" }, columnId: "id" }],
        },
        sidebarPanel: "filters",
      },
      storage,
    )

    expect(storage.getItem(gridStorageKey(gridId, "columnState"))).toBe(
      JSON.stringify([{ columnId: "customer", width: 240 }]),
    )
    expect(storage.getItem(gridStorageKey(gridId, "sort"))).toBe(
      JSON.stringify([{ columnId: "customer", direction: "asc" }]),
    )
    expect(storage.getItem(gridStorageKey(gridId, "pageSize"))).toBe(JSON.stringify(50))
    expect(storage.getItem(gridStorageKey(gridId, "density"))).toBe(JSON.stringify("comfortable"))
    expect(storage.getItem(gridStorageKey(gridId, "filter"))).toBe(
      JSON.stringify({
        kind: "column",
        columnId: "status",
        type: "text",
        op: "contains",
        value: "open",
      }),
    )
    expect(storage.getItem(gridStorageKey(gridId, "groupBy"))).toBe(JSON.stringify(["tier"]))
    expect(storage.getItem(gridStorageKey(gridId, "pivotState"))).toBe(
      JSON.stringify({
        colGroups: ["month"],
        rowGroups: ["status"],
        values: [{ aggregation: { type: "count" }, columnId: "id" }],
      }),
    )
    expect(storage.getItem(gridStorageKey(gridId, "sidebarPanel"))).toBe(JSON.stringify("filters"))

    writePersistedGridState(gridId, {}, storage)

    expect(storage.getItem(gridStorageKey(gridId, "columnState"))).toBeNull()
    expect(storage.getItem(gridStorageKey(gridId, "sort"))).toBeNull()
    expect(storage.getItem(gridStorageKey(gridId, "pageSize"))).toBeNull()
    expect(storage.getItem(gridStorageKey(gridId, "density"))).toBeNull()
    expect(storage.getItem(gridStorageKey(gridId, "filter"))).toBeNull()
    expect(storage.getItem(gridStorageKey(gridId, "groupBy"))).toBeNull()
    expect(storage.getItem(gridStorageKey(gridId, "pivotState"))).toBeNull()
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

  test("prunes persisted layout state against current columns after schema changes", () => {
    const columnIds = new Set(["customer", "status", "balance"])
    const pruned = prunePersistedGridStateForColumns(
      {
        columnState: [
          { columnId: "customer", hidden: false, pinned: "left", position: 0, width: 240 },
          { columnId: "legacy", hidden: true, pinned: "right", position: 1, width: 999 },
          { columnId: "status", hidden: true, pinned: null, position: 2, width: 160 },
          { columnId: "status", hidden: false, position: 4, width: 320 },
        ],
        density: "compact",
        filter: {
          kind: "group",
          op: "and",
          filters: [
            { kind: "column", columnId: "status", type: "set", op: "in", values: ["Open"] },
            { kind: "column", columnId: "legacy", type: "text", op: "contains", value: "old" },
          ],
        },
        groupBy: ["legacy", "status", "customer"],
        pageSize: 100,
        pivotState: {
          colGroups: ["legacy", "status"],
          rowGroups: ["customer", "removed"],
          values: [
            { aggregation: { type: "sum" }, columnId: "balance", label: "Balance" },
            { aggregation: { type: "count" }, columnId: "legacy" },
          ],
        },
        sidebarPanel: "columns",
        sort: [
          { columnId: "legacy", direction: "asc" },
          { columnId: "balance", direction: "desc" },
        ],
      },
      columnIds,
    )

    expect(pruned).toEqual({
      columnState: [
        { columnId: "customer", hidden: false, pinned: "left", position: 0, width: 240 },
        { columnId: "status", hidden: true, pinned: null, position: 2, width: 160 },
      ],
      density: "compact",
      filter: {
        kind: "group",
        op: "and",
        filters: [{ kind: "column", columnId: "status", type: "set", op: "in", values: ["Open"] }],
      },
      groupBy: ["status", "customer"],
      pageSize: 100,
      pivotState: {
        colGroups: ["status"],
        rowGroups: ["customer"],
        values: [{ aggregation: { type: "sum" }, columnId: "balance", label: "Balance" }],
      },
      sidebarPanel: "columns",
      sort: [{ columnId: "balance", direction: "desc" }],
    })
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
      filter: {
        kind: "group",
        op: "and",
        filters: [
          { kind: "column", columnId: "status", type: "text", op: "contains", value: "open" },
          { kind: "column", columnId: "", type: "text", op: "contains", value: "ignored" },
        ],
      },
    })
    const location = locationLike(`?tab=customers&grid=${encodeURIComponent(payload)}`)

    expect(readUrlPersistedGridState({ searchParam: "grid" }, location)).toEqual({
      columnState: [
        { columnId: "customer", hidden: true, position: 2, width: 260 },
        { columnId: "bad-width" },
      ],
      filter: {
        kind: "group",
        op: "and",
        filters: [
          { kind: "column", columnId: "status", type: "text", op: "contains", value: "open" },
        ],
      },
      sort: [{ columnId: "balance", direction: "desc" }],
    })
  })

  test("prunes URL persisted layout state against current columns after schema changes", () => {
    const state = pruneUrlPersistedGridStateForColumns(
      {
        columnState: [
          { columnId: "customer", position: 0, width: 220 },
          { columnId: "legacy", position: 1, width: 999 },
        ],
        filter: {
          kind: "group",
          op: "or",
          filters: [
            { kind: "column", columnId: "customer", type: "text", op: "contains", value: "acme" },
            { kind: "column", columnId: "legacy", type: "text", op: "contains", value: "old" },
          ],
        },
        sort: [
          { columnId: "legacy", direction: "asc" },
          { columnId: "customer", direction: "desc" },
        ],
      },
      new Set(["customer"]),
    )

    expect(state).toEqual({
      columnState: [{ columnId: "customer", position: 0, width: 220 }],
      filter: {
        kind: "group",
        op: "or",
        filters: [
          { kind: "column", columnId: "customer", type: "text", op: "contains", value: "acme" },
        ],
      },
      sort: [{ columnId: "customer", direction: "desc" }],
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
        filter: { kind: "column", columnId: "status", type: "boolean", op: "is", value: true },
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
      filter: { kind: "column", columnId: "status", type: "boolean", op: "is", value: true },
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

describe("filter persistence contract corners", () => {
  test("custom filter type round-trips through localStorage with value / values pass-through", () => {
    // Custom filter types are consumer-owned per the audit (§2.4 of
    // v030-filter-persistence-contract.md). bc-grid does not validate
    // their `value` / `values` shape; round-trip must preserve them.
    const storage = new MemoryStorage()
    const gridId = "tags-grid"
    const filter = {
      kind: "column" as const,
      columnId: "tags",
      type: "custom" as const,
      op: "tags-any",
      values: ["finance", "audit"],
    }

    writePersistedGridState(gridId, { filter }, storage)
    expect(readPersistedGridState(gridId, storage).filter).toEqual(filter)
  })

  test("custom filter type round-trips through URL state", () => {
    const history = historyLike()
    const location = locationLike("?tab=tags")
    const filter = {
      kind: "column" as const,
      columnId: "tags",
      type: "custom" as const,
      op: "tags-any",
      values: ["finance", "audit"],
    }

    writeUrlPersistedGridState({ searchParam: "grid" }, { filter }, history, location)
    const written = history.urls.at(-1) ?? ""
    const replayed = locationLike(written.replace(/^\//, ""))
    expect(readUrlPersistedGridState({ searchParam: "grid" }, replayed).filter).toEqual(filter)
  })

  test("sidebarPanel: null round-trips as null (explicitly closed, distinct from undefined)", () => {
    // writeJson writes the JSON-string "null" for null values rather
    // than removing the key. parseSidebarPanel(null) returns null.
    // The distinction matters: null == "explicitly closed",
    // undefined == "no preference, fall back to default".
    const storage = new MemoryStorage()
    const gridId = "with-sidebar"

    writePersistedGridState(gridId, { sidebarPanel: null }, storage)
    expect(storage.getItem(gridStorageKey(gridId, "sidebarPanel"))).toBe(JSON.stringify(null))
    expect(readPersistedGridState(gridId, storage).sidebarPanel).toBeNull()
  })

  test("empty-storage read returns eight explicit-undefined keys (not {})", () => {
    // Documented corner: PersistedGridState makes every field optional
    // (`?:`) so the runtime can return `undefined` per key; the reader
    // returns the full eight-key shape regardless. Object.keys(state)
    // therefore returns eight entries, not zero. Consumers iterating
    // with `Object.keys` should be aware.
    const storage = new MemoryStorage()
    const state = readPersistedGridState("nothing-persisted", storage)
    const keys = Object.keys(state).sort()
    expect(keys).toEqual(
      [
        "columnState",
        "density",
        "filter",
        "groupBy",
        "pageSize",
        "pivotState",
        "sidebarPanel",
        "sort",
      ].sort(),
    )
    for (const key of keys) {
      expect(state[key as keyof typeof state]).toBeUndefined()
    }
  })

  test("URL reader returns {} when the configured search param is missing entirely", () => {
    // Distinct from the localStorage shape: the URL reader does not
    // synthesise undefined-valued keys. Consumers that destructure
    // `const { filter } = readUrlPersistedGridState(...)` get
    // `filter === undefined` either way, but `Object.keys(state)`
    // differs. Pin the contract.
    const empty = readUrlPersistedGridState({ searchParam: "grid" }, locationLike("?tab=customers"))
    expect(empty).toEqual({})
    expect(Object.keys(empty)).toHaveLength(0)
  })

  test("URL writer keeps the search param when state has empty arrays", () => {
    // Writer drops the param ONLY when columnState / sort / filter are
    // all undefined. Empty arrays mean "explicit empty" (e.g., user
    // cleared all sorts) and stay in the URL.
    const history = historyLike()
    const location = locationLike("?tab=customers")

    writeUrlPersistedGridState(
      { searchParam: "grid" },
      { columnState: [], sort: [] },
      history,
      location,
    )

    const url = history.urls.at(-1) ?? ""
    expect(url.includes("grid=")).toBe(true)
    const encoded = new URL(`https://example.test${url}`).searchParams.get("grid")
    expect(encoded ? JSON.parse(encoded) : null).toEqual({ columnState: [], sort: [] })
  })

  test("URL writer drops the param when every persisted field is undefined", () => {
    // Mirror of the above: undefined / undefined / undefined → param
    // is removed. Pin the discriminator at the same time as the
    // empty-array case.
    const history = historyLike()
    const location = locationLike("?tab=customers&grid=%7B%7D")

    writeUrlPersistedGridState({ searchParam: "grid" }, {}, history, location)
    expect(history.urls.at(-1)).toBe("/?tab=customers")
  })

  test("unicode + special characters round-trip through both backends", () => {
    // ERP data isn't ASCII-only. Confirms JSON.stringify + URL-encode
    // round-trip stays clean for non-ASCII filter values, including
    // emoji and CJK characters.
    const exotic = "résumé / 顧客 / 🚀"
    const filter = {
      kind: "column" as const,
      columnId: "name",
      type: "text" as const,
      op: "contains",
      value: exotic,
    }

    const storage = new MemoryStorage()
    writePersistedGridState("unicode-grid", { filter }, storage)
    expect(readPersistedGridState("unicode-grid", storage).filter).toEqual(filter)

    const history = historyLike()
    const location = locationLike("?tab=customers")
    writeUrlPersistedGridState({ searchParam: "grid" }, { filter }, history, location)
    const written = history.urls.at(-1) ?? ""
    const replayed = locationLike(written.replace(/^\//, ""))
    expect(readUrlPersistedGridState({ searchParam: "grid" }, replayed).filter).toEqual(filter)
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
