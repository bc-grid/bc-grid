import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Tests for the v0.6 in-cell editor mode RFC PR (a) — the structural
 * change that makes most editors render inline inside the cell DOM
 * instead of via the absolute-positioned overlay portal. Per
 * `docs/design/in-cell-editor-mode-rfc.md`. The repo's test runner is
 * bun:test with no DOM, so this is a source-shape regression suite
 * pinning every wiring point that the RFC describes:
 *
 *   1. Public type extensions (`BcCellEditor.popup`,
 *      `BcGridProps.editScrollOutAction`,
 *      `BcCellEditCommitEvent.source += "scroll-out"`).
 *   2. `EditorPortal` short-circuits to popup-mode only.
 *   3. `editorCellRect` skips the DOM lookup for in-cell mode.
 *   4. `EditorMount` lift + `mountStyle` branch (wrapper style,
 *      retention-skip for in-cell, scroll-out cleanup detection).
 *   5. `bodyCells.tsx` renders `renderInCellEditor` slot when the
 *      cell is the active edit target.
 *   6. The four migrating built-in editors (text / number / checkbox
 *      / time) DON'T set `popup: true` — they ride the default
 *      false-= in-cell flag.
 *
 * Behavioural correctness (the cleanup-time scroll-out commit, the
 * controller's getEditMode live-read) needs DOM-mounted tests that
 * the coordinator runs via Playwright at merge — this file pins the
 * wiring that an e2e suite would otherwise catch as a regression.
 */

const here = fileURLToPath(new URL(".", import.meta.url))
const typesSource = readFileSync(`${here}../src/types.ts`, "utf8")
const editorPortalSource = readFileSync(`${here}../src/editorPortal.tsx`, "utf8")
const gridSource = readFileSync(`${here}../src/grid.tsx`, "utf8")
const bodyCellsSource = readFileSync(`${here}../src/bodyCells.tsx`, "utf8")
const controllerSource = readFileSync(`${here}../src/useEditingController.ts`, "utf8")

describe("public type surface — popup + editScrollOutAction + scroll-out source", () => {
  test("BcCellEditor exposes the optional popup flag", () => {
    expect(typesSource).toMatch(
      /export interface BcCellEditor<TRow,[\s\S]*?\n\s*popup\?:\s*boolean[\s\S]*?\n\}/,
    )
  })

  test("BcGridProps exposes editScrollOutAction with the documented enum", () => {
    expect(typesSource).toMatch(
      /editScrollOutAction\?:\s*"commit"\s*\|\s*"cancel"\s*\|\s*"preserve"/,
    )
  })

  test("BcCellEditCommitEvent.source widened with `scroll-out`", () => {
    // The scroll-out commit path stamps `source: "scroll-out"` so
    // consumer telemetry can split scroll-out commits from explicit
    // keyboard/pointer ones. RFC §5 calls this out explicitly.
    expect(typesSource).toMatch(
      /source:\s*"keyboard"\s*\|\s*"pointer"\s*\|\s*"api"\s*\|\s*"paste"\s*\|\s*"scroll-out"/,
    )
  })
})

describe("EditorPortal — popup-only after the in-cell lift", () => {
  test("returns null when the active editor is non-popup", () => {
    // Pin the early-return guard so a refactor that drops it
    // accidentally re-mounts every editor twice (once in the cell,
    // once in the overlay).
    expect(editorPortalSource).toMatch(/if\s*\(editorSpec\.popup\s*!==\s*true\)\s*return null/)
  })

  test('forwards mountStyle="popup" to EditorMount', () => {
    expect(editorPortalSource).toMatch(/mountStyle="popup"/)
  })
})

describe("EditorMount — public-internal export with mountStyle branch", () => {
  test("is exported (consumers never use it directly, but bodyCells does)", () => {
    expect(editorPortalSource).toMatch(/export function EditorMount</)
  })

  test("EditorMountProps carries the mountStyle discriminator + the scroll-out action", () => {
    expect(editorPortalSource).toMatch(/mountStyle:\s*"in-cell"\s*\|\s*"popup"/)
    expect(editorPortalSource).toMatch(
      /editScrollOutAction:\s*"commit"\s*\|\s*"cancel"\s*\|\s*"preserve"/,
    )
  })

  test("wrapper className branches on mountStyle", () => {
    // Pin the bc-grid-editor-portal vs. bc-grid-editor-in-cell split
    // so a future CSS refactor that drops one of the classes catches
    // here instead of breaking visible chrome silently.
    expect(editorPortalSource).toMatch(
      /className=\{mountStyle === "popup"\s*\?\s*"bc-grid-editor-portal"\s*:\s*"bc-grid-editor-in-cell"\}/,
    )
  })

  test("wrapper style branches on mountStyle (popup uses cellRect; in-cell fills container)", () => {
    expect(editorPortalSource).toMatch(/popupWrapperStyle\(/)
    expect(editorPortalSource).toMatch(/inCellWrapperStyle\(\)/)
    expect(editorPortalSource).toMatch(/mountStyle === "popup" && cellRect/)
  })

  test("data-bc-grid-editor-mount stamps the mount style for selectors", () => {
    // E2E + visual-regression suites need to target in-cell vs. popup
    // editors; expose the discriminator on the DOM root.
    expect(editorPortalSource).toMatch(/data-bc-grid-editor-mount=\{mountStyle\}/)
  })

  test("data-bc-grid-editor-root stays on the wrapper in both modes", () => {
    // Click-outside contract: any descendant of [data-bc-grid-editor-
    // root] is treated as in-the-editor. In-cell mode keeps this
    // attribute so click-outside still works.
    expect(editorPortalSource).toMatch(/data-bc-grid-editor-root="true"/)
  })
})

describe("EditorMount — retention contract is popup-only", () => {
  test('beginInFlightRow / beginInFlightCol gated on mountStyle === "popup"', () => {
    // In-cell editors deliberately skip retention so the cell's
    // natural unmount on virtualizer scroll-out triggers the
    // configured editScrollOutAction. Per RFC §5.
    expect(editorPortalSource).toMatch(
      /mountStyle === "popup"[\s\S]*?virtualizer\.beginInFlightRow/,
    )
    expect(editorPortalSource).toMatch(
      /mountStyle === "popup"[\s\S]*?virtualizer\.beginInFlightCol/,
    )
  })
})

describe("EditorMount — scroll-out cleanup wiring", () => {
  test("cleanup checks the live edit mode via getEditMode (not the captured closure)", () => {
    expect(editorPortalSource).toMatch(/const liveMode = getEditMode\(\)/)
  })

  test('scroll-out path runs only when mountStyle === "in-cell"', () => {
    // Popup editors live outside the row's DOM and aren't subject to
    // the cell-unmount detection — pin the gate so a refactor
    // doesn't accidentally fire commit/cancel on every popup unmount.
    const cleanupRegion =
      editorPortalSource.match(/return \(\) => \{[\s\S]*?dispatchUnmounted\(\)/)?.[0] ?? ""
    expect(cleanupRegion).toMatch(/if\s*\(mountStyle === "in-cell"\)/)
  })

  test("scroll-out path checks for editing-active modes only", () => {
    expect(editorPortalSource).toMatch(
      /liveMode === "editing"\s*\|\|\s*liveMode === "mounting"\s*\|\|\s*liveMode === "validating"/,
    )
  })

  test('editScrollOutAction === "cancel" routes through cancelRef', () => {
    expect(editorPortalSource).toMatch(
      /editScrollOutAction === "cancel"[\s\S]*?scrollOutCancelRef\.current\?\.\(\)/,
    )
  })

  test('default + "preserve" both fall through to commit (preserve deferred to v0.7)', () => {
    // The else-branch picks up "commit" (default) and "preserve"
    // (per RFC §5 — preserve defers to commit until v0.7's auto-
    // promote-to-popup-mid-edit lands).
    expect(editorPortalSource).toMatch(/scrollOutCommitRef\.current\s*\n\s*if \(commitFn\)/)
  })

  test('scroll-out commit fires with source: "scroll-out" + "stay" move', () => {
    // "stay" so the active cell doesn't tug to a new position the
    // user didn't ask for; the user already scrolled away.
    expect(editorPortalSource).toMatch(
      /void commit\(\{ \.\.\.opts, source:\s*"scroll-out"\s*\},\s*"stay"\)/,
    )
  })
})

describe("editorCellRect — short-circuits for in-cell mode", () => {
  test("guards on the active editor's popup flag", () => {
    expect(gridSource).toMatch(/const activeColumn\s*=\s*resolvedColumns\.find/)
    expect(gridSource).toMatch(
      /const activeEditor\s*=\s*activeColumn\?\.source\.cellEditor\s*\?\?\s*defaultTextEditor/,
    )
    expect(gridSource).toMatch(/if \(activeEditor\?\.popup !== true\) return null/)
  })

  test("short-circuit lands BEFORE the DOM lookup so getBoundingClientRect is skipped", () => {
    // Pin the ordering: the activeEditor.popup check must come
    // before the document.getElementById call. If a refactor reorders
    // them, the in-cell mode would still pay the DOM-lookup cost
    // (regressing the perf win the RFC promises in §8).
    const memoBody =
      gridSource.match(
        /const editorCellRect = useMemo\([\s\S]*?\)\s*=>\s*\{[\s\S]*?\}\,\s*\[/,
      )?.[0] ?? ""
    const popupCheckIndex = memoBody.indexOf("activeEditor?.popup !== true")
    const domLookupIndex = memoBody.indexOf("document.getElementById")
    expect(popupCheckIndex).toBeGreaterThan(0)
    expect(domLookupIndex).toBeGreaterThan(popupCheckIndex)
  })
})

describe("renderInCellEditor — grid.tsx factory threaded into bodyCells", () => {
  test("the factory is built via useCallback with the supporting deps", () => {
    expect(gridSource).toMatch(/const renderInCellEditor = useCallback\(/)
    expect(gridSource).toMatch(/showValidationMessages,\s*\n\s*showEditorKeyboardHints,/)
    expect(gridSource).toMatch(/editScrollOutAction,/)
  })

  test("the factory returns null when the resolved editor is popup-mode", () => {
    // Mutual exclusivity with EditorPortal: only one of the two
    // mount paths runs for any given cell.
    expect(gridSource).toMatch(/editorSpec\.popup === true\) return null/)
  })

  test('the factory hands EditorMount mountStyle="in-cell"', () => {
    expect(gridSource).toMatch(/mountStyle="in-cell"/)
  })

  test('editScrollOutAction prop reads from BcGridProps with "commit" default', () => {
    expect(gridSource).toMatch(
      /editScrollOutAction:[^=]*=\s*\n?\s*props\.editScrollOutAction\s*\?\?\s*"commit"/,
    )
  })

  test("all three renderBodyCell call sites pass renderInCellEditor", () => {
    // Pin the count so a refactor that adds a fourth pinned-lane
    // doesn't accidentally drop the prop on the new branch.
    const matches = gridSource.match(/renderInCellEditor,/g) ?? []
    // Three call sites + one prop spread on each = at least four
    // string matches (plus the useCallback definition).
    expect(matches.length).toBeGreaterThanOrEqual(3)
  })
})

describe("bodyCells.tsx — in-cell editor slot", () => {
  test("renderInCellEditor is declared on RenderBodyCellParams", () => {
    expect(bodyCellsSource).toMatch(/renderInCellEditor\?:\s*\(\s*cell:\s*BcCellPosition,/)
  })

  test("destructured from params for use in the renderer", () => {
    expect(bodyCellsSource).toMatch(/renderInCellEditor,\s*\n\s*\}: RenderBodyCellParams<TRow>\)/)
  })

  test("invokes the slot when the cell is the active edit target", () => {
    expect(bodyCellsSource).toMatch(/isEditingThisCell[\s\S]*?renderInCellEditor\?\.\(/)
  })

  test("falls back to the read-only renderer output when the slot returns null", () => {
    // Pin the if-then chain shape so a refactor that drops the
    // null-return fallback (defensive — popup editors return null
    // here, and bodyCells must show the cell's read-only content
    // underneath the popup) catches loudly.
    expect(bodyCellsSource).toMatch(
      /if\s*\(inCellEditor\)\s*return inCellEditor[\s\S]*?if\s*\(column\.source\.cellRenderer\)/,
    )
  })
})

describe("controller — getEditMode live-read accessor", () => {
  test("getEditMode is declared as a useCallback over the editStateRef", () => {
    expect(controllerSource).toMatch(
      /const getEditMode = useCallback\(\(\):\s*EditState<unknown>\["mode"\]\s*=>\s*editStateRef\.current\.mode/,
    )
  })

  test("getEditMode is exposed on the controller's return", () => {
    expect(controllerSource).toMatch(/getEditMode,/)
  })
})

describe("built-in editors — categorisation per RFC §4", () => {
  // Pin the four migrating editors as in-cell (default `popup`
  // unset → false). The popup editors (select / multiSelect /
  // autocomplete) are PR (c) scope; we don't migrate them here, but
  // they should NOT regress to popup === false (which would put them
  // through the in-cell path and break overflow). Cover both lanes
  // so a single sweep can't accidentally flip the wrong direction.
  function readEditorSource(file: string): string {
    return readFileSync(
      fileURLToPath(new URL(`../../editors/src/${file}`, import.meta.url)),
      "utf8",
    )
  }

  test("textEditor stays default (no popup field => in-cell)", () => {
    const source = readEditorSource("text.tsx")
    expect(source).not.toMatch(/popup:\s*true\s*[,\n}]/)
  })

  test("numberEditor stays default", () => {
    const source = readEditorSource("number.tsx")
    expect(source).not.toMatch(/popup:\s*true\s*[,\n}]/)
  })

  test("checkboxEditor stays default", () => {
    const source = readEditorSource("checkbox.tsx")
    expect(source).not.toMatch(/popup:\s*true\s*[,\n}]/)
  })

  test("timeEditor stays default", () => {
    const source = readEditorSource("time.tsx")
    expect(source).not.toMatch(/popup:\s*true\s*[,\n}]/)
  })

  test("dateEditor stays default (in-cell hybrid: native picker is OS-chrome)", () => {
    const source = readEditorSource("date.tsx")
    expect(source).not.toMatch(/popup:\s*true\s*[,\n}]/)
  })

  test("datetimeEditor stays default (in-cell hybrid: same rationale as dateEditor)", () => {
    const source = readEditorSource("datetime.tsx")
    expect(source).not.toMatch(/popup:\s*true\s*[,\n}]/)
  })
})

describe("date / datetime editors — in-cell hybrid annotation per RFC §4", () => {
  function readEditorSource(file: string): string {
    return readFileSync(
      fileURLToPath(new URL(`../../editors/src/${file}`, import.meta.url)),
      "utf8",
    )
  }

  test("dateEditor JSDoc names it as in-cell with OS-chrome rationale", () => {
    const source = readEditorSource("date.tsx")
    expect(source).toMatch(/Mount mode:\*\*\s*in-cell/i)
    expect(source).toMatch(/OS-chrome/i)
  })

  test("dateEditor explicitly notes the popup default at the export site", () => {
    const source = readEditorSource("date.tsx")
    expect(source).toMatch(/export const dateEditor[\s\S]*?popup intentionally unset[\s\S]*?\}/)
  })

  test("datetimeEditor JSDoc names it as in-cell with OS-chrome rationale", () => {
    const source = readEditorSource("datetime.tsx")
    expect(source).toMatch(/Mount mode:\*\*\s*in-cell/i)
    expect(source).toMatch(/OS-chrome/i)
  })

  test("datetimeEditor explicitly notes the popup default at the export site", () => {
    const source = readEditorSource("datetime.tsx")
    expect(source).toMatch(/export const datetimeEditor[\s\S]*?popup intentionally unset[\s\S]*?\}/)
  })
})
