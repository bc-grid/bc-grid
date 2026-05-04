import { GlobalWindow } from "happy-dom"

const window = new GlobalWindow({ url: "http://localhost/" })
const windowRecord = window as unknown as Record<string, unknown>
const globalRecord = globalThis as unknown as Record<string, unknown>

const valueGlobals = [
  "document",
  "navigator",
  "location",
  "history",
  "customElements",
  "localStorage",
  "sessionStorage",
  "Node",
  "Text",
  "Element",
  "DocumentFragment",
  "HTMLElement",
  "HTMLButtonElement",
  "HTMLDivElement",
  "HTMLInputElement",
  "HTMLSelectElement",
  "HTMLSpanElement",
  "HTMLTableCellElement",
  "HTMLTableElement",
  "HTMLTableRowElement",
  "HTMLTextAreaElement",
  "SVGElement",
  "SVGSVGElement",
  "Event",
  "EventTarget",
  "CustomEvent",
  "FocusEvent",
  "InputEvent",
  "KeyboardEvent",
  "MouseEvent",
  "PointerEvent",
  "MutationObserver",
  "ResizeObserver",
  "IntersectionObserver",
  "DOMRect",
  "DOMRectReadOnly",
] as const

for (const property of valueGlobals) {
  if (property in windowRecord) {
    Object.defineProperty(globalRecord, property, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: windowRecord[property],
    })
  }
}

Object.defineProperty(globalRecord, "window", {
  configurable: true,
  enumerable: true,
  writable: true,
  value: window,
})

Object.defineProperty(globalRecord, "self", {
  configurable: true,
  enumerable: true,
  writable: true,
  value: window,
})

Object.defineProperty(globalRecord, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  writable: true,
  value: true,
})

const methodGlobals = [
  "cancelAnimationFrame",
  "getComputedStyle",
  "matchMedia",
  "requestAnimationFrame",
] as const

for (const property of methodGlobals) {
  const value = windowRecord[property]
  if (typeof value === "function") {
    Object.defineProperty(globalRecord, property, {
      configurable: true,
      writable: true,
      value: value.bind(window),
    })
  }
}
