import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Worker1 v0.6 server tree expansion persistence — source-pattern
 * regression suite for the `preserveExpansionOnViewChange` opt-in.
 *
 * The behaviour is React-flavored async (viewKey change → expansion
 * clear OR auto-re-fetch children for previously-expanded rowIds).
 * Without a DOM in bun:test, the most useful coverage at this layer
 * is pinning the source shape: prop is plumbed through types,
 * useTreeServerState gates the viewKey-change clear on the prop, and
 * the auto-re-fetch effect watches `tree.rootIds` + iterates
 * expansionState. Behavior is exercised end-to-end by the existing
 * server-mode-switch Playwright + future v0.6.x bsncraft soak.
 */

const here = fileURLToPath(new URL(".", import.meta.url))
const serverGridSource = readFileSync(`${here}../src/serverGrid.tsx`, "utf8")
const typesSource = readFileSync(`${here}../src/types.ts`, "utf8")

describe("server tree expansion persistence (worker1 v0.6)", () => {
  test("BcServerGridProps surfaces preserveExpansionOnViewChange?: boolean", () => {
    expect(typesSource).toMatch(/preserveExpansionOnViewChange\?: boolean/)
  })

  test("JSDoc documents the default-false + auto-re-fetch semantics", () => {
    expect(typesSource).toMatch(/Default `false` matches today's behaviour/)
    expect(typesSource).toMatch(/auto-re-fetches children for any/)
  })

  test("composes with the #444 view-change-reset-policy family (preserveScroll/Selection/Focus)", () => {
    expect(typesSource).toMatch(/Composes with `preserveScrollOnViewChange`/)
    expect(typesSource).toMatch(/preserveSelectionOnViewChange/)
    expect(typesSource).toMatch(/preserveFocusOnViewChange/)
  })

  test("useTreeServerState reads the prop with default false", () => {
    expect(serverGridSource).toMatch(
      /const preserveExpansionOnViewChange = props\.preserveExpansionOnViewChange \?\? false/,
    )
  })

  test("default path: clears uncontrolled expansion on viewKey change", () => {
    // The new viewKey-change effect: when default + uncontrolled,
    // setUncontrolledExpansion(new Set<RowId>()) fires.
    expect(serverGridSource).toMatch(/if \(preserveExpansionOnViewChange\) \{/)
    expect(serverGridSource).toMatch(/if \(expansionControlled\) return/)
    expect(serverGridSource).toMatch(/setUncontrolledExpansion\(new Set<RowId>\(\)\)/)
  })

  test("opt-in path: auto-re-fetch effect watches tree.rootIds + iterates expansionState", () => {
    expect(serverGridSource).toMatch(/if \(!preserveExpansionOnViewChange\) return/)
    expect(serverGridSource).toMatch(/for \(const rowId of expansionState\)/)
    expect(serverGridSource).toMatch(/if \(!node\.hasChildren\) continue/)
    expect(serverGridSource).toMatch(/if \(node\.childIds\.length > 0\) continue/)
    expect(serverGridSource).toMatch(/void loadTreeChildren\(node\)/)
  })

  test("auto-re-fetch effect deps are tree.rootIds (not full tree, not expansionState)", () => {
    // Per the comment: "re-running on every expansion change would
    // loop because each loadTreeChildren resolution updates `tree`."
    expect(serverGridSource).toMatch(
      /\[tree\.rootIds, preserveExpansionOnViewChange, isTreeActive\]/,
    )
  })

  test("skips initial mount via previousTreeViewKeyRef === null guard", () => {
    expect(serverGridSource).toMatch(/previousTreeViewKeyRef = useRef<string \| null>\(null\)/)
    expect(serverGridSource).toMatch(/if \(previousTreeViewKeyRef\.current === null\)/)
  })
})
