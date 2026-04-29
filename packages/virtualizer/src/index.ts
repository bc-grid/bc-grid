/**
 * @bc-grid/virtualizer — public surface.
 *
 * Per `api.md §9` the v0.1 frozen surface is:
 *
 *   export { Virtualizer }
 *   export type { VirtualItem, VirtualOptions, VirtualizerA11yInput,
 *                 VirtualRowA11yMeta, VirtualColumnA11yMeta }
 *
 * The package additionally exports:
 *
 *   - `DOMRenderer` (used by `@bc-grid/react`; not part of the consumer
 *     surface but required for the React layer to wire the engine to a
 *     host element).
 *   - `VirtualRow`, `VirtualCol`, `VirtualWindow` — axis-specific shapes
 *     that consumers iterating one axis can use directly without the
 *     `VirtualItem` discriminated union.
 *   - `VirtualizerOptions` — `@deprecated` alias for `VirtualOptions`,
 *     kept for spike-era back-compat.
 *   - `ScrollAlign` — re-export of `BcScrollAlign` from `@bc-grid/core` so
 *     consumers don't need to import from both packages.
 *   - `RenderCellParams`, `DOMRendererOptions` — DOMRenderer types.
 */

export {
  type InFlightHandle,
  type ScrollAlign,
  type VirtualCol,
  type VirtualColumnA11yMeta,
  type VirtualItem,
  Virtualizer,
  type VirtualizerA11yInput,
  type VirtualizerOptions,
  type VirtualOptions,
  type VirtualRow,
  type VirtualRowA11yMeta,
  type VirtualWindow,
} from "./virtualizer"

export {
  DOMRenderer,
  type DOMRendererOptions,
  type RenderCellParams,
} from "./dom-renderer"
