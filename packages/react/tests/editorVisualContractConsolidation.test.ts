import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Tests for the v0.6 editor visual contract consolidation
 * (planning doc §4 — pulled forward by worker3 handoff
 * `v06-editor-visual-contract-consolidation`). The pre-v0.6 visuals
 * lived in three CSS rule blocks (cell-level via
 * `data-bc-grid-cell-state` + `aria-invalid`; editor input via
 * `data-bc-grid-editor-state` + `aria-invalid`; editor portal via
 * `data-bc-grid-editor-state`) with overlapping but slightly
 * different contracts. Consumer themes had to override the same
 * colour in three places to keep them in sync.
 *
 * v0.6 collapses this onto a single canonical `data-bc-grid-edit-state`
 * attribute + four CSS custom properties that drive every surface.
 * Legacy attributes are preserved as deprecated aliases for one
 * release.
 *
 * The repo's test runner is bun:test with no DOM, so this is a
 * source-shape regression suite covering:
 *
 *   1. The four `--bc-grid-edit-state-*` tokens are declared.
 *   2. The new `[data-bc-grid-edit-state="..."]` cascade reads from
 *      the tokens.
 *   3. The legacy attribute selectors (`data-bc-grid-cell-state`,
 *      `data-bc-grid-editor-state`, `aria-invalid`) are preserved as
 *      aliases — same effect, different selector — for one release.
 *   4. React components stamp BOTH the new attribute AND the legacy
 *      attribute(s) so consumer overrides on either keep working
 *      through v0.6.
 *   5. The 8 built-in editors funnel through the shared
 *      `editorStateAttrs({ error, pending })` helper.
 *   6. The migration doc carries the visual-contract section.
 */

const here = fileURLToPath(new URL(".", import.meta.url))
const themingSource = readFileSync(
  fileURLToPath(new URL("../../theming/src/styles.css", import.meta.url)),
  "utf8",
)
const bodyCellsSource = readFileSync(`${here}../src/bodyCells.tsx`, "utf8")
const editorPortalSource = readFileSync(`${here}../src/editorPortal.tsx`, "utf8")
const chromeSource = readFileSync(
  fileURLToPath(new URL("../../editors/src/chrome.ts", import.meta.url)),
  "utf8",
)
const migrationSource = readFileSync(
  fileURLToPath(new URL("../../../docs/migration/v0.6.md", import.meta.url)),
  "utf8",
)

describe("theming — consolidated --bc-grid-edit-state-* tokens", () => {
  test("all four canonical state tokens are declared on :root", () => {
    // Pin the four token names so a refactor that renames or drops
    // one trips loudly. Consumer themes override these names; they
    // are part of the v0.6 public theming contract.
    expect(themingSource).toMatch(/--bc-grid-edit-state-error-stroke:/)
    expect(themingSource).toMatch(/--bc-grid-edit-state-error-fg:/)
    expect(themingSource).toMatch(/--bc-grid-edit-state-error-bg:/)
    expect(themingSource).toMatch(/--bc-grid-edit-state-error-flash-bg:/)
    expect(themingSource).toMatch(/--bc-grid-edit-state-pending-stroke:/)
    expect(themingSource).toMatch(/--bc-grid-edit-state-dirty-stroke:/)
  })

  test("error stroke defaults to var(--bc-grid-invalid) so existing themes inherit", () => {
    // The token system is an indirection layer over the existing
    // `--bc-grid-invalid` / `--bc-grid-dirty` tokens. Pre-v0.6
    // themes that overrode the latter keep working unchanged
    // because the new tokens default to the old.
    expect(themingSource).toMatch(/--bc-grid-edit-state-error-stroke:\s*var\(--bc-grid-invalid\)/)
    expect(themingSource).toMatch(/--bc-grid-edit-state-pending-stroke:\s*var\(--bc-grid-dirty\)/)
    expect(themingSource).toMatch(/--bc-grid-edit-state-dirty-stroke:\s*var\(--bc-grid-dirty\)/)
  })
})

describe("theming — canonical [data-bc-grid-edit-state] selector cascade", () => {
  test("the error rule reads from --bc-grid-edit-state-error-stroke", () => {
    // The whole point of the consolidation: ONE selector, ONE token.
    // Pin the canonical rule so a refactor that splits it back out
    // catches loudly.
    expect(themingSource).toMatch(
      /\[data-bc-grid-edit-state="error"\]\s*\{[\s\S]*?box-shadow:\s*inset\s+3px\s+0\s+0\s+var\(--bc-grid-edit-state-error-stroke\)/,
    )
  })

  test("dirty + pending share one rule reading --bc-grid-edit-state-dirty-stroke", () => {
    // Per the planning doc §4 fix shape — the four logical states
    // collapse to three visual variants (idle, dirty/pending share
    // a stripe colour, error has its own). Pin the shared rule so
    // a refactor that splits dirty + pending into separate tokens
    // catches.
    expect(themingSource).toMatch(
      /\[data-bc-grid-edit-state="dirty"\],\s*\n\s*\[data-bc-grid-edit-state="pending"\]\s*\{[\s\S]*?var\(--bc-grid-edit-state-dirty-stroke\)/,
    )
  })

  test("validation popover composes via the same tokens (single source of truth)", () => {
    // The popover reads from the same edit-state tokens so a
    // consumer overriding ONE variable tints the cell stripe,
    // input border, AND popover in lockstep. Pre-v0.6 the popover
    // duplicated `var(--bc-grid-invalid)` directly.
    const popoverRegion =
      themingSource.match(/\.bc-grid-editor-error-popover\s*\{[\s\S]*?\n\}/)?.[0] ?? ""
    expect(popoverRegion).toContain("var(--bc-grid-edit-state-error-stroke)")
    expect(popoverRegion).toContain("var(--bc-grid-edit-state-error-bg)")
    expect(popoverRegion).toContain("var(--bc-grid-edit-state-error-fg)")
    // Pin the absence of the legacy direct-token reference so a
    // refactor doesn't accidentally drift back to the v0.5 shape.
    expect(popoverRegion).not.toContain("var(--bc-grid-invalid)")
  })

  test("validation flash keyframe reads from --bc-grid-edit-state-error-flash-bg", () => {
    // The 600ms pulse from worker3 #407 (audit P1-W3-4) now reads
    // its colour from the consolidated token cascade so consumer
    // tinting composes through the flash too.
    const keyframeRegion =
      themingSource.match(/@keyframes bc-grid-error-flash\s*\{[\s\S]*?\n\}/)?.[0] ?? ""
    expect(keyframeRegion).toContain("var(--bc-grid-edit-state-error-flash-bg)")
    expect(keyframeRegion).toContain("var(--bc-grid-edit-state-error-stroke)")
  })
})

describe("theming — legacy attribute aliases preserved for one release", () => {
  test("data-bc-grid-cell-state still styles cells (deprecation alias)", () => {
    // Pin the alias rules so a premature removal catches in CI
    // rather than breaking consumer overrides at upgrade time.
    // The aliases ride alongside the canonical selector.
    expect(themingSource).toMatch(
      /\.bc-grid-cell\[data-bc-grid-cell-state="error"\][\s\S]*?box-shadow:\s*inset\s+3px\s+0\s+0\s+var\(--bc-grid-edit-state-error-stroke\)/,
    )
  })

  test("data-bc-grid-editor-state still styles input border + portal pending cursor", () => {
    expect(themingSource).toMatch(
      /\.bc-grid-editor-input\[data-bc-grid-editor-state="error"\][\s\S]*?border-color:\s*var\(--bc-grid-edit-state-error-stroke\)/,
    )
    expect(themingSource).toMatch(
      /\.bc-grid-editor-portal\[data-bc-grid-editor-state="pending"\]\s*\{\s*cursor:\s*progress/,
    )
  })

  test("aria-invalid still styles cells + inputs (alias; new code targets data-bc-grid-edit-state)", () => {
    expect(themingSource).toMatch(
      /\.bc-grid-cell\[aria-invalid="true"\][\s\S]*?box-shadow:\s*inset\s+3px\s+0\s+0\s+var\(--bc-grid-edit-state-error-stroke\)/,
    )
    expect(themingSource).toMatch(
      /\.bc-grid-editor-input\[aria-invalid="true"\][\s\S]*?border-color:\s*var\(--bc-grid-edit-state-error-stroke\)/,
    )
  })
})

describe("React — dual attribute stamps (canonical + legacy)", () => {
  test("bodyCells stamps data-bc-grid-edit-state alongside data-bc-grid-cell-state", () => {
    // Both attributes need to land on the cell DOM so consumer
    // overrides on either keep working through v0.6. Pin the
    // ordering: canonical first (so it's the obvious one when
    // someone reads the JSX), legacy second with a deprecation
    // comment.
    expect(bodyCellsSource).toMatch(
      /data-bc-grid-edit-state=\{cellEditState\}[\s\S]{0,400}?data-bc-grid-cell-state=\{cellEditState\}/,
    )
  })

  test("EditorPortal wrapper stamps both data-bc-grid-edit-state + data-bc-grid-editor-state", () => {
    // Same dual-stamp pattern as bodyCells. The wrapper hosts the
    // active editor regardless of mountStyle (in-cell or popup).
    expect(editorPortalSource).toMatch(
      /data-bc-grid-edit-state=\{wrapperEditState\}[\s\S]{0,400}?data-bc-grid-editor-state=\{wrapperEditState\}/,
    )
  })

  test("DefaultTextEditor input stamps both attributes", () => {
    expect(editorPortalSource).toMatch(
      /data-bc-grid-edit-state=\{editorStateAttribute\(\{[\s\S]{0,200}?data-bc-grid-editor-state=\{editorStateAttribute\(\{/,
    )
  })
})

describe("editors/chrome — editorStateAttrs helper produces the dual-attribute pair", () => {
  test("editorStateAttrs is exported with the documented dual-attribute return shape", () => {
    expect(chromeSource).toMatch(/export function editorStateAttrs\(/)
    // Both attribute keys must be in the return object.
    expect(chromeSource).toMatch(/"data-bc-grid-edit-state":\s*state/)
    expect(chromeSource).toMatch(/"data-bc-grid-editor-state":\s*state/)
  })

  test("editorStateAttrs internally calls editorControlState (single resolver)", () => {
    // Per planning doc §4: "The editor portal + editor inputs read
    // from the same enum, never compute their own." The dual-
    // attribute helper centralises the resolution.
    expect(chromeSource).toMatch(
      /export function editorStateAttrs[\s\S]*?const state = editorControlState\(args\)/,
    )
  })

  test("the eight built-in editor inputs funnel through the helper", () => {
    // Walk every built-in editor file and assert it imports +
    // spreads `editorStateAttrs(...)` instead of stamping the
    // legacy attribute directly. A regression here means that
    // editor's input would only get the legacy attribute on it,
    // breaking the new canonical-attribute consumer overrides.
    function read(file: string): string {
      return readFileSync(
        fileURLToPath(new URL(`../../editors/src/${file}`, import.meta.url)),
        "utf8",
      )
    }
    for (const file of [
      "text.tsx",
      "number.tsx",
      "date.tsx",
      "datetime.tsx",
      "time.tsx",
      "checkbox.tsx",
      "internal/combobox.tsx",
      "internal/combobox-search.tsx",
    ]) {
      const source = read(file)
      expect(source).toMatch(/editorStateAttrs\(/)
      // Ensure they no longer stamp `data-bc-grid-editor-state` as
      // a literal JSX attribute (would skip the dual-attribute
      // helper). The string can still appear in JSDoc comments.
      const directStamps = source.match(/data-bc-grid-editor-state=\{/g) ?? []
      expect(directStamps.length).toBe(0)
    }
  })
})

describe("migration doc — visual contract section", () => {
  test("docs/migration/v0.6.md gains a `Visual contract consolidation` section", () => {
    expect(migrationSource).toMatch(
      /Visual contract consolidation\s*—\s*`data-bc-grid-edit-state`/i,
    )
  })

  test("the section names the four canonical tokens", () => {
    expect(migrationSource).toMatch(/--bc-grid-edit-state-error-stroke/)
    expect(migrationSource).toMatch(/--bc-grid-edit-state-pending-stroke/)
    expect(migrationSource).toMatch(/--bc-grid-edit-state-dirty-stroke/)
    expect(migrationSource).toMatch(/--bc-grid-edit-state-error-flash-bg/)
  })

  test("the section explicitly notes aria-invalid stays on the DOM (AT contract)", () => {
    // Critical for the consumer to understand: we deprecated
    // *styling* on the aria-invalid selector, not the attribute
    // itself. The attribute is still stamped — it's the
    // assistive-tech contract.
    expect(migrationSource).toMatch(/aria-invalid[\s\S]{0,200}?still stamped/i)
  })

  test("removal of the legacy aliases is scheduled for v0.7", () => {
    expect(migrationSource).toMatch(/Removal scheduled for v0\.7/i)
  })
})
