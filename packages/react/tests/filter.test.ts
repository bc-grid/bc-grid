import { describe, expect, test } from "bun:test"
import type { ColumnId } from "@bc-grid/core"
import {
  buildGridFilter,
  columnFilterTextEqual,
  columnFilterTextFromGridFilter,
  decodeDateRangeFilterInput,
  decodeNumberFilterInput,
  decodeNumberRangeFilterInput,
  decodeSetFilterInput,
  decodeTextFilterInput,
  encodeDateFilterInput,
  encodeDateRangeFilterInput,
  encodeNumberFilterInput,
  encodeNumberRangeFilterInput,
  encodeSetFilterInput,
  encodeTextFilterInput,
  filterHasColumn,
  filterSetFilterOptions,
  matchesGridFilter,
  nextSetFilterValuesOnToggleAll,
  removeColumnFromFilter,
  setFilterValueKeys,
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

  test("number-range inputs produce a between ServerColumnFilter with normalized min/max", () => {
    expect(
      buildGridFilter(
        { balance: encodeNumberRangeFilterInput({ value: "2500", valueTo: "1000" }) },
        { balance: "number-range" },
      ),
    ).toEqual({
      kind: "column",
      columnId: "balance",
      type: "number-range",
      op: "between",
      values: [1000, 2500],
    })
  })

  test("number-range with both bounds equal narrows to a single value", () => {
    expect(
      buildGridFilter(
        { balance: encodeNumberRangeFilterInput({ value: "1500", valueTo: "1500" }) },
        { balance: "number-range" },
      ),
    ).toEqual({
      kind: "column",
      columnId: "balance",
      type: "number-range",
      op: "between",
      values: [1500, 1500],
    })
  })

  test("incomplete number-range inputs do not activate a filter", () => {
    expect(
      buildGridFilter(
        { balance: encodeNumberRangeFilterInput({ value: "1000", valueTo: "" }) },
        { balance: "number-range" },
      ),
    ).toBeNull()
    expect(
      buildGridFilter(
        { balance: encodeNumberRangeFilterInput({ value: "", valueTo: "1000" }) },
        { balance: "number-range" },
      ),
    ).toBeNull()
    expect(
      buildGridFilter(
        { balance: encodeNumberRangeFilterInput({ value: "abc", valueTo: "1000" }) },
        { balance: "number-range" },
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

  test("date-range inputs produce a between ServerColumnFilter with normalised from/to", () => {
    expect(
      buildGridFilter(
        {
          lastInvoice: encodeDateRangeFilterInput({
            value: "2026-03-31",
            valueTo: "2026-03-01",
          }),
        },
        { lastInvoice: "date-range" },
      ),
    ).toEqual({
      kind: "column",
      columnId: "lastInvoice",
      type: "date-range",
      op: "between",
      values: ["2026-03-01", "2026-03-31"],
    })
  })

  test("date-range with both bounds equal narrows to a single day", () => {
    expect(
      buildGridFilter(
        {
          lastInvoice: encodeDateRangeFilterInput({
            value: "2026-03-15",
            valueTo: "2026-03-15",
          }),
        },
        { lastInvoice: "date-range" },
      ),
    ).toEqual({
      kind: "column",
      columnId: "lastInvoice",
      type: "date-range",
      op: "between",
      values: ["2026-03-15", "2026-03-15"],
    })
  })

  test("incomplete date-range inputs do not activate a filter", () => {
    expect(
      buildGridFilter(
        {
          lastInvoice: encodeDateRangeFilterInput({ value: "2026-03-01", valueTo: "" }),
        },
        { lastInvoice: "date-range" },
      ),
    ).toBeNull()
    expect(
      buildGridFilter(
        {
          lastInvoice: encodeDateRangeFilterInput({ value: "", valueTo: "2026-03-31" }),
        },
        { lastInvoice: "date-range" },
      ),
    ).toBeNull()
    expect(
      buildGridFilter(
        {
          lastInvoice: encodeDateRangeFilterInput({ value: "not-a-date", valueTo: "2026-03-31" }),
        },
        { lastInvoice: "date-range" },
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

describe("columnFilterTextFromGridFilter", () => {
  test("treats null as a cleared filter state", () => {
    expect(columnFilterTextFromGridFilter(null)).toEqual({})
    expect(buildGridFilter(columnFilterTextFromGridFilter(null))).toBeNull()
  })

  test("projects supported filters into inline filter input state", () => {
    const filter = {
      kind: "group",
      op: "and",
      filters: [
        { kind: "column", columnId: "name", type: "text", op: "contains", value: "John" },
        { kind: "column", columnId: "creditHold", type: "boolean", op: "is", value: true },
        { kind: "column", columnId: "balance", type: "number", op: ">=", value: 1000 },
        {
          kind: "column",
          columnId: "lastInvoice",
          type: "date-range",
          op: "between",
          values: ["2026-03-01", "2026-03-31"],
        },
        { kind: "column", columnId: "status", type: "set", op: "not-in", values: ["Closed"] },
      ],
    } as const

    const text = columnFilterTextFromGridFilter(filter)

    expect(text.name).toBe("John")
    expect(text.creditHold).toBe("true")
    expect(text.balance ? decodeNumberFilterInput(text.balance) : null).toEqual({
      op: ">=",
      value: "1000",
    })
    expect(text.lastInvoice ? decodeDateRangeFilterInput(text.lastInvoice) : null).toEqual({
      value: "2026-03-01",
      valueTo: "2026-03-31",
    })
    expect(text.status ? decodeSetFilterInput(text.status) : null).toEqual({
      op: "not-in",
      values: ["Closed"],
    })
    expect(
      buildGridFilter(text, {
        balance: "number",
        creditHold: "boolean",
        lastInvoice: "date-range",
        status: "set",
      }),
    ).toEqual(filter)
  })

  test("does not project OR groups or unsupported custom filters into inline inputs", () => {
    expect(
      columnFilterTextFromGridFilter({
        kind: "group",
        op: "or",
        filters: [
          { kind: "column", columnId: "name", type: "text", op: "contains", value: "John" },
        ],
      }),
    ).toEqual({})
    expect(
      columnFilterTextFromGridFilter({
        kind: "column",
        columnId: "name",
        type: "custom",
        op: "tags-any",
        values: ["finance"],
      }),
    ).toEqual({})
  })

  test("projects number-range filters into inline range inputs", () => {
    const filter = {
      kind: "column" as const,
      columnId: "balance",
      type: "number-range" as const,
      op: "between" as const,
      values: [100, 5000],
    }
    const text = columnFilterTextFromGridFilter(filter)
    expect(text.balance ? decodeNumberRangeFilterInput(text.balance) : null).toEqual({
      value: "100",
      valueTo: "5000",
    })
    // Round-trip: text → buildGridFilter → matches the original filter.
    expect(buildGridFilter(text, { balance: "number-range" })).toEqual(filter)
  })

  test("projects number 'between' filters into inline number inputs", () => {
    const filter = {
      kind: "column" as const,
      columnId: "balance",
      type: "number" as const,
      op: "between" as const,
      values: [100, 5000],
    }
    const text = columnFilterTextFromGridFilter(filter)
    expect(text.balance ? decodeNumberFilterInput(text.balance) : null).toEqual({
      op: "between",
      value: "100",
      valueTo: "5000",
    })
    expect(buildGridFilter(text, { balance: "number" })).toEqual(filter)
  })

  test("compares projected filter text without forcing controlled loops", () => {
    expect(columnFilterTextEqual({ account: "Acme" }, { account: "Acme" })).toBe(true)
    expect(columnFilterTextEqual({ account: "Acme" }, { account: "" })).toBe(false)
    expect(columnFilterTextEqual({ account: "Acme" }, {})).toBe(false)
  })

  test("ignores filters whose declared type doesn't match the operator shape", () => {
    // number filter with a non-numeric value (rejected by scalarFilterInputValue)
    expect(
      columnFilterTextFromGridFilter({
        kind: "column",
        columnId: "balance",
        type: "number",
        op: ">",
        value: { wrong: "shape" } as unknown as string,
      }),
    ).toEqual({})
    // set filter with a non-string value drops the bad entry but keeps valid ones
    expect(
      columnFilterTextFromGridFilter({
        kind: "column",
        columnId: "status",
        type: "set",
        op: "in",
        values: ["Open", 42 as unknown as string, null as unknown as string, "Past Due"],
      }),
    ).toEqual({
      status: encodeSetFilterInput({ op: "in", values: ["Open", "Past Due"] }),
    })
  })
})

describe("columnFilterTextFromGridFilter — per-type round-trip", () => {
  // The multi-type AND-group test above proves the projection composes
  // across the supported set. These tests pin each filter type's
  // canonical-shape round-trip in isolation, so a regression in one
  // type-branch surfaces here before a host app sees it via persistence
  // or controlled-filter rehydration. The single-value `date` and
  // standalone `boolean` rows fill the gaps not exercised by the
  // existing AND-group test.
  test("text — bare contains shape", () => {
    const filter = {
      kind: "column" as const,
      columnId: "name",
      type: "text" as const,
      op: "contains",
      value: "Acme",
    }
    expect(columnFilterTextFromGridFilter(filter)).toEqual({ name: "Acme" })
    expect(buildGridFilter({ name: "Acme" })).toEqual(filter)
  })

  test("number — single-op `>=`", () => {
    const filter = {
      kind: "column" as const,
      columnId: "balance",
      type: "number" as const,
      op: ">=",
      value: 1000,
    }
    const text = columnFilterTextFromGridFilter(filter)
    expect(text.balance ? decodeNumberFilterInput(text.balance) : null).toEqual({
      op: ">=",
      value: "1000",
    })
    expect(buildGridFilter(text, { balance: "number" })).toEqual(filter)
  })

  test("date — single-op `before`", () => {
    const filter = {
      kind: "column" as const,
      columnId: "lastInvoice",
      type: "date" as const,
      op: "before",
      value: "2026-03-01",
    }
    const text = columnFilterTextFromGridFilter(filter)
    expect(text.lastInvoice).toBe(encodeDateFilterInput({ op: "before", value: "2026-03-01" }))
    expect(buildGridFilter(text, { lastInvoice: "date" })).toEqual(filter)
  })

  test("date — `between` carries both endpoints", () => {
    const filter = {
      kind: "column" as const,
      columnId: "lastInvoice",
      type: "date" as const,
      op: "between",
      values: ["2026-03-01", "2026-03-31"],
    }
    const text = columnFilterTextFromGridFilter(filter)
    expect(text.lastInvoice).toBe(
      encodeDateFilterInput({ op: "between", value: "2026-03-01", valueTo: "2026-03-31" }),
    )
    expect(buildGridFilter(text, { lastInvoice: "date" })).toEqual(filter)
  })

  test("set — `in` projects to encoded value", () => {
    const filter = {
      kind: "column" as const,
      columnId: "status",
      type: "set" as const,
      op: "in",
      values: ["Open", "Past Due"],
    }
    const text = columnFilterTextFromGridFilter(filter)
    expect(text.status ? decodeSetFilterInput(text.status) : null).toEqual({
      op: "in",
      values: ["Open", "Past Due"],
    })
    expect(buildGridFilter(text, { status: "set" })).toEqual(filter)
  })

  test("set — `blank` projects without a values entry (canonical empty shape)", () => {
    // The set filter's `blank` op is value-less by design — it asks
    // "is this cell empty / null / empty array?" — so the canonical
    // ServerColumnFilter shape produced by buildGridFilter omits the
    // `values` key entirely. The projection still encodes `values: []`
    // in `columnFilterText` so the editor's set-input round-trip works.
    const filter = {
      kind: "column" as const,
      columnId: "status",
      type: "set" as const,
      op: "blank",
    }
    const text = columnFilterTextFromGridFilter(filter)
    expect(text.status).toBe(encodeSetFilterInput({ op: "blank", values: [] }))
    expect(buildGridFilter(text, { status: "set" })).toEqual(filter)
  })

  test("boolean — standalone column projects to plain 'true' / 'false' text", () => {
    const yesFilter = {
      kind: "column" as const,
      columnId: "creditHold",
      type: "boolean" as const,
      op: "is",
      value: true,
    }
    const noFilter = {
      kind: "column" as const,
      columnId: "creditHold",
      type: "boolean" as const,
      op: "is",
      value: false,
    }
    expect(columnFilterTextFromGridFilter(yesFilter)).toEqual({ creditHold: "true" })
    expect(columnFilterTextFromGridFilter(noFilter)).toEqual({ creditHold: "false" })
    expect(buildGridFilter({ creditHold: "true" }, { creditHold: "boolean" })).toEqual(yesFilter)
    expect(buildGridFilter({ creditHold: "false" }, { creditHold: "boolean" })).toEqual(noFilter)
  })

  test("custom — drops out of the inline projection (consumer-owned shape)", () => {
    // Custom filters carry a consumer-defined operator and value shape;
    // the inline filter row is text-driven and cannot meaningfully edit
    // them. The projection drops custom entries so the inline row
    // doesn't display a stub editor for state it can't author. The
    // canonical filter is still applied to the row set — projection
    // affects only the editor surface, not the predicate.
    const filter = {
      kind: "column" as const,
      columnId: "tags",
      type: "custom" as const,
      op: "tags-any",
      values: ["finance", "audit"],
    }
    expect(columnFilterTextFromGridFilter(filter)).toEqual({})
  })
})

describe("encodeNumberRangeFilterInput / decodeNumberRangeFilterInput", () => {
  test("round-trips empty input", () => {
    expect(
      decodeNumberRangeFilterInput(encodeNumberRangeFilterInput({ value: "", valueTo: "" })),
    ).toEqual({ value: "", valueTo: "" })
  })

  test("round-trips populated input", () => {
    const input = { value: "100", valueTo: "200" }
    expect(decodeNumberRangeFilterInput(encodeNumberRangeFilterInput(input))).toEqual(input)
  })

  test("falls back to empty input on malformed JSON", () => {
    expect(decodeNumberRangeFilterInput("not json")).toEqual({ value: "", valueTo: "" })
  })

  test("normalises non-string fields to empty strings", () => {
    expect(decodeNumberRangeFilterInput(JSON.stringify({ value: 123, valueTo: null }))).toEqual({
      value: "",
      valueTo: "",
    })
  })
})

describe("encodeDateRangeFilterInput / decodeDateRangeFilterInput", () => {
  test("round-trips empty input", () => {
    expect(
      decodeDateRangeFilterInput(encodeDateRangeFilterInput({ value: "", valueTo: "" })),
    ).toEqual({ value: "", valueTo: "" })
  })

  test("round-trips populated input", () => {
    const input = { value: "2026-03-01", valueTo: "2026-03-31" }
    expect(decodeDateRangeFilterInput(encodeDateRangeFilterInput(input))).toEqual(input)
  })

  test("falls back to empty input on malformed JSON", () => {
    expect(decodeDateRangeFilterInput("not json")).toEqual({ value: "", valueTo: "" })
  })

  test("normalises non-string fields to empty strings", () => {
    expect(decodeDateRangeFilterInput(JSON.stringify({ value: 123, valueTo: null }))).toEqual({
      value: "",
      valueTo: "",
    })
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

  test("number-range filters apply inclusive between semantics", () => {
    const filter = buildGridFilter(
      { balance: encodeNumberRangeFilterInput({ value: "1000", valueTo: "2500" }) },
      { balance: "number-range" },
    )
    if (!filter) throw new Error("expected filter")

    expect(matchesGridFilter(filter, lookup({ balance: "$1,000" }))).toBe(true)
    expect(matchesGridFilter(filter, lookup({ balance: "$1,750" }))).toBe(true)
    expect(matchesGridFilter(filter, lookup({ balance: "$2,500" }))).toBe(true)
    expect(matchesGridFilter(filter, lookup({ balance: "$999" }))).toBe(false)
    expect(matchesGridFilter(filter, lookup({ balance: "$2,501" }))).toBe(false)
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

  test("date-range filters apply inclusive between semantics", () => {
    const filter = buildGridFilter(
      {
        lastInvoice: encodeDateRangeFilterInput({
          value: "2026-03-01",
          valueTo: "2026-03-31",
        }),
      },
      { lastInvoice: "date-range" },
    )
    if (!filter) throw new Error("expected filter")

    expect(matchesGridFilter(filter, lookup({ lastInvoice: "Mar 1, 2026" }))).toBe(true)
    expect(matchesGridFilter(filter, lookup({ lastInvoice: "Mar 15, 2026" }))).toBe(true)
    expect(matchesGridFilter(filter, lookup({ lastInvoice: "Mar 31, 2026" }))).toBe(true)
    expect(matchesGridFilter(filter, lookup({ lastInvoice: "Feb 28, 2026" }))).toBe(false)
    expect(matchesGridFilter(filter, lookup({ lastInvoice: "Apr 1, 2026" }))).toBe(false)
  })

  test("date-range filters prefer raw ISO values over locale-formatted display values", () => {
    const filter = buildGridFilter(
      {
        lastInvoice: encodeDateRangeFilterInput({
          value: "2026-03-01",
          valueTo: "2026-03-31",
        }),
      },
      { lastInvoice: "date-range" },
    )
    if (!filter) throw new Error("expected filter")

    expect(
      matchesGridFilter(filter, () => ({
        formattedValue: "31.03.2026",
        rawValue: "2026-03-31T00:00:00.000Z",
      })),
    ).toBe(true)
    expect(
      matchesGridFilter(filter, () => ({
        formattedValue: "01.03.2026",
        rawValue: "2026-03-01T00:00:00.000Z",
      })),
    ).toBe(true)
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

  test("set filters match any raw array item for multi-value columns", () => {
    const filter = buildGridFilter(
      { tags: encodeSetFilterInput({ op: "in", values: ["erp"] }) },
      { tags: "set" },
    )
    if (!filter) throw new Error("expected filter")

    expect(
      matchesGridFilter(filter, () => ({
        formattedValue: "Ops, ERP",
        rawValue: ["ops", "erp"],
      })),
    ).toBe(true)
    expect(
      matchesGridFilter(filter, () => ({
        formattedValue: "CRM",
        rawValue: ["crm"],
      })),
    ).toBe(false)
  })

  test("not-in set filters reject selected raw array items", () => {
    const filter = buildGridFilter(
      { tags: encodeSetFilterInput({ op: "not-in", values: ["blocked"] }) },
      { tags: "set" },
    )
    if (!filter) throw new Error("expected filter")

    expect(
      matchesGridFilter(filter, () => ({
        formattedValue: "Ops, ERP",
        rawValue: ["ops", "erp"],
      })),
    ).toBe(true)
    expect(
      matchesGridFilter(filter, () => ({
        formattedValue: "Blocked, ERP",
        rawValue: ["blocked", "erp"],
      })),
    ).toBe(false)
  })

  test("set filter value keys flatten array values for option loading", () => {
    expect(setFilterValueKeys(["erp", "", " ", "ops", "erp", null])).toEqual(["erp", "ops"])
    expect(setFilterValueKeys([["nested"], "flat"])).toEqual(["nested", "flat"])
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

describe("text filter operators — encode/decode", () => {
  test("decode falls back to plain-string contract for legacy state", () => {
    expect(decodeTextFilterInput("john")).toEqual({ op: "contains", value: "john" })
    expect(decodeTextFilterInput("")).toEqual({ op: "contains", value: "" })
  })

  test("decode rejects invalid JSON shape and treats input as plain needle", () => {
    expect(decodeTextFilterInput("{not-json")).toEqual({ op: "contains", value: "{not-json" })
    expect(decodeTextFilterInput(JSON.stringify({ op: "weird", value: "x" }))).toEqual({
      op: "contains",
      value: JSON.stringify({ op: "weird", value: "x" }),
    })
  })

  test("decode preserves operator + modifier flags", () => {
    expect(
      decodeTextFilterInput(JSON.stringify({ op: "equals", value: "John", caseSensitive: true })),
    ).toEqual({ op: "equals", value: "John", caseSensitive: true })

    expect(
      decodeTextFilterInput(
        JSON.stringify({ op: "starts-with", value: "Jo", regex: true, caseSensitive: true }),
      ),
    ).toEqual({ op: "starts-with", value: "Jo", regex: true, caseSensitive: true })
  })

  test("encode/decode round-trips structured payloads", () => {
    for (const input of [
      { op: "contains" as const, value: "needle" },
      { op: "starts-with" as const, value: "pre" },
      { op: "ends-with" as const, value: "fix" },
      { op: "equals" as const, value: "John", caseSensitive: true },
      { op: "contains" as const, value: "^AC.*$", regex: true },
    ]) {
      expect(decodeTextFilterInput(encodeTextFilterInput(input))).toEqual(input)
    }
  })
})

describe("text filter operators — buildGridFilter", () => {
  test("default contains keeps the bare canonical shape (no modifier flags)", () => {
    expect(buildGridFilter({ name: "John" })).toEqual({
      kind: "column",
      columnId: "name",
      type: "text",
      op: "contains",
      value: "John",
    })
  })

  test("structured operator payloads round-trip into ServerColumnFilter", () => {
    expect(
      buildGridFilter({
        name: encodeTextFilterInput({ op: "starts-with", value: "John" }),
      }),
    ).toEqual({
      kind: "column",
      columnId: "name",
      type: "text",
      op: "starts-with",
      value: "John",
    })

    expect(
      buildGridFilter({
        name: encodeTextFilterInput({ op: "equals", value: "John", caseSensitive: true }),
      }),
    ).toEqual({
      kind: "column",
      columnId: "name",
      type: "text",
      op: "equals",
      value: "John",
      caseSensitive: true,
    })
  })

  test("regex inputs that fail to compile are dropped at build time", () => {
    expect(
      buildGridFilter({
        name: encodeTextFilterInput({ op: "contains", value: "(unbalanced", regex: true }),
      }),
    ).toBeNull()
  })

  test("regex inputs that compile carry the regex flag through", () => {
    expect(
      buildGridFilter({
        name: encodeTextFilterInput({ op: "contains", value: "^AC.*Z$", regex: true }),
      }),
    ).toEqual({
      kind: "column",
      columnId: "name",
      type: "text",
      op: "contains",
      value: "^AC.*Z$",
      regex: true,
    })
  })

  test("whitespace-only structured value is dropped (consistent with plain string)", () => {
    expect(
      buildGridFilter({
        name: encodeTextFilterInput({ op: "equals", value: "   " }),
      }),
    ).toBeNull()
  })
})

describe("text filter operators — matchesGridFilter", () => {
  const lookup =
    (values: Record<ColumnId, string>) =>
    (columnId: ColumnId): string =>
      values[columnId] ?? ""

  test("contains is case-insensitive by default", () => {
    const filter = buildGridFilter({ name: "joHN" })
    if (!filter) throw new Error("expected filter")
    expect(matchesGridFilter(filter, lookup({ name: "Johnathan" }))).toBe(true)
    expect(matchesGridFilter(filter, lookup({ name: "Jane" }))).toBe(false)
  })

  test("contains honours caseSensitive flag", () => {
    const filter = buildGridFilter({
      name: encodeTextFilterInput({ op: "contains", value: "John", caseSensitive: true }),
    })
    if (!filter) throw new Error("expected filter")
    expect(matchesGridFilter(filter, lookup({ name: "Johnathan" }))).toBe(true)
    expect(matchesGridFilter(filter, lookup({ name: "johnathan" }))).toBe(false)
  })

  test("equals demands an exact match (case-insensitive by default)", () => {
    const filter = buildGridFilter({
      name: encodeTextFilterInput({ op: "equals", value: "John" }),
    })
    if (!filter) throw new Error("expected filter")
    expect(matchesGridFilter(filter, lookup({ name: "john" }))).toBe(true)
    expect(matchesGridFilter(filter, lookup({ name: "John" }))).toBe(true)
    expect(matchesGridFilter(filter, lookup({ name: "Johnny" }))).toBe(false)
  })

  test("equals + caseSensitive demands character-exact match", () => {
    const filter = buildGridFilter({
      name: encodeTextFilterInput({ op: "equals", value: "John", caseSensitive: true }),
    })
    if (!filter) throw new Error("expected filter")
    expect(matchesGridFilter(filter, lookup({ name: "John" }))).toBe(true)
    expect(matchesGridFilter(filter, lookup({ name: "john" }))).toBe(false)
  })

  test("starts-with / ends-with anchor the comparison (case-insensitive default)", () => {
    const startsWith = buildGridFilter({
      name: encodeTextFilterInput({ op: "starts-with", value: "Joh" }),
    })
    const endsWith = buildGridFilter({
      name: encodeTextFilterInput({ op: "ends-with", value: "doe" }),
    })
    if (!startsWith || !endsWith) throw new Error("expected filters")

    expect(matchesGridFilter(startsWith, lookup({ name: "Johnathan Doe" }))).toBe(true)
    expect(matchesGridFilter(startsWith, lookup({ name: "John" }))).toBe(true)
    expect(matchesGridFilter(startsWith, lookup({ name: "Anna Joh" }))).toBe(false)

    expect(matchesGridFilter(endsWith, lookup({ name: "John Doe" }))).toBe(true)
    expect(matchesGridFilter(endsWith, lookup({ name: "Doe John" }))).toBe(false)
  })

  test("starts-with honours caseSensitive flag", () => {
    const filter = buildGridFilter({
      name: encodeTextFilterInput({
        op: "starts-with",
        value: "Joh",
        caseSensitive: true,
      }),
    })
    if (!filter) throw new Error("expected filter")
    expect(matchesGridFilter(filter, lookup({ name: "Johnathan Doe" }))).toBe(true)
    expect(matchesGridFilter(filter, lookup({ name: "johnathan doe" }))).toBe(false)
  })

  test("regex flag overrides operator and matches as a pattern", () => {
    const filter = buildGridFilter({
      name: encodeTextFilterInput({ op: "contains", value: "^AC[0-9]+$", regex: true }),
    })
    if (!filter) throw new Error("expected filter")
    expect(matchesGridFilter(filter, lookup({ name: "AC123" }))).toBe(true)
    expect(matchesGridFilter(filter, lookup({ name: "ac123" }))).toBe(true)
    expect(matchesGridFilter(filter, lookup({ name: "ZAC123" }))).toBe(false)
  })

  test("regex + caseSensitive distinguishes letter case", () => {
    const filter = buildGridFilter({
      name: encodeTextFilterInput({
        op: "contains",
        value: "^AC[0-9]+$",
        regex: true,
        caseSensitive: true,
      }),
    })
    if (!filter) throw new Error("expected filter")
    expect(matchesGridFilter(filter, lookup({ name: "AC123" }))).toBe(true)
    expect(matchesGridFilter(filter, lookup({ name: "ac123" }))).toBe(false)
  })

  test("missing column treated as empty value across operators", () => {
    const equalsFilter = buildGridFilter({
      name: encodeTextFilterInput({ op: "equals", value: "John" }),
    })
    if (!equalsFilter) throw new Error("expected filter")
    expect(matchesGridFilter(equalsFilter, lookup({}))).toBe(false)
  })
})

describe("text filter operators — persistence round-trip", () => {
  test("default contains persists as plain string for legacy compat", () => {
    const filter = buildGridFilter({ name: "John" })
    if (!filter) throw new Error("expected filter")
    const text = columnFilterTextFromGridFilter(filter)
    expect(text).toEqual({ name: "John" })
    expect(buildGridFilter(text)).toEqual(filter)
  })

  test("operator + modifier payload persists as JSON and round-trips", () => {
    const filter = buildGridFilter({
      name: encodeTextFilterInput({ op: "equals", value: "John", caseSensitive: true }),
    })
    if (!filter) throw new Error("expected filter")
    const text = columnFilterTextFromGridFilter(filter)
    expect(buildGridFilter(text)).toEqual(filter)

    const decoded = decodeTextFilterInput(text.name ?? "")
    expect(decoded).toEqual({ op: "equals", value: "John", caseSensitive: true })
  })

  test("regex payload persists as JSON and round-trips", () => {
    const filter = buildGridFilter({
      name: encodeTextFilterInput({ op: "contains", value: "^AC[0-9]+$", regex: true }),
    })
    if (!filter) throw new Error("expected filter")
    const text = columnFilterTextFromGridFilter(filter)
    expect(buildGridFilter(text)).toEqual(filter)
  })

  test("clearing a text filter erases its column entry (no zombie key)", () => {
    expect(columnFilterTextFromGridFilter(null)).toEqual({})
    expect(columnFilterTextEqual(columnFilterTextFromGridFilter(null), {})).toBe(true)
  })
})

describe("text filter — legacy state compatibility (pre-operators)", () => {
  // These tests explicitly pin the contract that pre-`filter-text-impl-extend`
  // state shapes still work without any host-app migration. A bc-grid v0.2
  // app that persisted `{ name: "Acme" }` (plain-string `columnFilterText`)
  // must produce the exact same row-set matches against the
  // operator-aware v0.3 predicate.
  const lookup =
    (values: Record<ColumnId, string>) =>
    (columnId: ColumnId): string =>
      values[columnId] ?? ""

  test("plain-string state parses to default contains+no-modifier draft", () => {
    // The decode path is the bridge. A bare needle decodes to the
    // canonical default — case-insensitive contains, no regex.
    expect(decodeTextFilterInput("Acme")).toEqual({ op: "contains", value: "Acme" })
  })

  test("legacy plain-string filter narrows rows identically to a fresh contains filter", () => {
    const legacy = buildGridFilter({ name: "Acme" })
    const fresh = buildGridFilter({
      name: encodeTextFilterInput({ op: "contains", value: "Acme" }),
    })
    if (!legacy || !fresh) throw new Error("expected filters")
    // Both decode to the same canonical ServerColumnFilter (no modifier
    // flags). Tested above; assert here too as a sanity check at the
    // build boundary.
    expect(legacy).toEqual(fresh)

    // And both predicates narrow the same rows. Case-insensitive by
    // default; the matcher accepts a row whose formatted Account
    // column contains "acme corp" because of the case fold.
    for (const filter of [legacy, fresh]) {
      expect(matchesGridFilter(filter, lookup({ name: "Acme Corp" }))).toBe(true)
      expect(matchesGridFilter(filter, lookup({ name: "ACME CORP" }))).toBe(true)
      expect(matchesGridFilter(filter, lookup({ name: "Beta Co" }))).toBe(false)
    }
  })

  test("legacy state co-exists with structured state on a sibling column", () => {
    // Mixed shape: one column persisted as a plain string (legacy),
    // another column persisted as a JSON operator payload (post-v0.3).
    // The combined `BcGridFilter` must apply both predicates with AND.
    const filter = buildGridFilter(
      {
        name: "Acme", // legacy plain-string
        notes: encodeTextFilterInput({ op: "starts-with", value: "VIP" }),
      },
      // Both columns have type "text" but the second uses the
      // structured shape. columnFilterTypes only affects non-text
      // disambiguation; text is handled by decodeTextFilterInput.
      {},
    )
    if (!filter) throw new Error("expected filter")
    expect(filter.kind).toBe("group")

    expect(matchesGridFilter(filter, lookup({ name: "Acme Corp", notes: "VIP customer" }))).toBe(
      true,
    )
    // name matches but notes doesn't start with "VIP"
    expect(matchesGridFilter(filter, lookup({ name: "Acme Corp", notes: "Standard" }))).toBe(false)
    // notes starts with "VIP" but name doesn't match
    expect(matchesGridFilter(filter, lookup({ name: "Beta Co", notes: "VIP customer" }))).toBe(
      false,
    )
  })

  test("a structured payload that round-trips through plain string still matches identically", () => {
    // If a future migration tool reads structured persistence, drops
    // modifier flags, and re-serialises as a plain string, the
    // resulting filter must behave identically to a fresh
    // contains-no-modifier filter on the same value.
    const structured = encodeTextFilterInput({ op: "contains", value: "Acme" })
    const legacy = JSON.parse(structured).value as string

    const fromStructured = buildGridFilter({ name: structured })
    const fromLegacy = buildGridFilter({ name: legacy })
    if (!fromStructured || !fromLegacy) throw new Error("expected filters")

    expect(fromStructured).toEqual(fromLegacy)
  })
})

describe("removeColumnFromFilter", () => {
  test("returns null when input is null/undefined", () => {
    expect(removeColumnFromFilter(null, "name")).toBeNull()
    expect(removeColumnFromFilter(undefined, "name")).toBeNull()
  })

  test("returns null when the bare column filter matches the target", () => {
    const filter = buildGridFilter({ name: "John" })
    if (!filter) throw new Error("expected filter")
    expect(removeColumnFromFilter(filter, "name")).toBeNull()
  })

  test("returns the original filter when no leaf matches", () => {
    const filter = buildGridFilter({ name: "John" })
    if (!filter) throw new Error("expected filter")
    expect(removeColumnFromFilter(filter, "email")).toEqual(filter)
  })

  test("collapses to a single child when only one survives in an AND group", () => {
    const filter = buildGridFilter({ name: "John", email: "@acme" })
    if (!filter) throw new Error("expected filter")
    const next = removeColumnFromFilter(filter, "email")
    expect(next).toEqual({
      kind: "column",
      columnId: "name",
      type: "text",
      op: "contains",
      value: "John",
    })
  })

  test("preserves group when multiple children remain", () => {
    const filter = buildGridFilter({ name: "John", email: "@acme", region: "EU" })
    if (!filter) throw new Error("expected filter")
    const next = removeColumnFromFilter(filter, "email")
    expect(next?.kind).toBe("group")
    if (next?.kind === "group") {
      expect(next.op).toBe("and")
      expect(next.filters).toHaveLength(2)
      const cols = next.filters
        .map((child) => (child.kind === "column" ? child.columnId : null))
        .filter(Boolean)
      expect(cols).toEqual(["name", "region"])
    }
  })

  test("recurses into nested OR groups, collapsing empty branches", () => {
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
    const next = removeColumnFromFilter(filter, "tier")
    // The OR branch collapses to a single column-leaf, which then collapses
    // the surrounding AND group into a two-leaf group.
    expect(next?.kind).toBe("group")
    if (next?.kind === "group") {
      expect(next.op).toBe("and")
      expect(next.filters).toHaveLength(2)
    }
  })

  test("removing every column collapses the filter tree to null", () => {
    const filter = buildGridFilter({ name: "John", email: "@acme" })
    if (!filter) throw new Error("expected filter")
    const afterFirst = removeColumnFromFilter(filter, "name")
    const afterSecond = removeColumnFromFilter(afterFirst, "email")
    expect(afterSecond).toBeNull()
  })
})

describe("filterHasColumn", () => {
  test("null/undefined inputs do not contain any column", () => {
    expect(filterHasColumn(null, "name")).toBe(false)
    expect(filterHasColumn(undefined, "name")).toBe(false)
  })

  test("matches a bare column-leaf filter", () => {
    const filter = buildGridFilter({ name: "John" })
    if (!filter) throw new Error("expected filter")
    expect(filterHasColumn(filter, "name")).toBe(true)
    expect(filterHasColumn(filter, "email")).toBe(false)
  })

  test("walks AND/OR groups to find leaves", () => {
    const filter = buildGridFilter({ name: "John", email: "@acme" })
    if (!filter) throw new Error("expected filter")
    expect(filterHasColumn(filter, "name")).toBe(true)
    expect(filterHasColumn(filter, "email")).toBe(true)
    expect(filterHasColumn(filter, "region")).toBe(false)
  })

  test("walks nested OR branches", () => {
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
          ],
        },
      ],
    }
    expect(filterHasColumn(filter, "tier")).toBe(true)
    expect(filterHasColumn(filter, "region")).toBe(false)
  })
})

describe("filterSetFilterOptions", () => {
  // The set-filter menu's search input narrows the option list using
  // this helper. Both label and value match case-insensitively so a
  // user can type either the displayed text (e.g. "Past Due") or the
  // raw underlying value (e.g. "past_due") — useful when the column
  // formats raw status keys into human-readable labels.
  const options = [
    { value: "open", label: "Open" },
    { value: "past_due", label: "Past Due" },
    { value: "closed", label: "Closed" },
    { value: "draft", label: "Draft" },
  ]

  test("empty / whitespace query returns every option (cloned)", () => {
    const result = filterSetFilterOptions(options, "")
    expect(result).toEqual(options)
    // Clone — caller can mutate the result without affecting the input.
    expect(result).not.toBe(options)

    expect(filterSetFilterOptions(options, "   ")).toEqual(options)
  })

  test("matches the label case-insensitively", () => {
    expect(filterSetFilterOptions(options, "open")).toEqual([{ value: "open", label: "Open" }])
    expect(filterSetFilterOptions(options, "OPEN")).toEqual([{ value: "open", label: "Open" }])
    expect(filterSetFilterOptions(options, "past")).toEqual([
      { value: "past_due", label: "Past Due" },
    ])
  })

  test("matches the underlying value too (raw-key search)", () => {
    expect(filterSetFilterOptions(options, "past_due")).toEqual([
      { value: "past_due", label: "Past Due" },
    ])
  })

  test("empty result for a query that matches nothing", () => {
    expect(filterSetFilterOptions(options, "void")).toEqual([])
  })

  test("partial substrings match in either field", () => {
    // "d" appears in "Past Due", "Draft", and "Closed" labels and
    // "past_due", "draft", "closed" values. All three returned.
    const result = filterSetFilterOptions(options, "d")
    expect(result.map((o) => o.value)).toEqual(["past_due", "closed", "draft"])
  })
})

describe("nextSetFilterValuesOnToggleAll", () => {
  // The set-filter menu's "Select all" / "Clear all" affordance toggles
  // every visible (search-narrowed) option in or out of the selection,
  // preserving selections for options hidden by the active search
  // query. The helper is pure so the menu's bulk-toggle behaviour is
  // unit-testable without rendering.
  test("adds every visible option when none are selected", () => {
    const visible = [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ]
    expect(nextSetFilterValuesOnToggleAll(visible, [])).toEqual(["a", "b"])
  })

  test("adds only the missing visible options when some are already selected", () => {
    const visible = [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
      { value: "c", label: "C" },
    ]
    expect(nextSetFilterValuesOnToggleAll(visible, ["b"])).toEqual(["b", "a", "c"])
  })

  test("clears every visible option when all visible are selected", () => {
    const visible = [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ]
    expect(nextSetFilterValuesOnToggleAll(visible, ["a", "b"])).toEqual([])
  })

  test("preserves selections for options hidden by the search query", () => {
    // visible = filtered subset, current = full selection. Toggling
    // all-visible-on with one already selected adds the missing visible,
    // and the off-screen "z" stays put.
    const visible = [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ]
    expect(nextSetFilterValuesOnToggleAll(visible, ["a", "z"])).toEqual(["a", "z", "b"])

    // Toggling all-visible-off when both visible are selected removes
    // them, but "z" survives.
    expect(nextSetFilterValuesOnToggleAll(visible, ["a", "b", "z"])).toEqual(["z"])
  })

  test("empty visible list is a no-op", () => {
    expect(nextSetFilterValuesOnToggleAll([], ["a", "b"])).toEqual(["a", "b"])
  })
})
