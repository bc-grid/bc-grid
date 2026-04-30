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
  // 10% during the v1 parity sprint (per `design.md §13` 2026-04-30 entries):
  // the API surface is intentionally growing. The hard cap moved to 100 KiB
  // after alpha.2. Reset the drift baseline after accepted feature work lands
  // on main so the guard catches the next sudden jump rather than blocking
  // already-reviewed integration work.
  maxRegressionPercent: 10,
  entries: [
    {
      packageName: "@bc-grid/core",
      bundlePath: "packages/core/dist/index.js",
      baselineGzipBytes: 2012,
    },
    {
      packageName: "@bc-grid/virtualizer",
      bundlePath: "packages/virtualizer/dist/index.js",
      baselineGzipBytes: 7045,
    },
    {
      packageName: "@bc-grid/animations",
      bundlePath: "packages/animations/dist/index.js",
      baselineGzipBytes: 1693,
    },
    {
      packageName: "@bc-grid/react",
      bundlePath: "packages/react/dist/index.js",
      baselineGzipBytes: 54842,
    },
  ],
}
