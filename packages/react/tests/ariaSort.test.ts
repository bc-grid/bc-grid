import { describe, expect, test } from "bun:test"
import { ariaSortFor } from "../src/headerCells"

/**
 * Per `accessibility-rfc §Semantic DOM Model`:
 * "Sortable headers set `aria-sort='ascending' | 'descending' | 'none'
 * | 'other'` only on the active sorted header where applicable."
 *
 * The helper resolves the attribute value from a column's current sort
 * direction (if any) and whether the column is sortable at all.
 */
describe("ariaSortFor — accessibility-rfc §Semantic DOM Model", () => {
  test("returns 'ascending' when the column is currently sorted ascending", () => {
    expect(ariaSortFor("asc", true)).toBe("ascending")
    // sortable flag is irrelevant once a direction is active.
    expect(ariaSortFor("asc", false)).toBe("ascending")
  })

  test("returns 'descending' when the column is currently sorted descending", () => {
    expect(ariaSortFor("desc", true)).toBe("descending")
    expect(ariaSortFor("desc", false)).toBe("descending")
  })

  test("returns 'none' when the column is sortable but not currently sorted", () => {
    expect(ariaSortFor(undefined, true)).toBe("none")
  })

  test("returns undefined when the column is not sortable", () => {
    expect(ariaSortFor(undefined, false)).toBeUndefined()
  })
})
