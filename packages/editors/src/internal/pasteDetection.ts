import type { BcReactGridColumn } from "@bc-grid/react"

/**
 * Paste-into-cell format detection helpers (v0.6 §1
 * `v06-editor-paste-into-cell-detection`). When a user pastes text
 * into an editing cell, the input today accepts the literal string;
 * commit-time `column.valueParser` then parses it. For numeric +
 * date editors that's a UX gap — the user sees the raw paste (e.g.
 * `"$1,234.56"`) in the input and only learns at commit time
 * whether it parsed.
 *
 * These helpers run AT paste time so the input reflects the
 * normalized value immediately. The user sees what will be
 * committed.
 *
 * Resolution order (per the handoff spec):
 *   1. `column.valueParser` if defined — same parser commit-time
 *      uses, run early so paste preview matches commit result.
 *   2. The editor's built-in fallback parser
 *      (`parseLocaleNumber` for number, `normalizeDateValue` for
 *      date).
 *
 * Returns `{ ok: true, normalised }` when either parser produced a
 * usable value; `{ ok: false }` otherwise (caller falls through to
 * the browser's default paste behaviour, which inserts the raw
 * text — preserving the v0.5 default for unparseable pastes).
 */
export interface PasteDetectionResult {
  ok: boolean
  /** Normalised string ready to set as `input.value`. */
  normalised: string
}

export interface PasteDetectionParams<TRow> {
  /** Raw text from clipboard. */
  text: string
  /** Column the editor is mounted on; we read `valueParser` if set. */
  column: BcReactGridColumn<TRow, unknown>
  /** Row context for `column.valueParser`. */
  row: TRow
  /**
   * Editor-specific fallback parser. Called when the column has no
   * `valueParser` OR the consumer's parser returned a non-finite /
   * empty value (so we don't lose detection on consumer-rejected
   * inputs that the built-in parser CAN normalize).
   *
   * Returns the parsed value (number, string, etc.) or `undefined` /
   * `NaN` to signal "could not parse — fall through to default
   * paste behaviour."
   */
  fallback: (text: string) => unknown
  /**
   * Stringify the parsed value back to the form the editor's input
   * accepts. For number editors that's `String(value)`; for date
   * editors that's the ISO `YYYY-MM-DD` form. Letting the editor
   * pass its own stringifier keeps this helper editor-agnostic.
   */
  stringify: (parsed: unknown) => string
}

export function detectPastedValue<TRow>(params: PasteDetectionParams<TRow>): PasteDetectionResult {
  const { text, column, row, fallback, stringify } = params

  // Try the consumer's valueParser first. A throw or non-finite
  // numeric result is treated as "did not parse" — we fall through
  // to the editor's built-in parser rather than calling the paste
  // a parse failure outright. This lets consumers wire strict
  // valueParsers (e.g. enum-only) without breaking paste detection
  // for inputs the built-in parser CAN handle.
  const parserResult = tryConsumerValueParser(text, column, row)
  if (parserResult.ok) {
    const stringified = stringify(parserResult.value)
    if (stringified.length > 0) return { ok: true, normalised: stringified }
  }

  const fallbackValue = fallback(text)
  if (isUsableValue(fallbackValue)) {
    const stringified = stringify(fallbackValue)
    if (stringified.length > 0) return { ok: true, normalised: stringified }
  }
  return { ok: false, normalised: "" }
}

function tryConsumerValueParser<TRow>(
  text: string,
  column: BcReactGridColumn<TRow, unknown>,
  row: TRow,
): { ok: true; value: unknown } | { ok: false } {
  const parser = column.valueParser
  if (!parser) return { ok: false }
  let parsed: unknown
  try {
    parsed = parser(text, row)
  } catch {
    return { ok: false }
  }
  if (!isUsableValue(parsed)) return { ok: false }
  return { ok: true, value: parsed }
}

function isUsableValue(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === "number") return Number.isFinite(value)
  if (typeof value === "string") return value.length > 0
  // Dates, objects (e.g. `{ amount, currency }`), booleans — all
  // usable; the editor's stringify decides what to render.
  return true
}
