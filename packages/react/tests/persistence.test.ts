import { describe, expect, test } from "bun:test"
import {
  type StorageLike,
  gridStorageKey,
  readPersistedGridState,
  writePersistedGridState,
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
    })
  })

  test("ignores malformed or unsupported persisted values", () => {
    const storage = new MemoryStorage()
    const gridId = "accounts"
    storage.setItem(gridStorageKey(gridId, "columnState"), "not-json")
    storage.setItem(gridStorageKey(gridId, "pageSize"), JSON.stringify(0))
    storage.setItem(gridStorageKey(gridId, "density"), JSON.stringify("dense"))
    storage.setItem(gridStorageKey(gridId, "groupBy"), JSON.stringify(["tier", 42]))

    const state = readPersistedGridState(gridId, storage)
    expect(state.columnState).toBeUndefined()
    expect(state.pageSize).toBeUndefined()
    expect(state.density).toBeUndefined()
    expect(state.groupBy).toBeUndefined()
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
      },
      storage,
    )

    expect(storage.getItem(gridStorageKey(gridId, "columnState"))).toBe(
      JSON.stringify([{ columnId: "customer", width: 240 }]),
    )
    expect(storage.getItem(gridStorageKey(gridId, "pageSize"))).toBe(JSON.stringify(50))
    expect(storage.getItem(gridStorageKey(gridId, "density"))).toBe(JSON.stringify("comfortable"))
    expect(storage.getItem(gridStorageKey(gridId, "groupBy"))).toBe(JSON.stringify(["tier"]))

    writePersistedGridState(gridId, {}, storage)

    expect(storage.getItem(gridStorageKey(gridId, "columnState"))).toBeNull()
    expect(storage.getItem(gridStorageKey(gridId, "pageSize"))).toBeNull()
    expect(storage.getItem(gridStorageKey(gridId, "density"))).toBeNull()
    expect(storage.getItem(gridStorageKey(gridId, "groupBy"))).toBeNull()
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
