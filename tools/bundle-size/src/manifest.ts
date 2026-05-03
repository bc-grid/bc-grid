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
      baselineGzipBytes: 2284,
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
      // Bumped 2026-05-04 for v0.6.0-alpha.1 cut from 91.53 KiB →
      // 103.68 KiB. Accepted feature work since 0.5.0 GA: 3 v0.6
      // headlines (client tree row model phases 1+2 #447/#449,
      // fill handle #436, bulk row patch primitive #437); state-
      // persistence story (scroll-state controlled prop #450, server-
      // grid actions column #453); spreadsheet flows (fill-handle
      // series detection #456, editor cell undo/redo #454, row drag-
      // drop hooks #440); supporting work (bulk-action toolbar #439,
      // pinned totals row #446, saved-view storage recipe #441,
      // editor tab wraparound #448, BcSelection narrowing #442,
      // prepareresult preload select+multi #435); server-perf
      // hardening (prefetch budget #428, stale-flood test #433,
      // stale-viewKey gate #434, view-change reset policy #444,
      // optimistic rollback vs invalidate #445); bsncraft 0.5.0 GA
      // P0 patches (pinned-right + header overlap #443, in-cell
      // editor unmount on server grid #451). 150 KiB hard cap
      // unchanged; ~46 KiB headroom for the rest of v0.6 + v0.7.
      baselineGzipBytes: 106168,
    },
  ],
}
