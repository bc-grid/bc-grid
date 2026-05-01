import { describe, expect, test } from "bun:test"
import { type ComponentType, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  defaultTextEditor,
  readEditorInputValue,
  shouldCommitOnPointerDown,
} from "../src/editorPortal"

describe("default editor chrome", () => {
  test("emits the shared editor input class and state hooks", () => {
    const html = renderDefaultEditor()

    expect(html).toContain('class="bc-grid-editor-input"')
    expect(html).toContain('data-bc-grid-editor-input="true"')
    expect(html).toContain('data-bc-grid-editor-kind="text-default"')
    expect(html).toContain('data-bc-grid-editor-state="idle"')
  })

  test("surfaces pending and error states on the default editor input", () => {
    const pending = renderDefaultEditor({ pending: true })
    const error = renderDefaultEditor({ error: "Required" })

    expect(pending).toContain("disabled")
    expect(pending).toContain('data-bc-grid-editor-state="pending"')
    expect(error).toContain('aria-invalid="true"')
    expect(error).toContain('data-bc-grid-editor-state="error"')
  })
})

describe("shouldCommitOnPointerDown — portal-aware click-outside contract", () => {
  // Per editing-rfc §Portal click-outside rules. Pin the contract as
  // a pure helper so the wrapper's document.pointerdown listener is
  // testable without firing real events.

  /**
   * Stub a target that exposes `closest(selector)` — the only DOM
   * surface the helper reads. The stub returns a truthy match when
   * any selector in the comma list appears in `markers`. This mirrors
   * `Element.prototype.closest` for the helper's two markers
   * (`data-bc-grid-editor-root`, `data-bc-grid-editor-portal`)
   * without dragging in happy-dom for one test.
   */
  function makeTarget(markers: readonly string[]): EventTarget {
    return {
      closest(selector: string): Element | null {
        const wanted = selector.split(",").map((part) => part.trim())
        const hit = wanted.some((part) => markers.includes(part))
        return hit ? ({} as Element) : null
      },
    } as unknown as EventTarget
  }

  test("returns false when the target is null or has no closest method", () => {
    expect(shouldCommitOnPointerDown(null)).toBe(false)
    // Non-Element EventTarget — e.g. window, document. The wrapper
    // listener attaches at the document level so `event.target` is
    // always an Element in practice, but the helper is defensive
    // against synthetic dispatches.
    expect(shouldCommitOnPointerDown({} as EventTarget)).toBe(false)
  })

  test("returns false when the click lands inside the editor's wrapper", () => {
    const target = makeTarget(["[data-bc-grid-editor-root]"])
    expect(shouldCommitOnPointerDown(target)).toBe(false)
  })

  test("returns false when the click lands inside a portaled popover", () => {
    // Date pickers / autocomplete dropdowns rendered via portal opt
    // in via `data-bc-grid-editor-portal` so the click stays inside
    // the editor's logical scope.
    const target = makeTarget(["[data-bc-grid-editor-portal]"])
    expect(shouldCommitOnPointerDown(target)).toBe(false)
  })

  test("returns false for nested popovers that match either marker", () => {
    // Belt-and-braces: a popover with both attributes (or one nested
    // inside another) still resolves to "do not commit". Avoids a
    // surprise when a custom editor stamps both markers on the same
    // element.
    const target = makeTarget(["[data-bc-grid-editor-root]", "[data-bc-grid-editor-portal]"])
    expect(shouldCommitOnPointerDown(target)).toBe(false)
  })

  test("returns true when the click lands outside both markers (commit-on-outside)", () => {
    // The grid header, a sibling cell, the page background — these
    // commit the open editor with `stay` move semantics so the user's
    // choice of outside target wins over the active cell.
    const target = makeTarget([])
    expect(shouldCommitOnPointerDown(target)).toBe(true)
  })
})

describe("DefaultTextEditor focusRef contract", () => {
  // Per editing-rfc §Lifecycle: child editors must hand `focusRef`
  // back BEFORE the framework's parent useLayoutEffect calls
  // `focusRef.current?.focus()`. React fires child layout effects
  // before parent layout effects in the commit phase, so a child
  // `useLayoutEffect` that assigns the ref lands in time. A child
  // `useEffect` runs after paint — too late; the framework reads the
  // ref as null and gives up. The default editor previously used
  // `useEffect` and would have shipped a silent focus-loss bug if a
  // consumer left `column.cellEditor` unset; this assertion guards the
  // fix without requiring a JSDOM mount.
  test("the bundled component source uses useLayoutEffect (not useEffect) to assign focusRef", () => {
    // The behaviour is timing-driven, not observable from SSR markup.
    // Read the source file and confirm the layout-effect import is
    // wired to the focusRef path. If a future refactor regresses to
    // useEffect, this test surfaces it before review.
    const fs = require("node:fs") as typeof import("node:fs")
    const path = require("node:path") as typeof import("node:path")
    const source = fs.readFileSync(
      path.join(import.meta.dir, "..", "src", "editorPortal.tsx"),
      "utf8",
    )
    // Slice from `function DefaultTextEditor` up to the next top-level
    // `function ` declaration (or the EOF), so we look only at the
    // default editor's body.
    const start = source.indexOf("function DefaultTextEditor(")
    expect(start).toBeGreaterThan(-1)
    const nextFn = source.indexOf("\nfunction ", start + 1)
    const body = source.slice(start, nextFn === -1 ? source.length : nextFn)
    // The focusRef-assignment effect lives inside the default editor
    // and must use useLayoutEffect.
    expect(body).toContain("useLayoutEffect")
    // Cleanup nulls the ref on unmount so a stale element doesn't
    // leak — same contract as the built-in `text` editor.
    expect(body).toMatch(/return \(\) => \{[\s\S]*current = null/)
    // Ensure no stray useEffect remained in the focusRef path.
    expect(body).not.toMatch(/useEffect\(\(\)\s*=>\s*\{[\s\S]*current = inputRef/)
  })
})

describe("readEditorInputValue", () => {
  test("reads checkbox checked state as a boolean commit value", () => {
    const checked = {
      tagName: "INPUT",
      type: "checkbox",
      checked: true,
      value: "on",
    } as unknown as HTMLElement
    const unchecked = {
      tagName: "INPUT",
      type: "checkbox",
      checked: false,
      value: "on",
    } as unknown as HTMLElement

    expect(readEditorInputValue(checked)).toBe(true)
    expect(readEditorInputValue(unchecked)).toBe(false)
  })

  test("continues to read non-checkbox inputs by value", () => {
    const input = {
      tagName: "INPUT",
      type: "text",
      value: "Acme",
    } as unknown as HTMLElement

    expect(readEditorInputValue(input)).toBe("Acme")
  })
})

function renderDefaultEditor(overrides: Record<string, unknown> = {}): string {
  const Component = defaultTextEditor.Component as ComponentType<Record<string, unknown>>
  return renderToStaticMarkup(
    createElement(Component, {
      initialValue: "Acme",
      commit: () => {},
      cancel: () => {},
      ...overrides,
    }),
  )
}
