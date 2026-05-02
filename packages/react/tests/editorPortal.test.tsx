import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { type ComponentType, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  EditorValidationPopover,
  defaultTextEditor,
  findActiveEditorInput,
  readEditorInputValue,
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

  test("reads select typed option values without running valueParser", () => {
    const select = {
      tagName: "SELECT",
      multiple: false,
      selectedIndex: 1,
      value: "closed",
      __bcGridSelectOptionValues: ["open", 3],
    } as unknown as HTMLElement

    expect(readEditorInputValue(select)).toBe(3)
  })

  test("reads multi-select typed option arrays without running valueParser", () => {
    const select = {
      tagName: "SELECT",
      multiple: true,
      selectedOptions: [
        { index: 0, value: "open" },
        { index: 2, value: "escalated" },
      ],
      __bcGridSelectOptionValues: ["open", "closed", 3],
    } as unknown as HTMLElement

    expect(readEditorInputValue(select)).toEqual(["open", 3])
  })
})

describe("EditorValidationPopover", () => {
  test("renders nothing when there is no error", () => {
    const html = renderToStaticMarkup(createElement(EditorValidationPopover, { error: undefined }))

    expect(html).toBe("")
  })

  test("renders the error string visibly with the popover hook", () => {
    const html = renderToStaticMarkup(
      createElement(EditorValidationPopover, { error: "Quantity must be > 0" }),
    )

    expect(html).toContain('class="bc-grid-editor-error-popover"')
    expect(html).toContain('data-bc-grid-editor-error-popover="true"')
    expect(html).toContain("Quantity must be &gt; 0")
  })

  test("marks the popover aria-hidden so it does not double-announce", () => {
    // The editor's existing visually-hidden span (linked via
    // `aria-describedby` on the input) plus the controller's assertive
    // live-region announce already cover AT. The visible popover is for
    // sighted users only; AT must not announce it again on every render.
    const html = renderToStaticMarkup(createElement(EditorValidationPopover, { error: "Required" }))

    expect(html).toContain('aria-hidden="true"')
  })

  test("EditorMount renders the popover inside the editor-root wrapper", () => {
    // The document-level click-outside handler in `EditorMount` ignores
    // events whose target has an ancestor matching
    // `[data-bc-grid-editor-root]` or `[data-bc-grid-editor-portal]`.
    // The visible validation popover MUST be a descendant of the
    // editor-root wrapper so a sighted user clicking on it doesn't
    // commit-and-dismiss the editor mid-edit. Source-shape check; the
    // structural property is hard to assert without rendering EditorMount
    // with a real controller.
    const here = fileURLToPath(new URL(".", import.meta.url))
    const source = readFileSync(`${here}../src/editorPortal.tsx`, "utf8")

    // Capture the JSX subtree of the wrapper element (from
    // `data-bc-grid-editor-root="true"` to its `</div>`) and require the
    // popover element to live inside it.
    const wrapperBlock = source.match(/data-bc-grid-editor-root="true"[\s\S]*?<\/div>\s*\)\s*\}/)
    expect(wrapperBlock?.[0] ?? "").toContain("<EditorValidationPopover")
  })
})

describe("findActiveEditorInput", () => {
  test("returns null when the root is null (api commitEdit no-op path)", () => {
    expect(findActiveEditorInput(null)).toBeNull()
  })

  test("queries for the stable editor-input marker stamped by every built-in editor", () => {
    // Stub the only DOM surface the helper uses — `querySelector` — so the
    // test can run in node without a DOM. Asserts the helper passes the
    // exact selector the editor chrome stamps; if the marker ever moves,
    // this test fails and the api commit path is updated in lockstep.
    const calls: string[] = []
    const fakeInput = { tagName: "INPUT" } as HTMLElement
    const fakeRoot = {
      querySelector: (selector: string) => {
        calls.push(selector)
        return fakeInput
      },
    } as unknown as HTMLElement

    const result = findActiveEditorInput(fakeRoot)
    expect(result).toBe(fakeInput)
    expect(calls).toEqual(["[data-bc-grid-editor-input='true']"])
  })

  test("returns null when no editor is mounted (querySelector miss)", () => {
    const fakeRoot = {
      querySelector: () => null,
    } as unknown as HTMLElement

    expect(findActiveEditorInput(fakeRoot)).toBeNull()
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
