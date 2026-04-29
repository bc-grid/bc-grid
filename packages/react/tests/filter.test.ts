import { describe, expect, test } from "bun:test"
import type { ColumnId } from "@bc-grid/core"
import { buildGridFilter, matchesGridFilter } from "../src/filter"

describe("buildGridFilter", () => {
  test("empty input → null", () => {
    expect(buildGridFilter({})).toBeNull()
    expect(buildGridFilter({ name: "" })).toBeNull()
    expect(buildGridFilter({ name: "  ", email: "" })).toBeNull()
  })

  test("trims whitespace; whitespace-only is ignored", () => {
    expect(buildGridFilter({ name: "   " })).toBeNull()
  })

  test("single non-empty input → bare ServerColumnFilter", () => {
    expect(buildGridFilter({ name: "John" })).toEqual({
      kind: "column",
      columnId: "name",
      type: "text",
      op: "contains",
      value: "John",
    })
  })

  test("multiple non-empty inputs → ServerFilterGroup with op: and", () => {
    const result = buildGridFilter({ name: "John", email: "@acme" })
    expect(result?.kind).toBe("group")
    if (result?.kind === "group") {
      expect(result.op).toBe("and")
      expect(result.filters).toHaveLength(2)
    }
  })

  test("trims trailing/leading whitespace on values", () => {
    const result = buildGridFilter({ name: "  John  " })
    if (result?.kind === "column") {
      expect(result.value).toBe("John")
    } else {
      throw new Error("expected column filter")
    }
  })
})

describe("matchesGridFilter — column", () => {
  const lookup =
    (values: Record<ColumnId, string>) =>
    (columnId: ColumnId): string =>
      values[columnId] ?? ""

  test("substring match (case-insensitive)", () => {
    const filter = buildGridFilter({ name: "JoHn" })
    if (!filter) throw new Error("expected filter")
    expect(matchesGridFilter(filter, lookup({ name: "Johnathan Doe" }))).toBe(true)
    expect(matchesGridFilter(filter, lookup({ name: "Jane Smith" }))).toBe(false)
  })

  test("empty needle matches everything", () => {
    const filter = {
      kind: "column" as const,
      columnId: "x",
      type: "text" as const,
      op: "contains",
      value: "",
    }
    expect(matchesGridFilter(filter, lookup({ x: "anything" }))).toBe(true)
    expect(matchesGridFilter(filter, lookup({ x: "" }))).toBe(true)
  })

  test("missing column treated as empty value", () => {
    const filter = buildGridFilter({ email: "acme" })
    if (!filter) throw new Error("expected filter")
    expect(matchesGridFilter(filter, lookup({}))).toBe(false)
  })

  test("non-text type is rejected (Q2 follow-up)", () => {
    const filter = {
      kind: "column" as const,
      columnId: "balance",
      type: "number" as const,
      op: ">",
      value: 1000,
    }
    expect(matchesGridFilter(filter, lookup({ balance: "$5,000" }))).toBe(false)
  })

  test("unknown op is rejected (Q2 follow-up)", () => {
    const filter = {
      kind: "column" as const,
      columnId: "name",
      type: "text" as const,
      op: "regex",
      value: "^J",
    }
    expect(matchesGridFilter(filter, lookup({ name: "John" }))).toBe(false)
  })
})

describe("matchesGridFilter — AND/OR groups", () => {
  const lookup =
    (values: Record<ColumnId, string>) =>
    (columnId: ColumnId): string =>
      values[columnId] ?? ""

  test("AND requires every child to match", () => {
    const filter = buildGridFilter({ name: "John", email: "@acme" })
    if (!filter) throw new Error("expected filter")
    expect(matchesGridFilter(filter, lookup({ name: "John Doe", email: "john@acme.io" }))).toBe(
      true,
    )
    // Missing email match → fail.
    expect(matchesGridFilter(filter, lookup({ name: "John Doe", email: "john@other.io" }))).toBe(
      false,
    )
    // Missing name match → fail.
    expect(matchesGridFilter(filter, lookup({ name: "Jane Smith", email: "jane@acme.io" }))).toBe(
      false,
    )
  })

  test("OR requires at least one child to match", () => {
    const filter = {
      kind: "group" as const,
      op: "or" as const,
      filters: [
        {
          kind: "column" as const,
          columnId: "x",
          type: "text" as const,
          op: "contains",
          value: "a",
        },
        {
          kind: "column" as const,
          columnId: "y",
          type: "text" as const,
          op: "contains",
          value: "b",
        },
      ],
    }
    expect(matchesGridFilter(filter, lookup({ x: "apple", y: "" }))).toBe(true)
    expect(matchesGridFilter(filter, lookup({ x: "", y: "banana" }))).toBe(true)
    expect(matchesGridFilter(filter, lookup({ x: "kiwi", y: "kiwi" }))).toBe(false)
  })

  test("nested groups are recursive", () => {
    const filter = {
      kind: "group" as const,
      op: "and" as const,
      filters: [
        {
          kind: "column" as const,
          columnId: "name",
          type: "text" as const,
          op: "contains",
          value: "John",
        },
        {
          kind: "group" as const,
          op: "or" as const,
          filters: [
            {
              kind: "column" as const,
              columnId: "tier",
              type: "text" as const,
              op: "contains",
              value: "Gold",
            },
            {
              kind: "column" as const,
              columnId: "region",
              type: "text" as const,
              op: "contains",
              value: "EU",
            },
          ],
        },
      ],
    }
    // John + Gold = match
    expect(matchesGridFilter(filter, lookup({ name: "John", tier: "Gold", region: "US" }))).toBe(
      true,
    )
    // John + EU = match
    expect(matchesGridFilter(filter, lookup({ name: "John", tier: "Silver", region: "EU" }))).toBe(
      true,
    )
    // John + neither = no match
    expect(matchesGridFilter(filter, lookup({ name: "John", tier: "Bronze", region: "US" }))).toBe(
      false,
    )
    // Not John = no match (regardless of OR branch)
    expect(matchesGridFilter(filter, lookup({ name: "Jane", tier: "Gold", region: "EU" }))).toBe(
      false,
    )
  })
})
