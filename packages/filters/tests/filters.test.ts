import { describe, expect, test } from "bun:test"
import type { ServerFilter } from "@bc-grid/core"
import {
  columnFilterFromSerializedCriteria,
  createFilterRegistry,
  matchesFilter,
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
})
