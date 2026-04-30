# RFC: Filter Registry (filter-registry-rfc)

**Status:** Draft for review
**Owner:** c2 (auditor + coordinator)
**Reviewer:** fresh agent (target: x1 or c1)
**Blocks:** `filter-set-impl`, `filter-multi-impl`, `filter-date-range-impl`, `filter-number-range-impl`, `filter-text-impl-extend`, `filter-custom-extension-example`, `filter-persistence`, `tool-panel-filters` (Track 5), `set-filter-ui` (Phase 5.5). `filter-multi-impl` extends the set filter to array-valued cells; it does not add a separate public filter type.
**Informed by:** `docs/api.md §1.1` (`BcColumnFilter`), `docs/api.md §3.2` (`BcGridFilter` = `ServerFilter`), `docs/api.md §4.4` (`BcFilterDefinition` / `BcReactFilterDefinition` / `BcFilterEditorProps`), `docs/design/server-query-rfc.md` (server-side `ServerFilter` / `ServerColumnFilter` / `ServerFilterGroup` shapes), `docs/design/accessibility-rfc.md` (focus + live regions)
**Sprint context:** Track 6 of the v1 parity sprint (`docs/coordination/v1-parity-sprint.md`)

---

The v0.1 API already declares the filter types (`api.md §4.4`). What this RFC pins is the **registry behaviour**: how built-in + custom filters are looked up at render time, how their state serialises for URL + localStorage persistence, and what the four built-in v1 UIs do beyond text. Track 6 implementers consume this directly.

## Goals

- **Extensibility.** Any filter `type` (`text`, `number`, `date`, `set`, `boolean`, `custom`) resolves to a registered `BcReactFilterDefinition` at render time. Consumers register new types via `registerFilter()` per `api.md §9 (@bc-grid/filters)`.
- **Client/server symmetry.** A filter that runs client-side and server-side uses the same `ServerFilter` shape on the wire (per `api.md §3.2`'s `BcGridFilter = ServerFilter` decision); only the predicate-evaluation site differs. The registry exposes both `predicate` (client) and `serialize`/`parse` (URL/localStorage round-trip).
- **Persistence.** `filterState` round-trips through URL search params and `localStorage` losslessly. Round-trip is opt-in per grid via `gridId` / `urlStatePersistence`.
- **a11y.** Each filter UI is keyboard-reachable, has an accessible name, surfaces validation errors, and announces filter-state changes through the polite live region (already wired by #41).
- **Composition.** `BcGridFilter` supports AND/OR groups via `ServerFilterGroup`. Filter UIs render an inline single-column filter; group composition lives in the Filters tool panel (Track 5).
- **Ship three new built-in UIs at v1:** `set` (multi-select discrete), `date-range`, `number-range`. Plus extend the existing `text` filter with operators and case-sensitivity. Plus a `custom` recipe. (Total v1 built-ins: 7 — `text`, `number`, `date`, `set`, `boolean`, `date-range`, `number-range`.)

## Non-Goals

- **Filter expression language.** Out of scope. We don't ship Excel-style `=A1>5` formula filters at v1.
- **Cross-column filters** (`column A > column B`). Out of scope; consumers can do this via `searchText` or a custom filter that reads multiple fields.
- **Server-side custom predicate.** The `custom` filter type runs client-side only at v1; server-side custom filters need server-side predicate registration which is consumer-server contract, not bc-grid's responsibility.
- **Filter UI layout.** Inline header-row filters are already shipped (#32); the layout pattern doesn't change. This RFC pins the *behaviour*, not the visual.
- **Per-filter clear / undo.** Clear-all + per-filter clear ship; multi-step undo is post-1.0.

## Source standards

- WAI-ARIA APG `combobox` (for the multi-select `set` filter): https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
- WAI-ARIA APG `menubutton` (for operator selectors): https://www.w3.org/WAI/ARIA/apg/patterns/menubutton/
- shadcn/ui `Select`, `Combobox`, `Popover`, `Calendar` primitives.
- AG Grid public docs (filter reference; **public docs only** per `AGENTS.md §3.2`): https://www.ag-grid.com/react-data-grid/filtering-overview/

## Decision summary

| Topic | Decision |
|---|---|
| Registry location | `@bc-grid/filters` (engine package, no React) for `BcFilterDefinition`. `@bc-grid/react` (or a `@bc-grid/filter-react` sub-package — single-package preferred for v1) for `BcReactFilterDefinition` (extends with `Editor` component). |
| Lookup | At cell-render time, `column.filter.type` is the registry key. Built-ins registered on package import; consumer extensions registered via `registerFilter(definition)` before mount. |
| Built-in v1 types | `text` (extended), `number`, `date`, **`set` (multi-select discrete; matches AG Grid convention)**, `boolean`, `date-range`, `number-range`. **Seven built-ins** (the original five from `api.md §1.2` plus two additions: `date-range`, `number-range`). |
| **API surface widening (additive change)** | Both `BcColumnFilter.type` and `ServerColumnFilter.type` widen from the closed `"text" \| "number" \| "date" \| "set" \| "boolean" \| "custom"` union to `BcColumnFilterType = (closed list ∪ "date-range" \| "number-range") & (string & {})` — the `& {}` brand allows arbitrary registered keys to type-check while preserving auto-complete on the known built-ins. Lands as part of `filter-registry-impl` with `tools/api-surface/src/manifest.ts` + `docs/api.md §1.2 / §3.2` updates. Architect approval already in scope (sprint-pivot decision-log; `coordination/v1-parity-sprint.md §What's added`). |
| Operator model | Each filter exposes one or more `operator` values; `ServerColumnFilter.op` carries the chosen operator. Built-ins document their op surface; custom filters declare theirs. |
| Predicate signature | `predicate: (value, criteria, row?) => boolean`. The optional `row` lets filters inspect siblings (rare). Engine packages stay `row?`-aware so the React layer can be `row`-aware. |
| **Editor `commit` shape** | The editor commits the **value**, not the criteria: `commit(next: TValue \| null)`. The framework wraps `(operator, value)` into a `BcFilterCriteria` and dispatches downstream. Editors that change operator do so via `setOperator` (separate prop). Matches the existing `api.md §4.4` declaration. |
| Persistence — lossless via JSON | Serialize via JSON-encoded payload (not delimiter-based). Each filter's `serialize` produces a JSON string with a typed-payload schema; `parse` reverses it with a schema-aware reviver where needed (e.g. `Date` re-instantiation). URL + `localStorage` round-trips exactly. Replaces the earlier delimiter-based draft. |
| URL state persistence | Encoded as a single query param (default name `f`). The RFC ships a `bcGridFilterToUrl(filter, columns)` + `bcGridFilterFromUrl(searchParam, columns)` helper pair. |
| Persistence opt-in | URL via `BcGridProps.urlStatePersistence?: { searchParam: string }` (additive, lands in Track 0 `column-state-url-persistence` task and reused here). `localStorage` via existing `gridId` (Phase 5.5 `localstorage-gridid-persistence`). |
| Active filter announcement | When a filter is applied, polite region announces `Filter applied. {visibleRows} of {totalRows} rows shown.` (already wired by #41). When cleared: `Filter cleared. {totalRows} rows shown.` |
| **Text-filter wire-shape additions (v0.3, additive)** | `ServerColumnFilter` gains optional `caseSensitive?: boolean` and `regex?: boolean`. Both flags apply to `type === "text"` only; other filter types ignore them. Lands with `filter-text-impl-extend` (PR #208). The persistence shape stays plain-string for the default `contains` + no-modifier case (legacy round-trip preserved); JSON only when any non-default state is active. See `§ "v0.3 implementation reconciliation"` below. |

---

## Registry

### Engine layer: `@bc-grid/filters`

```ts
// packages/filters/src/index.ts (today: stub)

export interface BcFilterDefinition<TValue = unknown, TCriteria extends BcFilterCriteria = BcFilterCriteria> {
  type: string                                                    // unique registry key
  /** Operators this filter exposes. UI surfaces them via a dropdown / segmented control. */
  operators: readonly BcFilterOperator[]
  /** Default operator chosen when the filter is first applied. */
  defaultOperator?: string
  /** Returns true iff `value` passes the criteria. Pure. */
  predicate: (value: TValue, criteria: TCriteria, row?: unknown) => boolean
  /**
   * Lossless serialize for URL / localStorage. Returns a JSON-encoded string.
   * Must NOT include the column id (the framework prepends that). For typed
   * values like Date, use `JSON.stringify(criteria, replacer)` with a custom
   * replacer that emits a tag like `{ "@kind": "date", "iso": "..." }`.
   */
  serialize: (criteria: TCriteria) => string
  /**
   * Lossless parse: inverse of serialize. Throws on invalid input. Pair with
   * the same replacer/reviver convention as serialize for typed payloads.
   */
  parse: (serialized: string) => TCriteria
  /** Optional: empty-state criteria when the filter is registered but no value set. Default: `{ op: defaultOperator, value: null }`. */
  emptyCriteria?: () => TCriteria
}

/** Default helpers for filters whose criteria is plain JSON-serializable. */
export function jsonSerialize<TCriteria extends BcFilterCriteria>(criteria: TCriteria): string
export function jsonParse<TCriteria extends BcFilterCriteria>(s: string): TCriteria

export interface BcFilterOperator {
  id: string                  // e.g. "equals", "contains", "gt", "between"
  /** Localised label key; resolved against BcGridMessages. */
  labelKey: string
  /** True if this operator's UI takes a single value, false if it takes a value array (e.g. `between` / `in`). Default: true. */
  scalar?: boolean
}

export interface BcFilterCriteria {
  op: string
  value?: unknown
  values?: unknown[]
  /** Shape mirrors `ServerColumnFilter` from server-query-rfc. */
}

export const filterRegistry = {
  register(definition: BcFilterDefinition): void
  get(type: string): BcFilterDefinition | undefined
  has(type: string): boolean
  /** Returns all currently-registered types. Used by the Filters tool panel. */
  types(): readonly string[]
}

export function matchesFilter(filter: BcGridFilter, row: unknown, columns: readonly BcGridColumn[]): boolean
```

`matchesFilter` already declared `api.md §9 (@bc-grid/filters)`. It walks `BcGridFilter` (which is `ServerFilter` per `api.md §3.2` decision):
- `ServerFilterGroup`: AND/OR walk over children.
- `ServerColumnFilter`: look up `column.filter.type` in the registry, evaluate predicate.

### React layer: `@bc-grid/react`

```ts
// packages/react/src/filter-registry.ts (NEW)

export interface BcReactFilterDefinition<TValue = unknown, TCriteria extends BcFilterCriteria = BcFilterCriteria>
  extends BcFilterDefinition<TValue, TCriteria> {
  /**
   * Inline filter UI rendered in the column's filter row. **Optional** —
   * matches `api.md §4.4`'s existing `Editor?` declaration. A definition
   * without an `Editor` is engine-only (predicate + serialize/parse) — useful
   * when the filter UI is composed externally (e.g., a custom side-panel
   * filter that doesn't inline in the column header).
   */
  Editor?: React.ComponentType<BcFilterEditorProps<TValue, TCriteria>>
  /** Optional: tool-panel-filters renderer (richer UI). Defaults to Editor. */
  PanelEditor?: React.ComponentType<BcFilterEditorProps<TValue, TCriteria>>
  /** Optional: pretty-print for the active-filter chip (e.g., "Balance > 1000"). Default: `${type} ${op}`. */
  describe?: (criteria: TCriteria, column: BcReactGridColumn) => string
}

export const reactFilterRegistry = {
  register(definition: BcReactFilterDefinition): void
  get(type: string): BcReactFilterDefinition | undefined
}
```

`BcFilterEditorProps` is already declared (`api.md §4.4`):
```ts
export interface BcFilterEditorProps<TValue = unknown> {
  value: TValue | null
  commit(next: TValue | null): void
  clear(): void
  locale?: string
}
```

This RFC adds **three optional props** (all additive — no v0.1 break, no required-field changes):

```ts
interface BcFilterEditorProps<TValue = unknown, TCriteria extends BcFilterCriteria = BcFilterCriteria> {
  // existing (api.md §4.4 — UNCHANGED):
  value: TValue | null
  /**
   * Editor commits the value, NOT the criteria. The framework wraps
   * (operator, value) into a BcFilterCriteria and dispatches to onFilterChange.
   * Editors that need to commit a multi-value criteria (e.g., `between`)
   * should commit a typed `TValue` shaped to match (e.g., a tuple `[low, high]`)
   * and the framework's wrapper handles the criteria conversion via the
   * filter definition's operator metadata.
   */
  commit(next: TValue | null): void
  clear(): void
  locale?: string

  // ADDITIVE in this RFC (all OPTIONAL):
  /** Current chosen operator. When undefined, the editor uses defaultOperator. */
  operator?: string
  /** When the filter exposes >1 operator. When undefined, no operator dropdown. */
  setOperator?: (next: string) => void
  /** Column context (header, format, etc.). When undefined, editor renders without column context. */
  column?: BcReactGridColumn
}
```

### Lookup

At cell-render time, the framework reads `column.filter` (already declared `api.md §1.1`). This RFC **widens the type union** of `BcColumnFilter.type` and `ServerColumnFilter.type` (additive, no v0.1 break):

```ts
// CURRENT (api.md §1.2 + packages/core/src/index.ts:39-40):
type BcColumnFilterType_v0_1 = "text" | "number" | "date" | "set" | "boolean" | "custom"

// AFTER filter-registry-impl PR lands:
type BcColumnFilterType =
  | "text" | "number" | "date" | "set" | "boolean"           // original five (set is multi-select)
  | "date-range" | "number-range"                              // NEW v1 built-ins
  | "custom"                                                    // existing escape hatch
  | (string & {})                                              // brand: allow any registered key, preserve auto-complete on the named ones

type BcColumnFilter =
  | false
  | { type: BcColumnFilterType; defaultValue?: unknown; variant?: "popup" | "inline" }

// ServerColumnFilter.type widens identically.
```

The `(string & {})` brand is the standard TypeScript trick for "string union plus any string" while keeping IntelliSense on the named members. Pinned during `filter-registry-impl`'s manifest update.

Lookup steps:
1. If `column.filter === false`: no filter UI on this column.
2. Else: `def = reactFilterRegistry.get(column.filter.type)`. If undefined: render a console.error in dev, no UI in prod (graceful degradation).
3. Render `<def.Editor value={...} commit={...} ... />` in the inline filter row.
4. On `commit(value)`: the framework wraps the value with the active operator into a `ServerColumnFilter` (`{ kind: "column", columnId, type, operator, value }`); merge into the active `BcGridFilter` (replacing any existing filter on this column); fire `onFilterChange`. Editors call `commit(null)` to clear the column's filter.

---

## Built-in filter specifications

### `text` (extend the existing inline filter from #32)

Operators:
- `contains` (default) — substring match
- `starts-with`
- `ends-with`
- `equals`
- `not-equals`
- `regex` — interpret value as regex; failed compile shows error in editor

Modifiers:
- Case-sensitivity toggle (default: insensitive)
- Whitespace-trim toggle (default: trim)

Inline UI: existing single-input pattern + an operator dropdown menubutton on the left of the input. Clicking the menubutton opens a small popover with the operator list.

Predicate: per operator. `regex` uses cached `RegExp` (per-render) with `i` flag when case-insensitive.

Serialize: JSON-encoded criteria. Modifier flags are nested keys, not delimiter suffixes:

```json
{"op":"contains","value":"foo"}
{"op":"regex","value":"^x.*y$","caseSensitive":false}
{"op":"equals","value":"bar","caseSensitive":true}
```

The `caseSensitive` modifier is part of `BcFilterCriteria.value` only when non-default (i.e. omit when matching the global default). Parse: `JSON.parse(s)` — values containing colons / pipes / quotes round-trip correctly because they're inside JSON strings, escaped per JSON.

#### v0.3 implementation reconciliation

The original RFC sketch (above) is the broader operator surface from the v1 parity sprint. The actual v0.3 ship in `filter-text-impl-extend` (PR #208) tightens the surface as follows; the wider operator list and trim toggle remain post-v0.3 work.

**Operators that ship at v0.3** — four positional operators only:

- `contains` (default)
- `starts-with`
- `ends-with`
- `equals`

`not-equals` is deferred. Consumers can express it via a custom filter type or by composing with another column filter.

**Modifier toggles that ship at v0.3** — two booleans:

- `caseSensitive` — applies to every operator. When off (default), both haystack and needle are lower-cased before comparison.
- `regex` — operator-agnostic. When on, the predicate compiles `new RegExp(value, caseSensitive ? "" : "i")` and tests against the formatted cell value. Patterns describe their own anchoring, so `op` is ignored — `"contains"` + `regex` and `"equals"` + `regex` produce identical match results. A pattern that fails to compile drops the filter (no match) at both build time **and** match time, so partial typing or hand-built filters never throw.

`regex` is therefore a **modifier toggle**, not an operator value, in the v0.3 implementation. The original sketch listed it as one of the six operators; the implementation chose toggle semantics so users can flip regex on top of any operator-style typing without losing context. This also means a `ServerColumnFilter.op === "regex"` is **not** a valid v0.3 wire shape; emit `op === "contains"` (or any positional op — it's ignored) plus `regex: true`.

**Whitespace-trim toggle is omitted.** v0.3 trims at the `buildGridFilter` boundary so a whitespace-only input always drops the filter; a per-filter trim toggle would only matter for "value contains exactly N spaces" filters, which can be expressed via regex.

**Wire-shape on `ServerColumnFilter`** — the modifier flags surface as additive optional fields on the canonical filter (not nested inside `value`):

```ts
export interface ServerColumnFilter {
  // ... existing kind / columnId / type / op / value / values ...
  caseSensitive?: boolean
  regex?: boolean
}
```

Other filter types ignore both fields. Server consumers that don't recognise them see a normal column filter. Tracked in `docs/api.md §3.2 / §4.4`.

**Persistence shape — plain string vs JSON.** The editor's `columnFilterText` map serialises into either:

- a **plain string** when the filter is the default `contains` + no modifiers — same shape consumers and persistence payloads emit pre-v0.3; legacy clients keep round-tripping unchanged;
- a **JSON-encoded `TextFilterInput`** when any non-default operator or modifier flag is active — `{"op":"starts-with","value":"Acme"}`, `{"op":"equals","value":"Acme","caseSensitive":true}`, `{"op":"contains","value":"^A.*e$","regex":true}`, etc.

`decodeTextFilterInput` accepts both shapes; `encodeColumnFilterInput` reverses the choice based on the canonical `ServerColumnFilter`'s shape so persistence stays minimal. The plain-string fallback also catches "JSON-shaped strings with an unrecognised op" — those decode as a `contains` filter against the raw string, which is a deliberate footgun-avoidance: if a persistence payload mutates and the shape stops parsing, the user gets a literal substring search rather than an exception.

**Clear semantics** are inherited from `buildGridFilter`'s outer trim guard: an empty or whitespace-only `columnFilterText` value drops the filter at parse time regardless of operator or modifier flags. With every text filter cleared, `buildGridFilter` returns `null` so `onFilterChange` consumers see `null` (per PR #200).

**Editor surface.** `<TextFilterControl>` in the React layer renders an operator `<select>` + value `<input>` + two `<button aria-pressed>` toggle buttons (`Aa` for case-sensitive, `.*` for regex). The same control is used for the inline filter row and the popup variant via `<FilterEditorBody>` so the two surfaces share one implementation.

### `number`

Operators:
- `equals` (default)
- `not-equals`
- `lt`, `lte`, `gt`, `gte`
- `between` (scalar=false; takes two values)

Inline UI: number input + operator menubutton. `between` shows two inputs.

Predicate: numeric comparison after parse. `null`/`undefined` value never matches non-equals operators; matches only `equals null`.

Serialize: JSON. `{"op":"gt","value":5000}` or `{"op":"between","values":[100,200]}`.

### `date`

Operators:
- `is` (default)
- `is-not`
- `before`
- `after`
- `between` (scalar=false)
- `today`, `yesterday`, `this-week`, `this-month`, `this-year` (preset operators; no value)

Inline UI: date picker + operator menubutton. `between` shows two date inputs. Presets show no value input (just the operator).

Predicate: ISO 8601 string comparison after `Date` parse. Locale-aware via `BcGridProps.locale`.

Serialize: JSON with typed-date payload via the `@kind: "date"` reviver convention from `jsonSerialize`/`jsonParse` (so timezone semantics survive a Node ↔ browser round-trip):

```json
{"op":"before","value":{"@kind":"date","iso":"2026-01-01"}}
{"op":"between","values":[{"@kind":"date","iso":"2026-01-01"},{"@kind":"date","iso":"2026-12-31"}]}
{"op":"today"}
```

### `set` (multi-select discrete; matches the AG Grid convention)

The v1 incarnation of AG Grid's "set filter". Multi-select dropdown of distinct cell values from the column. The user picks zero, one, or many values; the row passes if its scalar value is in (or not in) the chosen set. When the cell value is an array, each item is indexed and matched independently.

Operators:
- `in` (default) — `criteria.values.includes(value)`
- `not-in` — `!criteria.values.includes(value)`

Inline UI: bc-grid's internal combobox primitive (shadcn-compatible per `chrome-rfc`'s source-standards note) with checkbox per option + chip display of selected values. Lazy-loaded on first open (computes distinct values from each scalar value, or from each array item for array-valued columns).

Predicate: `criteria.values.includes(value)` for scalar values, or `value.some(item => criteria.values.includes(item))` for array values; negation for `not-in`. Empty `values` array means "no filter active" (treat as match-all).

Serialize: JSON-encoded `{"op":"in","values":["Open","Past Due"]}`. Numeric values preserved as numbers; strings as strings; dates serialised via the typed-payload pattern from `BcFilterDefinition.serialize` (e.g. `{"op":"in","values":[{"@kind":"date","iso":"2026-01-01"}, ...]}`).

Array-valued cell columns (e.g. a `tags: string[]` column) use the same `set` filter type. The option list flattens array items, `in` matches when any item is selected, and `not-in` rejects rows containing a selected item.

### `boolean`

Three-state filter: any / true / false.

Operators: `is` (default). No others.

Inline UI: shadcn `Select` with three options.

Predicate: `criteria.value === null` returns true (any); `criteria.value === true` returns `value === true`; `criteria.value === false` returns `value === false || value == null` (matches missing-as-false).

Serialize: JSON. `{"op":"is","value":true}` / `{"op":"is","value":false}` / (cleared = no entry).

### `date-range` (NEW at v1)

Convenience over `date` `between`. Surface: two-date picker in a single popover. Same predicate as `date` `between`.

Operators: `between` only.

Inline UI: shadcn `Popover` containing dual `Calendar`. Single chip displays "Mar 1 → Mar 31".

Serialize: JSON, same `@kind: "date"` convention as `date`. `{"op":"between","values":[{"@kind":"date","iso":"2026-03-01"},{"@kind":"date","iso":"2026-03-31"}]}`.

### `number-range` (NEW at v1)

Convenience over `number` `between`. Surface: two number inputs in a row.

Operators: `between` only.

Inline UI: two `<input inputMode="decimal">` separated by an em-dash.

Serialize: JSON. `{"op":"between","values":[100,500]}`.

---

## Custom filter recipe

```ts
import { reactFilterRegistry } from "@bc-grid/react"

reactFilterRegistry.register({
  type: "credit-risk",
  operators: [
    { id: "high-risk", labelKey: "filter.creditRisk.highRisk" },
    { id: "any-risk", labelKey: "filter.creditRisk.any" },
  ],
  defaultOperator: "high-risk",
  predicate: (value, criteria) => {
    if (criteria.op === "high-risk") return Number(value) > 80
    return true
  },
  serialize: (c) => JSON.stringify({ op: c.op }),
  parse: (s) => JSON.parse(s),
  Editor: ({ operator, setOperator, value, commit }) => (
    <button onClick={() => commit(operator)}>{operator}</button>
  ),
})

// Then use:
const columns = [
  { field: "riskScore", header: "Risk", filter: { type: "credit-risk" } },
]
```

The custom example is shipped as `filter-custom-extension-example` in `apps/docs`.

---

## Persistence

### URL state

Encoding: a single query param (default name `f`) with a JSON-encoded array of column-filter entries. The outer array + each entry's `s` value are both JSON; the URL helpers handle one round of `encodeURIComponent` on the outer string:

```
?f=%5B%7B%22c%22%3A%22name%22%2C%22t%22%3A%22text%22%2C%22s%22%3A%22%7B%5C%22op%5C%22%3A%5C%22contains%5C%22%2C%5C%22value%5C%22%3A%5C%22foo%5C%22%7D%22%7D%2C...%5D
```

Decoded:
```json
[
  {"c":"name","t":"text","s":"{\"op\":\"contains\",\"value\":\"foo\"}"},
  {"c":"balance","t":"number-range","s":"{\"op\":\"between\",\"values\":[100,500]}"}
]
```

Where:
- `c` = `columnId`
- `t` = `type` (registry key — must be a registered filter type)
- `s` = `serialize(criteria)` output (per-filter JSON string)

The double-encoding (each `s` is itself JSON inside an outer JSON array) is deliberate: it lets the URL helper validate `c` + `t` early without parsing the inner criteria, and lets each filter's `parse(s)` run independently with its own typed reviver.

Helper functions:

```ts
import { bcGridFilterToUrl, bcGridFilterFromUrl } from "@bc-grid/react"

const url = bcGridFilterToUrl(filterState, columns)
// → "[{...}]" (already URL-safe)

const filter = bcGridFilterFromUrl(searchParamValue, columns)
// → BcGridFilter
```

The grid auto-syncs when `BcGridProps.urlStatePersistence` is set:

```ts
<BcGrid
  urlStatePersistence={{ searchParam: "f" }}
  // ...
/>
```

On mount: read URL, set `defaultFilter`. On `onFilterChange`: update URL via `history.replaceState` (no navigation).

### localStorage state

Already specced in Phase 5.5 `localstorage-gridid-persistence`. Filter persistence reuses the same machinery: when `gridId` is set, filter state is persisted to `bc-grid:{gridId}:filter` on every change (debounced 500ms).

URL state takes precedence over localStorage on mount: if both are present, URL wins. This matches consumer expectations (a shared link should override a stale local state).

---

## AND/OR composition (`ServerFilterGroup`)

Inline column filters always emit a flat `ServerColumnFilter`. To compose multiple column filters into AND/OR groups, use the **Filters tool panel** (Track 5):

```
Filters
  AND
    Name contains "Acme"
    OR
      Balance > 1000
      Status is "Past Due"
```

Tool panel UI lives in `tool-panel-filters` (Track 5; depends on this RFC). At v1, inline column filters compose via implicit AND when multiple columns have active filters; users wanting OR or nested grouping use the tool panel. Decision-summary table reflects this.

---

## Implementation tasks (Phase 6 Track 6)

| Task | Effort | Depends on |
|---|---|---|
| `filter-registry-impl` (`@bc-grid/filters` + `@bc-grid/react/filter-registry`) | M | this RFC |
| `filter-text-impl-extend` (operators + case + regex) | S | filter-registry-impl |
| `filter-set-impl` (multi-select; matches AG Grid set-filter convention) | M | filter-registry-impl |
| `filter-date-range-impl` | M | filter-registry-impl |
| `filter-number-range-impl` | S | filter-registry-impl |
| `filter-custom-extension-example` (docs) | S | filter-registry-impl |
| `filter-persistence` (URL + localStorage helpers) | S | filter-registry-impl |
| `tool-panel-filters` (Track 5) | M | filter-registry-impl + sidebar-impl |

Phase 5.5 `set-filter-ui` was previously `[blocked: depends on filter-registry-rfc]`. With this RFC merged, that task transitions to `[blocked: depends on filter-registry-impl]` (one step removed).

The `number-filter-ui` and `date-filter-ui` tasks in Phase 5.5 are NOT blocked by this RFC — they can ship as the inline form of the `number` / `date` built-in filters listed above (without operators yet, just `equals` for number and `is` for date). The full operator surface lands in `filter-text-impl-extend`'s sibling tasks.

---

## Test plan

### Unit (Vitest)

- `filterRegistry.register` / `get` / `has`.
- `matchesFilter` walks AND/OR groups correctly; short-circuits on AND/OR semantics.
- Each built-in's `predicate` for every operator (positive + negative + edge cases: null value, empty string, mixed types).
- `serialize` / `parse` round-trip for every built-in × every operator.
- `bcGridFilterToUrl` / `bcGridFilterFromUrl` round-trip for a multi-column filter set.

### Integration (Vitest + RTL)

- Inline filter UI: typing in text input commits filter; clearing input clears filter.
- Operator dropdown: changing operator re-runs predicate immediately.
- `set` filter (multi-select): opens, shows distinct values, selecting one or more applies `in` criteria, chips display, deselecting all clears the filter, aria-rowcount updates.
- `date-range` / `number-range`: between two values; aria-rowcount reflects narrowing.
- Custom filter: register at module scope; inline filter renders; predicate runs.
- URL persistence: `?f=...` populates filter on mount; `onFilterChange` updates URL.

### E2E (Playwright × 3 browsers)

- AR Customers demo: apply text-filter "Customer 042" → 3 rows.
- Apply number-range to balance → narrows to range.
- Apply date-range to invoice date → narrows.
- Set filter on status → narrow to "Past Due".
- Clear all filters → rows return.
- URL share: copy URL with filter; open in new tab → filter applied.

### a11y manual

- NVDA / VoiceOver: each filter's accessible name reflects the column header.
- Operator dropdown: announce as menubutton; arrow keys navigate operators.
- Live region: filter applied → polite announcement debounced 250ms.

## Acceptance criteria

- `@bc-grid/filters` ships with seven built-in filter definitions registered (`text`, `number`, `date`, `set`, `boolean`, `date-range`, `number-range`).
- `@bc-grid/react/filter-registry` ships with seven matching `BcReactFilterDefinition` Editors.
- `matchesFilter` runtime exists and is `manifest.ts`-listed.
- URL persistence helpers shipped + manifest-listed.
- AR Customers demo exercises text + number-range + date-range + set in a single integration test.
- Custom filter recipe lives in `apps/docs`.
- `tool-panel-filters` (Track 5) consumes this registry without modification.
- axe-core clean for every filter UI.

## Open questions

### Should `filterState` be debounced before firing `onFilterChange`?
**Decision: yes for `text` / `regex` (default 200ms); no for discrete filters (set/multi/date/boolean).** Text typing fires onChange per keystroke; without debounce, `onFilterChange` would fire 10x for "customer". Discrete filters fire on commit, so debounce isn't needed.

### Server-side filter execution
Already covered by `server-query-rfc`. The filter state shape is identical (`BcGridFilter = ServerFilter`); server-paged / server-infinite / server-tree modes (Track 3) pass it through to the consumer's `loadPage` / `loadBlock` / `loadChildren`. The consumer is responsible for translating `ServerColumnFilter.type` to their backend's filter shape.

### How does `searchText` interact with column filters?
**Decision: AND.** `searchText` is its own filter that applies across all searchable columns; it AND-composes with `BcGridFilter`. Both must pass for a row to render. No surface change required — already documented in `api.md §4.3`.

### Filter chip UI for active filters
At v1, active filters are visible inline in their column's filter row (existing #32 pattern) — no separate chip strip. The Filters tool panel surfaces a list view. A top-of-grid chip strip is post-1.0 polish.

## References

- `docs/api.md §1.1` (`BcColumnFilter`, frozen)
- `docs/api.md §3.2` (`BcGridFilter` = `ServerFilter`)
- `docs/api.md §4.4` (`BcFilterDefinition`, `BcReactFilterDefinition`, `BcFilterEditorProps`)
- `docs/api.md §9` (`@bc-grid/filters` exports)
- `docs/design/server-query-rfc.md` (server-side filter shapes)
- `docs/design/accessibility-rfc.md §Live Regions` (filter announcements)
- `docs/coordination/v1-parity-sprint.md §Track 6`
