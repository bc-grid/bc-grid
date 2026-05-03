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
  budgetGzipBytes: 100 * 1024,
  // 10% soft drift marker during the v1 parity sprint (per `design.md §13`
  // 2026-04-30 entries): the API surface is intentionally growing. CI fails
  // on the hard 100 KiB cap, while this marker keeps drift visible in logs.
  // Reset the baseline after accepted feature work lands on main.
  maxRegressionPercent: 10,
  entries: [
    {
      packageName: "@bc-grid/core",
      bundlePath: "packages/core/dist/index.js",
      baselineGzipBytes: 2120,
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
      // Reset 2026-05-02 evening after the v0.5 audit-refactor train
      // landed: useBcGridState (#359), apiRef expansion (#361/#366/#377),
      // server-hook trio (#363/#368/#371), Combobox migrations (#364/
      // #370/#372), four hero spike grids (#364/#367/#374/#375), and
      // Bumped 2026-05-03 for v0.5.0-alpha.2 cut. Accepted feature
      // work from chrome bundles 1+2 (#396/#399), row actions (#404),
      // mode-switch RFC stages 1-3.2 (#397/#400/#402/#406), editor-
      // toggle props + portal polish (#395/#398), result-aware
      // onCellEditCommit (#401), prepareResult preload (#403),
      // group-before-paginate (#405), bsncraft paper-cut fixes (pinned
      // shading, DOM-rect editor, flex distribution), and
      // rowClassName/rowStyle. 100 KiB hard cap unchanged
      // (currently at 99.11 KiB total — only ~900 bytes headroom; the
      // v0.6 layout-architecture-pass deletes ~250 LOC of JS scroll-
      // sync and should reclaim ~5-8 KiB gzip).
      baselineGzipBytes: 90562,
    },
  ],
}
