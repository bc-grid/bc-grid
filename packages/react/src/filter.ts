import type {
  BcColumnFilter,
  BcGridFilter,
  ColumnId,
  ServerColumnFilter,
  ServerFilter,
} from "@bc-grid/core"

/**
 * Internal column-filter state held by `<BcGrid>`. One entry per column
 * with a non-empty filter input. Map keys are `ColumnId`s; values are
 * the raw string the user typed.
 *
 * Lives outside the React component so the filter algebra is unit-
 * testable without a DOM.
 */
export type ColumnFilterText = Readonly<Record<ColumnId, string>>
export type ColumnFilterTypeByColumnId = Readonly<Record<ColumnId, BcColumnFilter["type"]>>

/**
 * Convert per-column text inputs into the canonical `BcGridFilter`
 * (= `ServerFilter`) shape from `@bc-grid/core`. Returns `null` when
 * every input is empty (no filter active). Single non-empty input
 * returns a bare `ServerColumnFilter`; multiple inputs AND together
 * inside a `ServerFilterGroup`.
 *
 * Op: `"contains"` for v0 — case-insensitive substring match. The op
 * label is informative; the runtime matcher (`matchesColumnFilter`)
 * owns the actual semantics.
 */
export function buildGridFilter(
  text: ColumnFilterText,
  filterTypes: ColumnFilterTypeByColumnId = {},
): BcGridFilter | null {
  const filters: ServerColumnFilter[] = []
  for (const [columnId, raw] of Object.entries(text)) {
    const value = raw.trim()
    if (value.length === 0) continue
    const filterType = filterTypes[columnId] ?? "text"
    if (filterType === "boolean") {
      if (value !== "true" && value !== "false") continue
      filters.push({ kind: "column", columnId, type: "boolean", op: "is", value: value === "true" })
      continue
    }
    filters.push({ kind: "column", columnId, type: "text", op: "contains", value })
  }
  if (filters.length === 0) return null
  if (filters.length === 1 && filters[0]) return filters[0]
  return { kind: "group", op: "and", filters }
}

/**
 * Test whether a single formatted cell value matches a column filter.
 * v0 supports only `type: "text"` with `op: "contains"`; other ops fall
 * through to "no match" (Q2 will fill them in).
 */
function matchesColumnFilter(formattedValue: string, filter: ServerColumnFilter): boolean {
  if (filter.type === "boolean") {
    if (filter.op !== "is") return false
    const actual = parseFormattedBoolean(formattedValue)
    return actual != null && actual === Boolean(filter.value)
  }
  if (filter.type !== "text") return false
  if (filter.op !== "contains") return false
  const needle = String(filter.value ?? "").toLowerCase()
  if (needle.length === 0) return true
  return formattedValue.toLowerCase().includes(needle)
}

/**
 * Test whether a row matches a `BcGridFilter` tree. Recursive over
 * group `op: "and"` / `op: "or"`. The caller supplies a per-column
 * `formattedValue` lookup (we use the column's `valueFormatter` so
 * filter results match what the user *sees*, not the raw value).
 */
export function matchesGridFilter(
  filter: BcGridFilter,
  formattedValueByColumnId: (columnId: ColumnId) => string,
): boolean {
  if (filter.kind === "column") {
    return matchesColumnFilter(formattedValueByColumnId(filter.columnId), filter)
  }
  if (filter.op === "and") {
    return filter.filters.every((child: ServerFilter) =>
      matchesGridFilter(child, formattedValueByColumnId),
    )
  }
  return filter.filters.some((child: ServerFilter) =>
    matchesGridFilter(child, formattedValueByColumnId),
  )
}

function parseFormattedBoolean(value: string): boolean | null {
  const normalised = value.trim().toLowerCase()
  if (normalised === "yes" || normalised === "true" || normalised === "1") return true
  if (normalised === "no" || normalised === "false" || normalised === "0") return false
  return null
}
