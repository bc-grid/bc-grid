import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Source-shape regression guards for the paste-into-cell wiring on
 * number + date editors (v0.6 §1
 * `v06-editor-paste-into-cell-detection`). The integration with
 * `detectPastedValue` is tested behaviorally in `pasteDetection.test.ts`
 * with parseLocaleNumber + normalizeDateValue as the fallback.
 *
 * This file pins:
 *   - `onPaste` is wired on each editor's input element
 *   - `detectPastedValue` is the resolver each editor calls
 *   - Each editor passes its column-aware fallback parser
 *   - The handler `preventDefault`s only on successful parse (so
 *     unparseable pastes fall through to the browser's default)
 *
 * Per `docs/recipes/editor-paste-detection.md`.
 */

const here = fileURLToPath(new URL(".", import.meta.url))
const numberSource = readFileSync(`${here}../src/number.tsx`, "utf8")
const dateSource = readFileSync(`${here}../src/date.tsx`, "utf8")

describe("number editor — onPaste wiring", () => {
  test("imports detectPastedValue from internal/pasteDetection", () => {
    expect(numberSource).toMatch(
      /import\s*\{\s*detectPastedValue\s*\}\s*from\s*"\.\/internal\/pasteDetection"/,
    )
  })

  test("onPaste handler is attached to the input element", () => {
    expect(numberSource).toMatch(/onPaste=\{onPaste\}/)
  })

  test("onPaste resolves via detectPastedValue with column + row + fallback", () => {
    expect(numberSource).toMatch(
      /detectPastedValue\(\{[\s\S]*?text,[\s\S]*?column,[\s\S]*?row,[\s\S]*?fallback:[\s\S]*?stringify:[\s\S]*?\}\)/,
    )
  })

  test("number editor's fallback uses parseLocaleNumber with resolved locale", () => {
    expect(numberSource).toMatch(
      /fallback:\s*\(raw\)\s*=>\s*parseLocaleNumber\(raw,\s*resolveLocale\(\)\)/,
    )
  })

  test("preventDefault fires only on successful parse (result.ok branch)", () => {
    // Pin the gate: if (!result.ok) return BEFORE preventDefault.
    // Without this gate, unparseable pastes would be silently
    // dropped instead of falling through to the browser's default
    // text insertion.
    expect(numberSource).toMatch(/if\s*\(!result\.ok\)\s*return[\s\S]*?event\.preventDefault\(\)/)
  })

  test("after preventDefault, the input value is set to result.normalised", () => {
    expect(numberSource).toMatch(/input\.value\s*=\s*result\.normalised/)
  })

  test("resolveLocale falls back to en-US on Intl.NumberFormat throw (defensive)", () => {
    // Some browsers / Node versions throw for unrecognised locales.
    // Pin the try/catch so the paste handler doesn't crash.
    expect(numberSource).toMatch(
      /try\s*\{[\s\S]*?Intl\.NumberFormat\(\)\.resolvedOptions\(\)\.locale[\s\S]*?\}\s*catch\s*\{[\s\S]*?return\s*"en-US"/,
    )
  })
})

describe("date editor — onPaste wiring", () => {
  test("imports detectPastedValue from internal/pasteDetection", () => {
    expect(dateSource).toMatch(
      /import\s*\{\s*detectPastedValue\s*\}\s*from\s*"\.\/internal\/pasteDetection"/,
    )
  })

  test("onPaste handler is attached to the date input", () => {
    expect(dateSource).toMatch(/onPaste=\{onPaste\}/)
  })

  test("date editor's fallback uses normalizeDateValue (handles ISO + RFC2822 + slash forms)", () => {
    expect(dateSource).toMatch(/fallback:\s*\(raw\)\s*=>\s*normalizeDateValue\(raw\)/)
  })

  test("preventDefault fires only on successful parse (result.ok branch)", () => {
    expect(dateSource).toMatch(/if\s*\(!result\.ok\)\s*return[\s\S]*?event\.preventDefault\(\)/)
  })

  test("stringifyDate handles Date instances + ISO strings + epoch ms", () => {
    // Date editor's fallback returns ISO string from normalizeDateValue,
    // but the consumer's column.valueParser may return a Date instance
    // OR epoch number. Pin all three branches so the input always
    // ends up with an ISO string (the only form `<input type="date">`
    // accepts).
    expect(dateSource).toMatch(/parsed instanceof Date[\s\S]*?toIsoDate\(parsed\)/)
    expect(dateSource).toMatch(/typeof parsed === "string"[\s\S]*?return parsed/)
    expect(dateSource).toMatch(/typeof parsed === "number"[\s\S]*?Number\.isFinite\(parsed\)/)
  })
})

describe("paste detection — column.valueParser precedence (cross-editor contract)", () => {
  test("number editor passes the column object so detectPastedValue can read valueParser", () => {
    // Pin that the column reaches detectPastedValue; without it the
    // consumer's parser would be skipped and the editor would always
    // use the built-in fallback. Per the handoff: "Falls through to
    // the column's valueParser if defined; otherwise uses the
    // editor's built-in parser."
    expect(numberSource).toMatch(/detectPastedValue\(\{[\s\S]*?column,[\s\S]*?\}\)/)
  })

  test("date editor passes the column object so detectPastedValue can read valueParser", () => {
    expect(dateSource).toMatch(/detectPastedValue\(\{[\s\S]*?column,[\s\S]*?\}\)/)
  })
})
