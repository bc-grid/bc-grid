import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Source-shape regression guards for `v06-editor-async-validation`
 * (v0.6 §1). The async-validation infrastructure is already
 * complete in v0.5 — `column.validate` accepts `Promise<BcValidationResult>`
 * and an `AbortSignal`, the editing controller awaits, threads the
 * signal, and surfaces a `data-bc-grid-edit-state="pending"` attribute
 * during validating mode (#424).
 *
 * This file pins every wiring point so a refactor that drops the
 * await, the abort, the signal threading, or the pending visual
 * state silently regresses the consumer's async-validation flow.
 *
 * Behavioural verification (consumer's validator runs against a
 * server endpoint, abort fires on supersedure, pending visual state
 * surfaces) lives in the Playwright spec at
 * `apps/examples/tests/editor-async-validation.pw.ts` which the
 * coordinator runs at merge.
 *
 * Per `docs/recipes/async-validation.md`.
 */

const here = fileURLToPath(new URL(".", import.meta.url))
const coreSource = readFileSync(`${here}../../core/src/index.ts`, "utf8")
const controllerSource = readFileSync(`${here}../src/useEditingController.ts`, "utf8")
const editorPortalSource = readFileSync(`${here}../src/editorPortal.tsx`, "utf8")
const gridSource = readFileSync(`${here}../src/grid.tsx`, "utf8")

describe("public type surface — column.validate accepts Promise + AbortSignal", () => {
  test("BcGridColumn.validate signature includes signal?: AbortSignal", () => {
    expect(coreSource).toMatch(
      /validate\?:\s*\(\s*newValue:\s*TValue,\s*row:\s*TRow,\s*signal\?:\s*AbortSignal,?\s*\)\s*=>\s*BcValidationResult\s*\|\s*Promise<BcValidationResult>/,
    )
  })

  test("return type union supports Promise<BcValidationResult>", () => {
    // Pin the union literally — a refactor that narrows back to
    // sync-only would silently regress consumers using async
    // server-side uniqueness checks.
    expect(coreSource).toMatch(/BcValidationResult\s*\|\s*Promise<BcValidationResult>/)
  })
})

describe("editing controller — async-validation flow", () => {
  test("commit() awaits Promise.resolve(validator(...)) so sync + async both work", () => {
    // Pin the await + Promise.resolve dance so a refactor that
    // calls validator synchronously (assuming sync return) breaks
    // the async path silently.
    expect(controllerSource).toMatch(
      /await Promise\.resolve\(\s*validator\(parsedValue,\s*candidate\.row,\s*candidate\.columnId,\s*ac\.signal\)/,
    )
  })

  test("AbortController is created fresh per commit", () => {
    // Each commit gets its own AbortController; a superseded
    // commit's abort doesn't leak into the new one. Pin the per-
    // commit creation so a refactor that hoists the controller
    // out doesn't accidentally make supersedure abort the new
    // commit too.
    expect(controllerSource).toMatch(/const ac = new AbortController\(\)/)
    expect(controllerSource).toMatch(/validateAbortRef\.current = ac/)
  })

  test("supersedure aborts the in-flight validator before starting a new one", () => {
    // Pin the abort-then-create order so a refactor that flips it
    // (create new, then abort old) leaks an in-flight validator
    // into the new commit's lifetime.
    expect(controllerSource).toMatch(
      /validateAbortRef\.current\?\.abort\(\)[\s\S]*?const ac = new AbortController\(\)/,
    )
  })

  test("late-resolving validator is gated by ac.signal.aborted (no stale dispatch)", () => {
    // After abort, the validator may still resolve (the consumer's
    // fetch hasn't seen the abort yet). The controller MUST drop
    // the late result rather than dispatching validateResolved with
    // stale data. Pin the gate.
    expect(controllerSource).toMatch(/if\s*\(ac\.signal\.aborted\)\s*return/)
  })

  test("validator throw is treated as { valid: false } unless aborted", () => {
    // Async validators throw on network failure; the controller
    // catches and surfaces "Validation failed." (or the err.message)
    // as a validation rejection. Aborted throws are silently dropped
    // (the new commit owns the lifecycle). Pin both branches.
    expect(controllerSource).toMatch(
      /catch \(err\)\s*\{[\s\S]*?if\s*\(ac\.signal\.aborted\)\s*return[\s\S]*?Validation failed\./,
    )
  })

  test("cancel() aborts the in-flight validator", () => {
    expect(controllerSource).toMatch(
      /cancel = useCallback[\s\S]*?validateAbortRef\.current\?\.abort\(\)/,
    )
  })

  test("validateAbortRef is nulled when the resolved validator's controller still matches", () => {
    // Without this gate the next commit's abort would no-op against
    // a stale controller reference. Pin the identity check.
    expect(controllerSource).toMatch(
      /if\s*\(validateAbortRef\.current === ac\)\s*validateAbortRef\.current = null/,
    )
  })
})

describe("grid.tsx — column.validate forwarding threads the signal", () => {
  test("inner validate wrapper passes the signal through to column.source.validate", () => {
    // Pin the 3-arg call shape so a refactor that drops the signal
    // silently breaks consumer cancellation. The 4-arg controller-
    // side signature (value, row, columnId, signal) maps to the
    // 3-arg public signature (value, row, signal).
    expect(gridSource).toMatch(/column\.source\.validate\(value as never,\s*row,\s*signal\)/)
  })
})

describe("editor portal — pending visual state surfaces during validating mode", () => {
  test("pending = editState.mode === 'validating'", () => {
    expect(editorPortalSource).toMatch(/const pending = editState\.mode === "validating"/)
  })

  test("data-bc-grid-edit-state attribute renders 'pending' when pending is true", () => {
    // Pin the editorStateAttribute resolver. Consumer themes target
    // [data-bc-grid-edit-state="pending"] to render a spinner / tint
    // / disabled cursor during async validation. A refactor that
    // strips the attribute would silently break the visual contract.
    expect(editorPortalSource).toMatch(
      /editorStateAttribute\(\{[\s\S]*?error,[\s\S]*?pending[\s\S]*?\}\)[\s\S]*?if\s*\(pending\)\s*return\s*"pending"/,
    )
  })

  test("editor input is disabled while pending (prevents double-commits)", () => {
    // A user pressing Enter twice in fast succession during async
    // validation would race two commits. Pin the disable so the
    // input ignores keystrokes during the in-flight wait.
    expect(editorPortalSource).toMatch(/const disabledFlag = pending/)
  })

  test("data-bc-grid-edit-state attribute is rendered on the editor wrapper", () => {
    expect(editorPortalSource).toMatch(/data-bc-grid-edit-state=\{wrapperEditState\}/)
  })
})
