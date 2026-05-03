import { describe, expect, test } from "bun:test"
import type { ServerFilter } from "@bc-grid/core"
import {
  columnFilterFromSerializedCriteria,
  createFilterRegistry,
  dateFilter,
  matchesFilter,
  setFilter,
  textFilter,
} from "../src/index"

describe("@bc-grid/filters registry", () => {
  test("registers and looks up filter definitions by type", () => {
    const registry = createFilterRegistry([])
    registry.register({
      type: "priority-prefix",
      predicate: (value, criteria) => value.formattedValue.startsWith(String(criteria)),
      serialize: (criteria) => String(criteria),
      parse: (serialized) => serialized.trim(),
    })

    expect(registry.has("priority-prefix")).toBe(true)
    expect(registry.get("priority-prefix")?.parse("VIP")).toBe("VIP")
    expect(registry.entries().map((definition) => definition.type)).toEqual(["priority-prefix"])
  })

  test("rejects duplicate registrations", () => {
    const registry = createFilterRegistry([textFilter])
    expect(() => registry.register(textFilter)).toThrow(/already registered/)
  })

  test("uses built-in predicates through matchesFilter", () => {
    const filter: ServerFilter = {
      kind: "group",
      op: "and",
      filters: [
        { kind: "column", columnId: "name", type: "text", op: "contains", value: "acme" },
        { kind: "column", columnId: "balance", type: "number", op: ">=", value: 1000 },
      ],
    }

    expect(
      matchesFilter(filter, (columnId) =>
        columnId === "name" ? "Acme Trading" : { formattedValue: "$1,250", rawValue: 1250 },
      ),
    ).toBe(true)
    expect(
      matchesFilter(filter, (columnId) =>
        columnId === "name" ? "Acme Trading" : { formattedValue: "$950", rawValue: 950 },
      ),
    ).toBe(false)
  })

  test("registered filters build ServerColumnFilter drafts from serialized criteria", () => {
    const registry = createFilterRegistry([])
    registry.register({
      type: "starts-with",
      predicate: (value, criteria) => value.formattedValue.startsWith(String(criteria)),
      serialize: (criteria) => String(criteria),
      parse: (serialized) => serialized.trim(),
    })

    expect(
      columnFilterFromSerializedCriteria({
        columnId: "code",
        serialized: "VIP",
        type: "starts-with",
        registry,
      }),
    ).toEqual({
      kind: "column",
      columnId: "code",
      type: "starts-with",
      op: "custom",
      value: "VIP",
    })
  })

  test("unknown filter types are safe no-match", () => {
    const filter: ServerFilter = {
      kind: "column",
      columnId: "name",
      type: "not-registered",
      op: "custom",
      value: "Acme",
    }
    const unknown: string[] = []

    expect(
      matchesFilter(filter, () => "Acme Trading", {
        onUnknownFilter: (type) => unknown.push(type),
      }),
    ).toBe(false)
    expect(unknown).toEqual(["not-registered"])
  })

  test("built-in definitions expose operator metadata", () => {
    expect(textFilter.operators?.map((operator) => operator.op)).toContain("does-not-contain")
    expect(textFilter.operators?.map((operator) => operator.op)).toContain("current-user")
    expect(dateFilter.operators?.map((operator) => operator.op)).toContain("last-n-days")
    expect(dateFilter.operators?.map((operator) => operator.op)).toContain("this-fiscal-year")
    expect(setFilter.operators?.map((operator) => operator.op)).toContain("current-team")
  })

  test("text negative operators use the built-in registry predicate", () => {
    expect(
      matchesFilter(
        { kind: "column", columnId: "name", type: "text", op: "does-not-contain", value: "hold" },
        () => "Ready for invoice",
      ),
    ).toBe(true)
    expect(
      matchesFilter(
        { kind: "column", columnId: "name", type: "text", op: "does-not-contain", value: "hold" },
        () => "On hold",
      ),
    ).toBe(false)
    expect(
      matchesFilter(
        { kind: "column", columnId: "name", type: "text", op: "not-equals", value: "closed" },
        () => "Open",
      ),
    ).toBe(true)
    expect(
      matchesFilter(
        { kind: "column", columnId: "name", type: "text", op: "not-equals", value: "closed" },
        () => "Closed",
      ),
    ).toBe(false)
    expect(
      matchesFilter(
        {
          kind: "column",
          columnId: "name",
          type: "text",
          op: "does-not-contain",
          value: "^hold",
          regex: true,
        },
        () => "Ready",
      ),
    ).toBe(true)
    expect(
      matchesFilter(
        {
          kind: "column",
          columnId: "name",
          type: "text",
          op: "does-not-contain",
          value: "^hold",
          regex: true,
        },
        () => "Hold for review",
      ),
    ).toBe(false)
  })

  test("date not-equals uses the built-in registry predicate", () => {
    expect(
      matchesFilter(
        { kind: "column", columnId: "due", type: "date", op: "not-equals", value: "2026-05-13" },
        () => "2026-05-12",
      ),
    ).toBe(true)
    expect(
      matchesFilter(
        { kind: "column", columnId: "due", type: "date", op: "not-equals", value: "2026-05-13" },
        () => "2026-05-13",
      ),
    ).toBe(false)
  })

  test("relative date operators resolve against injected now", () => {
    const now = "2026-05-13"

    expect(
      matchesFilter(
        { kind: "column", columnId: "due", type: "date", op: "today" },
        () => "2026-05-13",
        { context: { now } },
      ),
    ).toBe(true)
    expect(
      matchesFilter(
        { kind: "column", columnId: "due", type: "date", op: "yesterday" },
        () => "2026-05-12",
        { context: { now } },
      ),
    ).toBe(true)
    expect(
      matchesFilter(
        { kind: "column", columnId: "due", type: "date", op: "this-week" },
        () => "2026-05-11",
        { context: { now } },
      ),
    ).toBe(true)
    expect(
      matchesFilter(
        { kind: "column", columnId: "due", type: "date", op: "this-week" },
        () => "2026-05-18",
        { context: { now } },
      ),
    ).toBe(false)
    expect(
      matchesFilter(
        { kind: "column", columnId: "due", type: "date", op: "last-week" },
        () => "2026-05-10",
        { context: { now } },
      ),
    ).toBe(true)
    expect(
      matchesFilter(
        { kind: "column", columnId: "due", type: "date", op: "last-n-days", value: 7 },
        () => "2026-05-07",
        { context: { now } },
      ),
    ).toBe(true)
    expect(
      matchesFilter(
        { kind: "column", columnId: "due", type: "date", op: "last-n-days", value: 7 },
        () => "2026-05-06",
        { context: { now } },
      ),
    ).toBe(false)
    expect(
      matchesFilter(
        { kind: "column", columnId: "due", type: "date", op: "this-month" },
        () => "2026-05-31",
        { context: { now } },
      ),
    ).toBe(true)
    expect(
      matchesFilter(
        { kind: "column", columnId: "due", type: "date", op: "last-month" },
        () => "2026-04-30",
        { context: { now } },
      ),
    ).toBe(true)
  })

  test("fiscal date operators use the supplied fiscal calendar", () => {
    const context = {
      now: "2026-08-15",
      fiscalCalendar: { startMonth: 7, startDay: 1 },
    }

    expect(
      matchesFilter(
        { kind: "column", columnId: "postedOn", type: "date", op: "this-fiscal-year" },
        () => "2026-07-01",
        { context },
      ),
    ).toBe(true)
    expect(
      matchesFilter(
        { kind: "column", columnId: "postedOn", type: "date", op: "this-fiscal-year" },
        () => "2026-06-30",
        { context },
      ),
    ).toBe(false)
    expect(
      matchesFilter(
        { kind: "column", columnId: "postedOn", type: "date", op: "this-fiscal-quarter" },
        () => "2026-09-30",
        { context },
      ),
    ).toBe(true)
    expect(
      matchesFilter(
        { kind: "column", columnId: "postedOn", type: "date", op: "this-fiscal-quarter" },
        () => "2026-10-01",
        { context },
      ),
    ).toBe(false)
    expect(
      matchesFilter(
        { kind: "column", columnId: "postedOn", type: "date", op: "last-fiscal-quarter" },
        () => "2026-06-30",
        { context },
      ),
    ).toBe(true)
    expect(
      matchesFilter(
        { kind: "column", columnId: "postedOn", type: "date", op: "last-fiscal-year" },
        () => "2026-06-30",
        { context },
      ),
    ).toBe(true)
    expect(
      matchesFilter(
        { kind: "column", columnId: "postedOn", type: "date", op: "last-fiscal-year" },
        () => "2026-07-01",
        { context },
      ),
    ).toBe(false)
  })

  test("current user and current team operators use host context", () => {
    const context = { user: { id: "u-1", teamIds: ["sales", "ops"] } }

    expect(
      matchesFilter(
        { kind: "column", columnId: "ownerId", type: "text", op: "current-user" },
        () => ({ formattedValue: "Alice", rawValue: "u-1" }),
        { context },
      ),
    ).toBe(true)
    expect(
      matchesFilter(
        { kind: "column", columnId: "ownerId", type: "text", op: "current-user" },
        () => ({ formattedValue: "Bob", rawValue: "u-2" }),
        { context },
      ),
    ).toBe(false)
    expect(
      matchesFilter(
        { kind: "column", columnId: "teamIds", type: "set", op: "current-team" },
        () => ({ formattedValue: "Ops, Support", rawValue: ["ops", "support"] }),
        { context },
      ),
    ).toBe(true)
  })
})
