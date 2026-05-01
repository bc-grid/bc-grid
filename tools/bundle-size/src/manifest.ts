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
      baselineGzipBytes: 63572,
    },
  ],
}
