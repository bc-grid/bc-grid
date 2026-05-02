import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

/**
 * Contract regression: every built-in editor that hands `inputRef.current`
 * back to the framework via `focusRef` must do so inside a `useLayoutEffect`
 * (not a `useEffect`).
 *
 * Why: `EditorMount` (in `@bc-grid/react`) calls `focusRef.current?.focus()`
 * inside its own `useLayoutEffect`, and React fires children's
 * `useLayoutEffect` callbacks BEFORE parents' in the commit phase. A child
 * editor that assigns `focusRef.current` inside `useEffect` (which runs
 * after paint) will be observed by the parent as `null`, and click-outside
 * commit (`readEditorInputValue(focusRef.current)`) silently commits
 * `undefined`. PR #155 fixed this for `text` and `number`. The audit-2026-05
 * found `date` / `datetime` / `time` had regressed to `useEffect`; this test
 * pins the contract so they cannot drift back without breaking CI.
 *
 * Pure source-text assertion — the repo's test runner is bun:test with no
 * DOM, so a true commit-phase ordering test would require new infra. This
 * test catches the exact regression class against the same line each
 * editor uses.
 */

/**
 * Editors that own their own focus handoff inline. `select` was on this
 * list pre-v0.5; the v0.5 Combobox migration moved its focusRef
 * plumbing into the shared `internal/combobox.tsx` primitive so the
 * contract is enforced *there* (covered separately below). Adding
 * `multiSelect` / `autocomplete` to that primitive is the next-PR
 * follow-up — until then they keep their inline handoff and stay on
 * this list.
 */
const editorsToCheck = [
  "text",
  "number",
  "date",
  "datetime",
  "time",
  "multiSelect",
  "autocomplete",
  "checkbox",
] as const

const FOCUS_REF_BLOCK =
  /(use(?:Layout)?Effect)\(\(\) => \{\s*if \(focusRef && [a-zA-Z]+Ref\.current\) \{\s*;?(?:\(focusRef as \{[^}]+\}\)|focusRef)\.current = [a-zA-Z]+Ref\.current/

describe("editor focusRef contract", () => {
  for (const name of editorsToCheck) {
    test(`${name} editor assigns focusRef inside useLayoutEffect`, async () => {
      const source = await readEditorSource(`src/${name}.tsx`)
      assertFocusRefUsesLayoutEffect(source, `${name}.tsx`)
    })
  }

  test("internal Combobox primitive (used by select) assigns focusRef inside useLayoutEffect", async () => {
    // The v0.5 select editor delegates its focus handoff to the shared
    // Combobox primitive. Pin the contract there so the click-outside
    // / Tab path that reads `__bcGridComboboxValue` off the trigger
    // button continues to see a non-null `focusRef.current`.
    const source = await readEditorSource("src/internal/combobox.tsx")
    assertFocusRefUsesLayoutEffect(source, "internal/combobox.tsx")
  })
})

function assertFocusRefUsesLayoutEffect(source: string, label: string): void {
  const focusRefBlockMatch = source.match(FOCUS_REF_BLOCK)

  expect(
    focusRefBlockMatch,
    `${label} must contain a focusRef assignment block; pattern not found`,
  ).not.toBeNull()
  const effectKind = focusRefBlockMatch?.[1]

  expect(
    effectKind,
    `${label} focusRef assignment uses ${effectKind}; must be useLayoutEffect (children's commit-phase effects fire before parents'; useEffect would leave focusRef.current null when the framework reads it).`,
  ).toBe("useLayoutEffect")
}

async function readEditorSource(relPath: string): Promise<string> {
  const here = fileURLToPath(new URL(".", import.meta.url))
  return readFile(`${here}../${relPath}`, "utf8")
}
