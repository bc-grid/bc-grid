import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { ColumnId, RowId } from "@bc-grid/core"
import {
  type BcCellEditEntry,
  applyAsyncCommitRollback,
  isCellEditCommitResult,
} from "../src/useEditingController"

/**
 * Tests for `BcCellEditCommitResult<TRow>` — the opt-in async-settle
 * shape that lets `<BcGrid>` consumers run the same optimistic /
 * rollback / overlay lifecycle `<BcServerGrid>` already runs through
 * `onServerRowMutation`. Surfaced 2026-05-03 by the bsncraft v0.5
 * alpha.1 editing-pass review.
 *
 * Two layers:
 *
 *   1. Behavioural unit tests for the pure helpers
 *      (`isCellEditCommitResult`, `applyAsyncCommitRollback`) — these
 *      pin concurrency / rollback semantics independently of React.
 *   2. Source-shape regression guards on `useEditingController.ts` —
 *      the repo's test runner has no DOM, so the wiring through
 *      `commit` / `clearCell` / `commitFromPasteApplyPlan` is pinned
 *      via source-shape assertions (matches the `clearCell` test
 *      pattern in `editingController.test.ts`).
 */

const rowA = "row-a" as RowId
const colName = "name" as ColumnId

describe("isCellEditCommitResult — discriminator for the opt-in async-settle shape", () => {
  test("recognises an accepted result", () => {
    expect(isCellEditCommitResult({ status: "accepted" })).toBe(true)
  })

  test("recognises an accepted result with row patch", () => {
    expect(isCellEditCommitResult({ status: "accepted", row: { id: 1 } })).toBe(true)
  })

  test("recognises a rejected result with reason", () => {
    expect(isCellEditCommitResult({ status: "rejected", reason: "Conflict." })).toBe(true)
  })

  test("rejects undefined / void (the legacy fire-and-forget settle)", () => {
    expect(isCellEditCommitResult(undefined)).toBe(false)
    expect(isCellEditCommitResult(null)).toBe(false)
  })

  test("rejects plain objects without a status discriminator", () => {
    expect(isCellEditCommitResult({})).toBe(false)
    expect(isCellEditCommitResult({ row: { id: 1 } })).toBe(false)
    expect(isCellEditCommitResult({ reason: "Something." })).toBe(false)
  })

  test("rejects objects with a status that isn't accepted/rejected", () => {
    // Guard against accidental forwarding of `ServerMutationResult`'s
    // third "conflict" status — `BcCellEditCommitResult` deliberately
    // ships the smaller two-value enum so consumers don't have to
    // think about server-block-cache concerns at the cell level.
    expect(isCellEditCommitResult({ status: "conflict" })).toBe(false)
    expect(isCellEditCommitResult({ status: "pending" })).toBe(false)
  })

  test("rejects primitives", () => {
    expect(isCellEditCommitResult("rejected")).toBe(false)
    expect(isCellEditCommitResult(42)).toBe(false)
    expect(isCellEditCommitResult(true)).toBe(false)
  })
})

describe("applyAsyncCommitRollback — shared rollback for thrown + result-shaped rejection", () => {
  function makeEntry(overrides: Partial<BcCellEditEntry> = {}): BcCellEditEntry {
    return {
      pending: true,
      mutationId: "m-1",
      previousValue: "before",
      ...overrides,
    }
  }

  test("deletes the overlay patch + flips entry into the error state", () => {
    const entry = makeEntry()
    const patches = new Map<RowId, Map<ColumnId, unknown>>([
      [rowA, new Map<ColumnId, unknown>([[colName, "after"]])],
    ])

    applyAsyncCommitRollback({
      patches,
      entry,
      rowId: rowA,
      columnId: colName,
      reason: "Name is required.",
    })

    expect(patches.get(rowA)).toBeUndefined()
    expect(entry).toEqual({
      pending: false,
      mutationId: "m-1",
      previousValue: "before",
      error: "Name is required.",
    })
  })

  test("falls back to a default error message when reason is undefined", () => {
    // Thrown-exception path passes `err instanceof Error ? err.message
    // : undefined` — so `reason` may be undefined for non-Error throws
    // (e.g. `throw "boom"` or a plain object). The default message
    // matches the legacy "Server rejected the edit." string so AT
    // announces stay consistent across both rejection paths.
    const entry = makeEntry()
    const patches = new Map<RowId, Map<ColumnId, unknown>>([
      [rowA, new Map<ColumnId, unknown>([[colName, "after"]])],
    ])

    applyAsyncCommitRollback({
      patches,
      entry,
      rowId: rowA,
      columnId: colName,
      reason: undefined,
    })

    expect(entry.error).toBe("Server rejected the edit.")
  })

  test("preserves other columns' overlay patches on the same row", () => {
    const entry = makeEntry()
    const patches = new Map<RowId, Map<ColumnId, unknown>>([
      [
        rowA,
        new Map<ColumnId, unknown>([
          [colName, "after"],
          ["total" as ColumnId, 42],
        ]),
      ],
    ])

    applyAsyncCommitRollback({
      patches,
      entry,
      rowId: rowA,
      columnId: colName,
      reason: "Bad input.",
    })

    // The rejected cell drops; the sibling on the same row stays.
    expect(patches.get(rowA)?.has(colName)).toBe(false)
    expect(patches.get(rowA)?.get("total" as ColumnId)).toBe(42)
  })

  test("removes the row map entirely once its last patch is dropped", () => {
    // Mirrors `pruneOverlayPatches`'s housekeeping: an empty per-row
    // Map is wasted memory and a footgun for any iteration that
    // doesn't filter on `.size`. Keeps the overlay shape consistent
    // whether we reach empty via prune, discard, or rollback.
    const entry = makeEntry()
    const patches = new Map<RowId, Map<ColumnId, unknown>>([
      [rowA, new Map<ColumnId, unknown>([[colName, "after"]])],
    ])

    applyAsyncCommitRollback({
      patches,
      entry,
      rowId: rowA,
      columnId: colName,
      reason: "Bad.",
    })

    expect(patches.has(rowA)).toBe(false)
  })

  test("no-op safe when the row has no patches", () => {
    // Pure helper has no early return — but the entry mutation path
    // is independent of patch existence. Pin that calling rollback
    // on a row with no patches still flips the entry into error
    // state without throwing.
    const entry = makeEntry()
    const patches = new Map<RowId, Map<ColumnId, unknown>>()

    expect(() =>
      applyAsyncCommitRollback({
        patches,
        entry,
        rowId: rowA,
        columnId: colName,
        reason: "Bad.",
      }),
    ).not.toThrow()

    expect(entry.error).toBe("Bad.")
    expect(entry.pending).toBe(false)
  })
})

describe("commit + clearCell + commitFromPasteApplyPlan honour the result-shape", () => {
  // The repo's test runner is bun:test with no DOM, so the wiring
  // through useEditingController's three commit paths is pinned via
  // source-shape assertions. Behavioural correctness of the helpers
  // they call is covered by the suites above. Source-shape catches
  // accidental drops during refactors (e.g. removing the
  // isCellEditCommitResult check from one of the three call sites).
  const here = fileURLToPath(new URL(".", import.meta.url))
  const source = readFileSync(`${here}../src/useEditingController.ts`, "utf8")

  function bodyOf(name: string): string {
    // Match `const <name> = useCallback(... )` up to the matching
    // ", deps]," line — the existing `clearCell` test does the same
    // shape match for its body extraction.
    const re = new RegExp(`const ${name} = useCallback[\\s\\S]*?\\n {2}\\)`)
    return source.match(re)?.[0] ?? ""
  }

  test("commit branches on isCellEditCommitResult after async settle", () => {
    const body = bodyOf("commit")
    expect(body).toContain("isCellEditCommitResult<TRow>(settled)")
    expect(body).toContain('settled.status === "rejected"')
    expect(body).toContain("settled.row")
  })

  test("commit calls applyAsyncCommitRollback on the rejected branch", () => {
    const body = bodyOf("commit")
    // Both the result-shaped rejection AND the thrown-exception catch
    // should funnel through the shared helper so they stay in
    // lockstep — same patch deletion, same default error message.
    const occurrences = (body.match(/applyAsyncCommitRollback\(/g) ?? []).length
    expect(occurrences).toBeGreaterThanOrEqual(2)
  })

  test("commit dispatches a serverError announce after rejection", () => {
    const body = bodyOf("commit")
    expect(body).toMatch(/announce\?\.\(\{\s*kind:\s*"serverError"/)
  })

  test("commit re-extracts the cell value from settled.row when accepted", () => {
    const body = bodyOf("commit")
    // Server-confirmed row is consumed via the existing getCellValue
    // helper so valueGetter / field resolution stays in one place.
    expect(body).toContain("getCellValue(settled.row, candidate.column)")
  })

  test("clearCell mirrors commit's result-shape branching", () => {
    const body = bodyOf("clearCell")
    expect(body).toContain("isCellEditCommitResult<TRow>(settled)")
    expect(body).toContain('settled.status === "rejected"')
    expect(body).toContain("getCellValue(settled.row, candidate.column)")
    expect(body).toContain("applyAsyncCommitRollback(")
  })

  test("commitFromPasteApplyPlan honours the result-shape inside the .then chain", () => {
    const body = bodyOf("commitFromPasteApplyPlan")
    expect(body).toContain("isCellEditCommitResult<TRow>(settled)")
    expect(body).toContain('settled.status === "rejected"')
    expect(body).toContain("getCellValue(settled.row, commitEntry.column)")
    // The paste path uses `rollbackPasteCommit` (already wired) for
    // its rollback so a result-shaped rejection wraps `reason` in an
    // Error and re-uses the same code path.
    expect(body).toMatch(/rollbackPasteCommit\([\s\S]*?settled\.reason/)
  })

  test("the controller exposes the new helpers", () => {
    // Pin exports so a refactor that drops them (or renames them
    // internally) trips the test instead of silently breaking
    // consumer-side type imports.
    expect(source).toContain("export function isCellEditCommitResult")
    expect(source).toContain("export function applyAsyncCommitRollback")
  })
})

describe("BcCellEditCommitResult is the public shape on BcGridProps.onCellEditCommit", () => {
  // Source-shape pin on types.ts so the public API surface diff in
  // CI catches a future signature regression.
  const here = fileURLToPath(new URL(".", import.meta.url))
  const typesSource = readFileSync(`${here}../src/types.ts`, "utf8")

  test("BcCellEditCommitResult interface is exported", () => {
    expect(typesSource).toMatch(/export interface BcCellEditCommitResult<TRow>/)
  })

  test("the result has a two-value status enum (no conflict)", () => {
    // Conflict is a server-row-model concern (block cache invalidation,
    // revision check) — not relevant at the cell level. Pinning the
    // smaller enum here keeps the consumer-facing surface small.
    expect(typesSource).toMatch(/status:\s*"accepted"\s*\|\s*"rejected"/)
  })

  test("the public BcCellEditCommitHandler<TRow> alias resolves the widened signature", () => {
    // The handler is hoisted into a named alias so the biome
    // `noConfusingVoidType` override can target a single file
    // (`packages/react/src/types.ts`) rather than every callsite.
    expect(typesSource).toMatch(
      /export type BcCellEditCommitHandler<TRow>\s*=\s*\([\s\S]*?\)\s*=>\s*void\s*\|\s*Promise<undefined\s*\|\s*BcCellEditCommitResult<TRow>>/,
    )
  })

  test("BcGridProps.onCellEditCommit uses the named handler alias", () => {
    // Pin that the BcGridProps callsite forwards through the shared
    // alias so a future signature change at the type origin
    // propagates to the public surface in one place.
    expect(typesSource).toMatch(/onCellEditCommit\?:\s*BcCellEditCommitHandler<TRow>/)
  })
})
