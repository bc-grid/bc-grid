import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Source-shape regression guards for the date / datetime / time
 * editor a11y fix (v07-editor-a11y-fix-date-aria-describedby).
 *
 * The audit at `docs/design/v1-editor-a11y-audit.md` flagged that
 * these three editors stamped only 4 of 5 ARIA states, skipping
 * `aria-label` and `aria-describedby` and not rendering the
 * visually-hidden error span that text / number / checkbox render.
 *
 * This file pins the fix:
 *   - `useId()` for a stable per-instance errorId
 *   - `editorAccessibleName(column, ...)` for the accessible name
 *   - `aria-label` + `aria-describedby` on the inputProps
 *   - `<span id={errorId} style={visuallyHiddenStyle}>{error}</span>` rendered when error truthy
 *
 * Behavioural correctness (DOM-mounted) is covered by the coordinator's
 * Playwright run. Source-shape pinning here ensures a refactor doesn't
 * silently regress the wiring.
 */

const here = fileURLToPath(new URL(".", import.meta.url))
const dateSource = readFileSync(`${here}../src/date.tsx`, "utf8")
const datetimeSource = readFileSync(`${here}../src/datetime.tsx`, "utf8")
const timeSource = readFileSync(`${here}../src/time.tsx`, "utf8")

const editors = [
  { name: "date", source: dateSource, label: "Date value" },
  { name: "datetime", source: datetimeSource, label: "Datetime value" },
  { name: "time", source: timeSource, label: "Time value" },
] as const

for (const { name, source, label } of editors) {
  describe(`${name} editor — a11y wiring (v07 audit fix)`, () => {
    test("imports useId from react", () => {
      expect(source).toMatch(/import\s*\{[^}]*\buseId\b[^}]*\}\s*from\s*"react"/)
    })

    test("imports editorAccessibleName + visuallyHiddenStyle from chrome", () => {
      expect(source).toMatch(/editorAccessibleName/)
      expect(source).toMatch(/visuallyHiddenStyle/)
    })

    test("declares a useId-backed errorId", () => {
      expect(source).toMatch(/const\s+errorId\s*=\s*useId\(\)/)
    })

    test("computes accessibleName via editorAccessibleName(column, default)", () => {
      // The default is per-editor (Date value / Datetime value / Time value)
      // — pin both the helper invocation and the per-editor default so a
      // refactor can't silently substitute a generic "Edit value".
      const re = new RegExp(`editorAccessibleName\\(column,\\s*"${label}"\\)`)
      expect(source).toMatch(re)
    })

    test("inputProps includes aria-label + aria-describedby", () => {
      // Contiguous block: both attrs live inside the inputProps literal.
      expect(source).toMatch(/"aria-label":\s*accessibleName\s*\|\|\s*undefined/)
      expect(source).toMatch(/"aria-describedby":\s*error\s*\?\s*errorId\s*:\s*undefined/)
    })

    test("renders the visually-hidden error span when error is truthy", () => {
      // The span is the target of aria-describedby; without it the link
      // would be a dangling reference. Pin both the conditional render
      // AND the visuallyHiddenStyle application.
      expect(source).toMatch(
        /error\s*\?\s*\(\s*<span\s+id=\{errorId\}\s+style=\{visuallyHiddenStyle\}>\s*\{error\}\s*<\/span>/,
      )
    })

    test("inputProps is spread onto either consumer's input or built-in <input>", () => {
      // The audit-fix wraps the return in a fragment so the error span
      // can render alongside the input. Pin the fragment shape so a
      // refactor can't silently drop the span.
      expect(source).toMatch(
        /InputComponent\s*\?\s*<InputComponent\s*\{\.\.\.inputProps\}\s*\/>\s*:\s*<input\s*\{\.\.\.inputProps\}\s*\/>/,
      )
    })
  })
}
