export interface BundleSizeEntryManifest {
  packageName: string
  bundlePath: string
  baselineGzipBytes: number
}

export interface BundleSizeManifest {
  name: string
  budgetGzipBytes: number
  maxRegressionPercent: number
  entries: readonly BundleSizeEntryManifest[]
}

export const bundleSizeManifest: BundleSizeManifest = {
  name: "core+virtualizer+animations+react",
  // Hard cap bumped 2026-05-03 from 100 KiB → 150 KiB. Maintainer
  // call: the v0.5 audit-driven feature train (mode switch, in-cell
  // editor, filter registry, context menu, validation flash, layout
  // pass) added substantive surface that the original 100 KiB target
  // predates. 150 KiB gives ~50 KiB headroom past current ~102 KiB so
  // v0.6 + v0.7 + v0.8 feature work fits without revisiting. Honest
  // about bc-grid's trajectory toward AG-Grid-Enterprise feature
  // parity; hosts that ship every bc-grid feature pay a small
  // per-page-load cost.
  budgetGzipBytes: 150 * 1024,
  // 10% soft drift marker during the v1 parity sprint (per `design.md §13`
  // 2026-04-30 entries): the API surface is intentionally growing. CI fails
  // on the hard 150 KiB cap, while this marker keeps drift visible in logs.
  // Reset the baseline after accepted feature work lands on main.
  maxRegressionPercent: 10,
  entries: [
    {
      packageName: "@bc-grid/core",
      bundlePath: "packages/core/dist/index.js",
      // Bumped 2026-05-04 for v0.6.0-alpha.2 cut from 2.23 KiB → 0.35 KiB.
      // Net shrink: tree-shaking improved when alpha.2 work train moved
      // server-grid types out of core's runtime exports into pure type
      // exports (server-block error params + retry config types only;
      // helper resolveBlockRetryDecision lives in @bc-grid/react).
      baselineGzipBytes: 357,
    },
    {
      packageName: "@bc-grid/virtualizer",
      bundlePath: "packages/virtualizer/dist/index.js",
      baselineGzipBytes: 7045,
    },
    {
      packageName: "@bc-grid/animations",
      bundlePath: "packages/animations/dist/index.js",
      baselineGzipBytes: 1759,
    },
    {
      packageName: "@bc-grid/react",
      bundlePath: "packages/react/dist/index.js",
      // Bumped 2026-05-04 for v0.7 Radix context/dropdown menu
      // migration PR-B1 from 112.12 KiB → 112.97 KiB. This imports
      // Radix ContextMenu/DropdownMenu + lucide glyphs on the live
      // chrome path while deleting the hand-rolled menu item and
      // context-menu icon registries. 150 KiB hard cap unchanged;
      // ~37 KiB headroom remains.
      baselineGzipBytes: 115684,
    },
  ],
}
