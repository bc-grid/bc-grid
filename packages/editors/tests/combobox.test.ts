import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { findOptionIndexByValue, selectedIndicesFromValues } from "../src/internal/combobox"

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
    // Multi-select trigger renders chips in option order downstream;
    // the resolver is order-preserving so consumers can drive the
    // initial selection from a server-sent array without reshuffling.
    expect(selectedIndicesFromValues(STATUS_OPTIONS, ["closed", "open"])).toEqual([2, 0])
  })

  test("silently drops values not in the options list (matches v0.1 behaviour)", () => {
    // The v0.1 native `<select multiple>` shell silently dropped
    // missing values. The Combobox primitive preserves that contract
    // so the upgrade is non-breaking for consumer rows that carry
    // legacy / migrated values.
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

describe("multi-mode Enter contract — keyboard intercept (planning doc §5)", () => {
  // The repo's test runner is bun:test with no DOM, so the keyboard
  // intercept's behaviour is pinned via a source-shape regression
  // guard. Behavioural correctness is covered by the e2e at
  // `apps/examples/tests/editor-multi-select.pw.ts` (which uses
  // Enter to commit a chip set, not the Tab workaround the v0.5
  // alpha left in place).
  //
  // The bug shape (audit P1-W3-5b, surfaced fixing #372): the
  // Combobox keyboard intercept ran `updateSelection(activeIndex)`
  // on Enter regardless of mode. In multi mode `updateSelection`
  // toggles selection, so pressing Enter to commit the chip set
  // toggled OFF the most-recently-active option *before* the
  // editor portal wrapper saw the same Enter and ran commit. Silent
  // data loss for the headline gesture in chip-input UX. The fix
  // landed in #390 (v0.5 editor bundle 1); this regression guard
  // pins the contract so a refactor doesn't re-introduce the bug.
  const here = fileURLToPath(new URL(".", import.meta.url))
  const source = readFileSync(`${here}../src/internal/combobox.tsx`, "utf8")

  test("Enter handler gates updateSelection on !isMulti", () => {
    // Pin the gating expression so a refactor that drops `!isMulti`
    // (re-introducing the multi-mode toggle-on-Enter bug) trips
    // here loudly.
    expect(source).toMatch(
      /if\s*\(event\.key\s*===\s*"Enter"\)[\s\S]*?if\s*\(!isMulti\s*&&\s*open\s*&&\s*activeIndex\s*>=\s*0\)/,
    )
  })

  test("Enter handler returns early without preventDefault so the editor portal sees the same event", () => {
    // The whole point: in multi mode Enter must BUBBLE to the editor
    // portal wrapper so the wrapper commits the current chip set.
    // Calling event.preventDefault() would short-circuit the bubble
    // and break commit. Pin the absence so a refactor doesn't add
    // it "for symmetry" with the other key handlers.
    const enterRegion =
      source.match(/if\s*\(event\.key\s*===\s*"Enter"\)\s*\{[\s\S]*?return\s*\n\s*\}/)?.[0] ?? ""
    expect(enterRegion.length).toBeGreaterThan(0)
    expect(enterRegion).not.toMatch(/preventDefault/)
  })

  test("Space remains the toggle gesture (every mode, including multi)", () => {
    // Pin the Space handler's `updateSelection(activeIndex)` so a
    // refactor that mistakenly drops it (because Enter no longer
    // toggles in multi) catches loudly. Space is the toggle gesture
    // by design — chip-input UX needs both navigate (Arrow) and
    // toggle (Space) gestures while keeping Enter for commit.
    expect(source).toMatch(
      /if\s*\(event\.key\s*===\s*"\s"\)\s*\{[\s\S]*?event\.preventDefault\(\)[\s\S]*?updateSelection\(activeIndex\)/,
    )
  })

  test("the rationale comment cites the audit + the silent-data-loss reason", () => {
    // Pin the explanatory comment so a doc sweep doesn't strip the
    // load-bearing context. The comment is what tells the next
    // worker WHY the gating exists; without it a future refactor
    // is liable to "simplify" by removing the !isMulti guard.
    expect(source).toMatch(/audit P1-W3-5b/)
    expect(source).toMatch(/Toggling on Enter undoes the most-recently/i)
  })
})
