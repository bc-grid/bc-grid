# Editor Paste Detection

When a user pastes text into a `kind: "number"` or `kind: "date"` editor, the editor format-detects the pasted content and normalizes the input value before commit. The user sees the parsed numeric / ISO date in the input immediately, so they know what will commit before they press Enter.

v0.6 §1 — closes the "I pasted `$1,234.56` into a number cell and got a string commit" UX gap.

## What's normalized

### Number editor (`kind: "number"`)

Resolution: tries `column.valueParser` first; falls through to `parseLocaleNumber` (the built-in, exported from `@bc-grid/editors`).

| Pasted text | Normalized to |
|---|---|
| `$1,234.56` | `1234.56` |
| `(1,234.56)` | `-1234.56` (accounting parens-negative) |
| `12.5%` | `12.5` (percent symbol stripped) |
| `€1.234,56` (de-DE locale) | `1234.56` |
| `42` | `42` |
| `-42.5` | `-42.5` |

### Date editor (`kind: "date"`)

Resolution: tries `column.valueParser` first; falls through to the editor's `normalizeDateValue` helper.

| Pasted text | Normalized to |
|---|---|
| `2026-05-04` | `2026-05-04` (ISO passes through) |
| `2026-05-04T12:30:00` | `2026-05-04` (time stripped) |
| `May 4, 2026` | `2026-05-04` (RFC2822-ish parsed) |
| `5/4/2026` | `2026-05-04` (US slash form) |

## Resolution order

```
1. column.valueParser(text, row)
   - If returns a usable value (finite number, non-empty string, Date instance) → use that
   - If returns null / undefined / NaN / throws → fall through

2. Editor's built-in fallback parser
   - number editor: parseLocaleNumber(text, locale)
   - date editor: normalizeDateValue(text)
   - If parser returns finite number / non-empty ISO → use that
   - If unparseable → fall through

3. Browser's default paste behavior
   - The pasted text is inserted as-is (preserves v0.5 default for unparseable pastes).
```

The fall-through chain matters for two reasons:

- **Strict consumer parsers don't lose detection.** A consumer's `valueParser` that only accepts enum values returns NaN for arbitrary numeric input — but the built-in `parseLocaleNumber` CAN normalize it. The editor uses the fallback rather than failing the paste.
- **Unparseable text isn't silently dropped.** If neither parser can make sense of the paste, the browser's default behavior runs — the user sees the raw text and can decide what to do (edit / cancel / re-paste a different value).

## Locale-aware decimal parsing

`parseLocaleNumber` (used as the number editor's fallback) reads the locale's group + decimal separators via `Intl.NumberFormat(locale).formatToParts(...)` and normalizes accordingly:

```ts
parseLocaleNumber("1,5", "de-DE")        // → 1.5 (comma is decimal in DE)
parseLocaleNumber("1.234,56", "de-DE")   // → 1234.56 (dot is group, comma is decimal)
parseLocaleNumber("1,234.56", "en-US")   // → 1234.56 (comma is group, dot is decimal)
```

The number editor resolves the locale via `Intl.NumberFormat().resolvedOptions().locale` — uses the runtime's user setting. Consumers needing strict locale control wire `column.valueParser: (input) => parseLocaleNumber(input, "de-DE")` for both paste-time AND commit-time parsing.

## When NOT to use

- **Custom editor with non-default Component.** Paste detection is wired into the BUILT-IN `numberEditor` and `dateEditor` from `@bc-grid/editors`. Custom `cellEditor: MyCustomEditor` instances need their own `onPaste` handler — the framework doesn't intercept paste at the cell level (the editor's input element gets the event natively).
- **Datetime editor.** Today only `kind: "number"` and `kind: "date"` ship with paste detection. The `datetime` editor handles ISO via the browser's native `<input type="datetime-local">`. v0.7 may extend.
- **Scientific notation.** `parseLocaleNumber` strips non-digit chars including `e/E`, so `"1.5e3"` parses as `1.53` not `1500`. ERP grids don't typically paste scientific notation; consumers needing it wire `column.valueParser: (text) => Number.parseFloat(text)` to bypass the locale-aware path.
- **Custom locale unrecognised by the runtime.** `Intl.NumberFormat` falls back to ASCII separators on unknown locales — the paste handler still works but loses locale-specific separator handling. Pass a known BCP 47 tag via `column.valueParser` for strict coverage.

## Imperative API

The detection helper is exported for consumer-built editors that want the same resolution chain:

```ts
import { detectPastedValue } from "@bc-grid/editors/internal/pasteDetection"
// (currently internal — promote to public if consumer demand surfaces)
```

The internal export means the helper is reusable across consumer custom editors today via deep imports; if needed for consumer ergonomics, future PRs can promote to the package's public surface (`@bc-grid/editors`).
