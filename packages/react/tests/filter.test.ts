import { describe, expect, test } from "bun:test"
import type { ColumnId } from "@bc-grid/core"
import {
  buildGridFilter,
  encodeDateFilterInput,
  encodeNumberFilterInput,
  encodeSetFilterInput,
  matchesGridFilter,
} from "../src/filter"

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

  test("boolean inputs produce boolean ServerColumnFilter objects", () => {
    expect(buildGridFilter({ creditHold: "true" }, { creditHold: "boolean" })).toEqual({
      kind: "column",
      columnId: "creditHold",
      type: "boolean",
      op: "is",
      value: true,
    })
    expect(buildGridFilter({ creditHold: "false" }, { creditHold: "boolean" })).toEqual({
      kind: "column",
      columnId: "creditHold",
      type: "boolean",
      op: "is",
      value: false,
    })
  })

  test("empty boolean input means any value", () => {
    expect(buildGridFilter({ creditHold: "" }, { creditHold: "boolean" })).toBeNull()
  })

  test("number inputs produce number ServerColumnFilter objects", () => {
    expect(
      buildGridFilter(
        { balance: encodeNumberFilterInput({ op: ">=", value: "1000" }) },
        { balance: "number" },
      ),
    ).toEqual({
      kind: "column",
      columnId: "balance",
      type: "number",
      op: ">=",
      value: 1000,
    })
  })

  test("between number inputs produce inclusive min/max values", () => {
    expect(
      buildGridFilter(
        { balance: encodeNumberFilterInput({ op: "between", value: "2500", valueTo: "1000" }) },
        { balance: "number" },
      ),
    ).toEqual({
      kind: "column",
      columnId: "balance",
      type: "number",
      op: "between",
      values: [1000, 2500],
    })
  })

  test("incomplete number inputs do not activate a filter", () => {
    expect(
      buildGridFilter(
        { balance: encodeNumberFilterInput({ op: "between", value: "1000", valueTo: "" }) },
        { balance: "number" },
      ),
    ).toBeNull()
  })

  test("date inputs produce date ServerColumnFilter objects", () => {
    expect(
      buildGridFilter(
        { lastInvoice: encodeDateFilterInput({ op: "before", value: "2026-03-01" }) },
        { lastInvoice: "date" },
      ),
    ).toEqual({
      kind: "column",
      columnId: "lastInvoice",
      type: "date",
      op: "before",
      value: "2026-03-01",
    })
  })

  test("between date inputs produce inclusive min/max values", () => {
    expect(
      buildGridFilter(
        {
          lastInvoice: encodeDateFilterInput({
            op: "between",
            value: "2026-03-31",
            valueTo: "2026-03-01",
          }),
        },
        { lastInvoice: "date" },
      ),
    ).toEqual({
      kind: "column",
      columnId: "lastInvoice",
      type: "date",
      op: "between",
      values: ["2026-03-01", "2026-03-31"],
    })
  })

  test("incomplete date inputs do not activate a filter", () => {
    expect(
      buildGridFilter(
        {
          lastInvoice: encodeDateFilterInput({
            op: "between",
            value: "2026-03-01",
            valueTo: "",
          }),
        },
        { lastInvoice: "date" },
      ),
    ).toBeNull()
  })

  test("set inputs produce set ServerColumnFilter objects", () => {
    expect(
      buildGridFilter(
        { status: encodeSetFilterInput({ op: "in", values: ["Open", "Past Due"] }) },
        { status: "set" },
      ),
    ).toEqual({
      kind: "column",
      columnId: "status",
      type: "set",
      op: "in",
      values: ["Open", "Past Due"],
    })

    expect(
      buildGridFilter(
        { status: encodeSetFilterInput({ op: "not-in", values: ["Closed"] }) },
        { status: "set" },
      ),
    ).toEqual({
      kind: "column",
      columnId: "status",
      type: "set",
      op: "not-in",
      values: ["Closed"],
    })
  })

  test("blank set input produces a blank ServerColumnFilter", () => {
    expect(
      buildGridFilter(
        { status: encodeSetFilterInput({ op: "blank", values: [] }) },
        { status: "set" },
      ),
    ).toEqual({
      kind: "column",
      columnId: "status",
      type: "set",
      op: "blank",
    })
  })

  test("empty set selections do not activate a filter", () => {
    expect(
      buildGridFilter(
        { status: encodeSetFilterInput({ op: "in", values: [] }) },
        { status: "set" },
      ),
    ).toBeNull()
    expect(
      buildGridFilter(
        { status: encodeSetFilterInput({ op: "not-in", values: [] }) },
        { status: "set" },
      ),
    ).toBeNull()
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

  test("unsupported non-text types are rejected (Q2 follow-up)", () => {
    const filter = {
      kind: "column" as const,
      columnId: "lastInvoice",
      type: "custom" as const,
      op: "domain-specific",
      value: "x",
    }
    expect(matchesGridFilter(filter, lookup({ lastInvoice: "2025-01-01" }))).toBe(false)
  })

  test("boolean filters match formatted yes/no values", () => {
    const yesFilter = buildGridFilter({ creditHold: "true" }, { creditHold: "boolean" })
    const noFilter = buildGridFilter({ creditHold: "false" }, { creditHold: "boolean" })
    if (!yesFilter || !noFilter) throw new Error("expected filters")

    expect(matchesGridFilter(yesFilter, lookup({ creditHold: "Yes" }))).toBe(true)
    expect(matchesGridFilter(yesFilter, lookup({ creditHold: "No" }))).toBe(false)
    expect(matchesGridFilter(noFilter, lookup({ creditHold: "No" }))).toBe(true)
    expect(matchesGridFilter(noFilter, lookup({ creditHold: "Yes" }))).toBe(false)
  })

  test("number filters compare formatted numeric and currency values", () => {
    const gtFilter = buildGridFilter(
      { balance: encodeNumberFilterInput({ op: ">", value: "1000" }) },
      { balance: "number" },
    )
    const betweenFilter = buildGridFilter(
      { balance: encodeNumberFilterInput({ op: "between", value: "1000", valueTo: "2500" }) },
      { balance: "number" },
    )
    if (!gtFilter || !betweenFilter) throw new Error("expected filters")

    expect(matchesGridFilter(gtFilter, lookup({ balance: "$1,250" }))).toBe(true)
    expect(matchesGridFilter(gtFilter, lookup({ balance: "$950" }))).toBe(false)
    expect(matchesGridFilter(betweenFilter, lookup({ balance: "$2,500" }))).toBe(true)
    expect(matchesGridFilter(betweenFilter, lookup({ balance: "$2,501" }))).toBe(false)
  })

  test("date filters compare formatted date values", () => {
    const beforeFilter = buildGridFilter(
      { lastInvoice: encodeDateFilterInput({ op: "before", value: "2026-03-01" }) },
      { lastInvoice: "date" },
    )
    const betweenFilter = buildGridFilter(
      {
        lastInvoice: encodeDateFilterInput({
          op: "between",
          value: "2026-03-01",
          valueTo: "2026-03-31",
        }),
      },
      { lastInvoice: "date" },
    )
    if (!beforeFilter || !betweenFilter) throw new Error("expected filters")

    expect(matchesGridFilter(beforeFilter, lookup({ lastInvoice: "Feb 28, 2026" }))).toBe(true)
    expect(matchesGridFilter(beforeFilter, lookup({ lastInvoice: "Mar 1, 2026" }))).toBe(false)
    expect(matchesGridFilter(betweenFilter, lookup({ lastInvoice: "Mar 31, 2026" }))).toBe(true)
    expect(matchesGridFilter(betweenFilter, lookup({ lastInvoice: "Apr 1, 2026" }))).toBe(false)
  })

  test("date filters prefer raw values over locale-formatted display values", () => {
    const filter = buildGridFilter(
      { lastInvoice: encodeDateFilterInput({ op: "is", value: "2026-03-31" }) },
      { lastInvoice: "date" },
    )
    if (!filter) throw new Error("expected filter")

    expect(
      matchesGridFilter(filter, () => ({
        formattedValue: "31.03.2026",
        rawValue: "2026-03-31T00:00:00.000Z",
      })),
    ).toBe(true)
    expect(matchesGridFilter(filter, lookup({ lastInvoice: "31.03.2026" }))).toBe(false)
  })

  test("set filters match selected formatted values", () => {
    const filter = buildGridFilter(
      { status: encodeSetFilterInput({ op: "in", values: ["Open", "Past Due"] }) },
      { status: "set" },
    )
    if (!filter) throw new Error("expected filter")

    expect(matchesGridFilter(filter, lookup({ status: "Open" }))).toBe(true)
    expect(matchesGridFilter(filter, lookup({ status: "Closed" }))).toBe(false)
  })

  test("set filters prefer raw values when available", () => {
    const filter = buildGridFilter(
      { status: encodeSetFilterInput({ op: "in", values: ["open"] }) },
      { status: "set" },
    )
    if (!filter) throw new Error("expected filter")

    expect(
      matchesGridFilter(filter, () => ({
        formattedValue: "Open",
        rawValue: "open",
      })),
    ).toBe(true)
  })

  test("not-in set filters reject selected values", () => {
    const filter = buildGridFilter(
      { status: encodeSetFilterInput({ op: "not-in", values: ["Closed"] }) },
      { status: "set" },
    )
    if (!filter) throw new Error("expected filter")

    expect(matchesGridFilter(filter, lookup({ status: "Open" }))).toBe(true)
    expect(matchesGridFilter(filter, lookup({ status: "Closed" }))).toBe(false)
  })

  test("blank set filters match empty raw or formatted values", () => {
    const filter = buildGridFilter(
      { status: encodeSetFilterInput({ op: "blank", values: [] }) },
      { status: "set" },
    )
    if (!filter) throw new Error("expected filter")

    expect(
      matchesGridFilter(filter, () => ({
        formattedValue: "Fallback",
        rawValue: null,
      })),
    ).toBe(true)
    expect(matchesGridFilter(filter, lookup({ status: "" }))).toBe(true)
    expect(matchesGridFilter(filter, lookup({ status: "Open" }))).toBe(false)
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
