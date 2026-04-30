import { describe, expect, test } from "bun:test"
import type { ColumnId } from "@bc-grid/core"
import {
  buildGridFilter,
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
  matchesGridFilter,
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

  test("text inputs honour the chosen operator + caseSensitive + regex flags", () => {
    expect(
      buildGridFilter({ name: encodeTextFilterInput({ op: "starts-with", value: "Acme" }) }),
    ).toEqual({
      kind: "column",
      columnId: "name",
      type: "text",
      op: "starts-with",
      value: "Acme",
    })

    expect(
      buildGridFilter({
        name: encodeTextFilterInput({ op: "equals", value: "Acme", caseSensitive: true }),
      }),
    ).toEqual({
      kind: "column",
      columnId: "name",
      type: "text",
      op: "equals",
      value: "Acme",
      caseSensitive: true,
    })

    expect(
      buildGridFilter({
        name: encodeTextFilterInput({ op: "contains", value: "^A.*e$", regex: true }),
      }),
    ).toEqual({
      kind: "column",
      columnId: "name",
      type: "text",
      op: "contains",
      value: "^A.*e$",
      regex: true,
    })
  })

  test("text inputs drop the filter when the regex pattern fails to compile", () => {
    expect(
      buildGridFilter({
        name: encodeTextFilterInput({ op: "contains", value: "(unterminated", regex: true }),
      }),
    ).toBeNull()
  })

  test("default-off modifier flags are stripped from the canonical shape", () => {
    expect(
      buildGridFilter({
        name: encodeTextFilterInput({
          op: "contains",
          value: "Acme",
          caseSensitive: false,
          regex: false,
        }),
      }),
    ).toEqual({
      kind: "column",
      columnId: "name",
      type: "text",
      op: "contains",
      value: "Acme",
    })
  })

  test("clearing the editor value drops the text filter (null when last)", () => {
    // Preserves the clear-state behavior from #200: when every text
    // filter slot is empty, buildGridFilter must emit null. The
    // operator + modifier toggles are irrelevant to the empty-value
    // short-circuit — an empty needle is treated as match-all and
    // dropped at parseTextFilterInput's value trim guard.
    expect(
      buildGridFilter({
        name: encodeTextFilterInput({ op: "starts-with", value: "" }),
      }),
    ).toBeNull()
    expect(
      buildGridFilter({
        name: encodeTextFilterInput({ op: "contains", value: "   ", caseSensitive: true }),
      }),
    ).toBeNull()
    expect(
      buildGridFilter({
        name: encodeTextFilterInput({ op: "equals", value: "", regex: true }),
      }),
    ).toBeNull()
    // Legacy plain-string clear path still emits null.
    expect(buildGridFilter({ name: "" })).toBeNull()
    expect(buildGridFilter({ name: "  " })).toBeNull()
  })
})

describe("columnFilterTextFromGridFilter", () => {
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

describe("encodeTextFilterInput / decodeTextFilterInput", () => {
  test("legacy plain strings decode as a contains shortcut", () => {
    expect(decodeTextFilterInput("Acme")).toEqual({ op: "contains", value: "Acme" })
    expect(decodeTextFilterInput("")).toEqual({ op: "contains", value: "" })
  })

  test("falls back to contains shortcut when JSON shape is unrecognised", () => {
    expect(decodeTextFilterInput("{not parseable")).toEqual({
      op: "contains",
      value: "{not parseable",
    })
    expect(decodeTextFilterInput(JSON.stringify({ op: "starts-with" }))).toEqual({
      op: "contains",
      value: JSON.stringify({ op: "starts-with" }),
    })
    expect(decodeTextFilterInput(JSON.stringify({ op: "unknown", value: "x" }))).toEqual({
      op: "contains",
      value: JSON.stringify({ op: "unknown", value: "x" }),
    })
  })

  test("round-trips populated input with modifier flags", () => {
    const input = {
      op: "ends-with" as const,
      value: "Inc",
      caseSensitive: true,
      regex: true,
    }
    expect(decodeTextFilterInput(encodeTextFilterInput(input))).toEqual(input)
  })

  test("decodes default-off modifiers as omitted", () => {
    expect(decodeTextFilterInput(encodeTextFilterInput({ op: "equals", value: "Acme" }))).toEqual({
      op: "equals",
      value: "Acme",
    })
  })
})

describe("columnFilterTextFromGridFilter — text persistence round-trip", () => {
  test("default contains+no-modifier filter persists as a plain-string for legacy compat", () => {
    const filter = {
      kind: "column" as const,
      columnId: "name",
      type: "text" as const,
      op: "contains",
      value: "Acme",
    }
    const text = columnFilterTextFromGridFilter(filter)
    expect(text.name).toBe("Acme")
    // And the round-trip back through buildGridFilter preserves the shape.
    expect(buildGridFilter(text)).toEqual(filter)
  })

  test("non-default text filter persists as JSON; round-trip preserves modifier flags", () => {
    const filter = {
      kind: "column" as const,
      columnId: "name",
      type: "text" as const,
      op: "starts-with",
      value: "Ac",
      caseSensitive: true,
    }
    const text = columnFilterTextFromGridFilter(filter)
    expect(text.name ? decodeTextFilterInput(text.name) : null).toEqual({
      op: "starts-with",
      value: "Ac",
      caseSensitive: true,
    })
    expect(buildGridFilter(text)).toEqual(filter)
  })

  test("regex filter persists as JSON; round-trip preserves the regex flag", () => {
    const filter = {
      kind: "column" as const,
      columnId: "name",
      type: "text" as const,
      op: "contains",
      value: "^A.*e$",
      regex: true,
    }
    const text = columnFilterTextFromGridFilter(filter)
    expect(text.name ? decodeTextFilterInput(text.name) : null).toEqual({
      op: "contains",
      value: "^A.*e$",
      regex: true,
    })
    expect(buildGridFilter(text)).toEqual(filter)
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

  test("starts-with / ends-with / equals operators apply (case-insensitive default)", () => {
    const startsWith = buildGridFilter({
      name: encodeTextFilterInput({ op: "starts-with", value: "Ac" }),
    })
    const endsWith = buildGridFilter({
      name: encodeTextFilterInput({ op: "ends-with", value: "Co" }),
    })
    const equals = buildGridFilter({
      name: encodeTextFilterInput({ op: "equals", value: "Acme" }),
    })
    if (!startsWith || !endsWith || !equals) throw new Error("expected filters")

    expect(matchesGridFilter(startsWith, lookup({ name: "Acme Inc" }))).toBe(true)
    expect(matchesGridFilter(startsWith, lookup({ name: "macme" }))).toBe(false)
    expect(matchesGridFilter(endsWith, lookup({ name: "Acme & Co" }))).toBe(true)
    expect(matchesGridFilter(endsWith, lookup({ name: "Acme Co Inc" }))).toBe(false)
    expect(matchesGridFilter(equals, lookup({ name: "ACME" }))).toBe(true)
    expect(matchesGridFilter(equals, lookup({ name: "Acme Inc" }))).toBe(false)
  })

  test("caseSensitive toggle requires exact case match across operators", () => {
    const containsCs = buildGridFilter({
      name: encodeTextFilterInput({ op: "contains", value: "Acme", caseSensitive: true }),
    })
    const startsCs = buildGridFilter({
      name: encodeTextFilterInput({ op: "starts-with", value: "Ac", caseSensitive: true }),
    })
    const equalsCs = buildGridFilter({
      name: encodeTextFilterInput({ op: "equals", value: "Acme", caseSensitive: true }),
    })
    if (!containsCs || !startsCs || !equalsCs) throw new Error("expected filters")

    expect(matchesGridFilter(containsCs, lookup({ name: "Acme Inc" }))).toBe(true)
    expect(matchesGridFilter(containsCs, lookup({ name: "ACME INC" }))).toBe(false)
    expect(matchesGridFilter(startsCs, lookup({ name: "Acme Inc" }))).toBe(true)
    expect(matchesGridFilter(startsCs, lookup({ name: "ACME INC" }))).toBe(false)
    expect(matchesGridFilter(equalsCs, lookup({ name: "Acme" }))).toBe(true)
    expect(matchesGridFilter(equalsCs, lookup({ name: "ACME" }))).toBe(false)
  })

  test("regex toggle ignores op and matches by .test() semantics", () => {
    const insensitive = buildGridFilter({
      name: encodeTextFilterInput({ op: "equals", value: "^A.*e$", regex: true }),
    })
    const sensitive = buildGridFilter({
      name: encodeTextFilterInput({
        op: "contains",
        value: "^A.*e$",
        regex: true,
        caseSensitive: true,
      }),
    })
    if (!insensitive || !sensitive) throw new Error("expected filters")

    expect(matchesGridFilter(insensitive, lookup({ name: "Acme" }))).toBe(true)
    expect(matchesGridFilter(insensitive, lookup({ name: "ACME" }))).toBe(true)
    expect(matchesGridFilter(insensitive, lookup({ name: "Acmes Inc" }))).toBe(false)
    expect(matchesGridFilter(sensitive, lookup({ name: "Acme" }))).toBe(true)
    expect(matchesGridFilter(sensitive, lookup({ name: "ACME" }))).toBe(false)
  })

  test("matchesGridFilter swallows regex compile errors at match time", () => {
    // Hand-built filter with an invalid pattern bypasses parse-time guard.
    // The predicate must not throw — the row simply doesn't match.
    const badRegex = {
      kind: "column" as const,
      columnId: "name",
      type: "text" as const,
      op: "contains",
      value: "(unterminated",
      regex: true,
    }
    expect(matchesGridFilter(badRegex, lookup({ name: "anything" }))).toBe(false)
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
