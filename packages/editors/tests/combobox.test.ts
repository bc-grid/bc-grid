import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { findOptionIndexByValue, selectedIndicesFromValues } from "../src/shadcn/Combobox"

/**
 * Pure-helper + source-shape regression guards for the shadcn
 * Combobox primitive (v0.7 PR-C2 — `packages/editors/src/shadcn/Combobox.tsx`).
 *
 * Replaces the legacy guard in `internal/combobox.tsx` (deleted in
 * PR-C2). Behavioural correctness is covered by Playwright at
 * `apps/examples/tests/editor-{select,multi-select,autocomplete}.pw.ts`.
 */

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in-progress", label: "In progress" },
  { value: "closed", label: "Closed" },
  { value: 3, label: "Escalated" },
] as const

describe("findOptionIndexByValue", () => {
  test("locates options by exact typed value", () => {
    expect(findOptionIndexByValue(STATUS_OPTIONS, "open")).toBe(0)
    expect(findOptionIndexByValue(STATUS_OPTIONS, "closed")).toBe(2)
  })

  test("string-coerces typed values so non-string options resolve cleanly", () => {
    // 3 is the typed value for "Escalated"; the option-value lookup
    // walks via `editorOptionToString` so consumer-supplied numbers /
    // booleans / objects round-trip without surprise.
    expect(findOptionIndexByValue(STATUS_OPTIONS, 3)).toBe(3)
    expect(findOptionIndexByValue(STATUS_OPTIONS, "3")).toBe(3)
  })

  test("returns -1 for nullish or unknown targets", () => {
    expect(findOptionIndexByValue(STATUS_OPTIONS, null)).toBe(-1)
    expect(findOptionIndexByValue(STATUS_OPTIONS, undefined)).toBe(-1)
    expect(findOptionIndexByValue(STATUS_OPTIONS, "missing")).toBe(-1)
  })
})

describe("selectedIndicesFromValues (multi-select resolver)", () => {
  test("maps every value present in options to its index", () => {
    expect(selectedIndicesFromValues(STATUS_OPTIONS, ["open", "closed"])).toEqual([0, 2])
  })

  test("preserves caller order, not option order", () => {
    expect(selectedIndicesFromValues(STATUS_OPTIONS, ["closed", "open"])).toEqual([2, 0])
  })

  test("silently drops values not in the options list", () => {
    expect(selectedIndicesFromValues(STATUS_OPTIONS, ["open", "removed-value", "closed"])).toEqual([
      0, 2,
    ])
  })

  test("handles an empty values array as no selection", () => {
    expect(selectedIndicesFromValues(STATUS_OPTIONS, [])).toEqual([])
  })

  test("drops nullish entries without throwing", () => {
    expect(selectedIndicesFromValues(STATUS_OPTIONS, [null, "open", undefined])).toEqual([0])
  })
})

describe("multi-mode Enter contract — keyboard intercept (#427 preserved post-PR-C2)", () => {
  // The repo's test runner is bun:test with no DOM, so the keyboard
  // intercept's behaviour is pinned via a source-shape regression
  // guard. Behavioural correctness is covered by Playwright.
  //
  // The bug shape (#427): cmdk's default Enter dispatches an
  // item-select event, which in multi-mode would toggle the active
  // option — re-introducing the silent-data-loss pattern that #390
  // fixed in the legacy combobox. The PR-C2 fix is on `<Command>`'s
  // `onKeyDown` prop: `if (event.key === "Enter" && isMulti) event.preventDefault()`.
  // cmdk runs consumer's onKeyDown BEFORE its own switch, so
  // preventDefault skips cmdk's Enter handler. The Enter still bubbles
  // to the editor portal's commit handler.
  const here = fileURLToPath(new URL(".", import.meta.url))
  const source = readFileSync(`${here}../src/shadcn/Combobox.tsx`, "utf8")

  test("Command's onKeyDown override gates Enter on isMulti", () => {
    // Pin the gating expression so a refactor that drops the
    // `&& isMulti` (re-introducing toggle-on-Enter for multi-mode)
    // trips here loudly.
    expect(source).toMatch(/event\.key\s*===\s*"Enter"\s*&&\s*isMulti/)
  })

  test("Enter override calls preventDefault to skip cmdk's item-select", () => {
    // cmdk's switch is gated on `!event.defaultPrevented`. Pin the
    // preventDefault call so a refactor doesn't replace it with a
    // softer mechanism that fails to skip cmdk's handler.
    expect(source).toMatch(
      /if\s*\(event\.key\s*===\s*"Enter"\s*&&\s*isMulti\)\s*\{[\s\S]*?event\.preventDefault\(\)/,
    )
  })

  test("rationale comment cites #427 + the commit-on-Enter contract", () => {
    expect(source).toMatch(/#427/)
    expect(source).toMatch(/commit/i)
  })
})

describe("popover-stamped value contract (PR-C2 design decision Q1)", () => {
  // The shadcn Combobox stamps `data-bcgrid-combobox-value` (JSON-
  // encoded) on the popover content as the user picks options. The
  // editor's `getValue?` hook climbs from the focused CommandInput up
  // to `[data-bcgrid-combobox-root]` and reads this attribute.
  // Pin both the producer (Combobox stamps it) and the helper
  // (`readComboboxValueFromFocusEl` reads it via `closest()`) so a
  // refactor can't silently drop the contract.
  const here = fileURLToPath(new URL(".", import.meta.url))
  const source = readFileSync(`${here}../src/shadcn/Combobox.tsx`, "utf8")

  test("PopoverContent carries data-bcgrid-combobox-root + data-bcgrid-combobox-value", () => {
    expect(source).toMatch(/data-bcgrid-combobox-root="true"/)
    expect(source).toMatch(/data-bcgrid-combobox-value=\{typedValueJson\}/)
  })

  test("readComboboxValueFromFocusEl walks .closest('[data-bcgrid-combobox-root]')", () => {
    expect(source).toMatch(/focusEl\.closest<HTMLElement>\("\[data-bcgrid-combobox-root\]"\)/)
  })

  test("typedValueJson is JSON.stringify of the typed selection", () => {
    expect(source).toMatch(/JSON\.stringify\(values\)/)
    expect(source).toMatch(/JSON\.stringify\(options\[idx\]\?\.value\)/)
  })
})

describe("initialOptions wiring (v06-prepareresult-preload-select-multi)", () => {
  // Combobox accepts `initialOptions` so editors that resolve options
  // via `prepare()` (selectEditor, multiSelectEditor) can pass the
  // prepare-resolved list. The fallthrough must prefer initialOptions
  // over the static options prop.
  const here = fileURLToPath(new URL(".", import.meta.url))
  const source = readFileSync(`${here}../src/shadcn/Combobox.tsx`, "utf8")

  test("ComboboxBaseProps declares initialOptions alongside options", () => {
    expect(source).toMatch(/options:\s*readonly\s+EditorOption\[\]/)
    expect(source).toMatch(/initialOptions\?:\s*readonly\s+EditorOption\[\]\s*\|\s*undefined/)
  })

  test("Combobox prefers initialOptions over the options prop", () => {
    expect(source).toMatch(/const\s+options\s*=\s*initialOptions\s*\?\?\s*optionsProp/)
  })
})
