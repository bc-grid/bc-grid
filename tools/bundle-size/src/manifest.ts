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
      // Bumped 2026-05-03 for v0.5.0-alpha.3 cut from 88.44 KiB →
      // 90.38 KiB. Accepted feature work since alpha.2: layout
      // architecture pass PRs (a/b/c) (#415/#416/#418) — net additions
      // and removals roughly cancel; default context menu wiring
      // (server #420 + chrome #419 + editor #421) added the Server /
      // Column / View / Editor submenus + row-action items + dismiss-
      // latest-error + in-memory `BcUserSettings` fallback; saved-view
      // DTO + helpers (#423); editor visual-contract consolidation
      // (#424) introduced the canonical `data-bc-grid-edit-state`
      // attribute + six `--bc-grid-edit-state-*` tokens + dual-
      // attribute helper for one-release migration; bsncraft alpha.2
      // P0 #1/#3 + P1 #10 fixes (#425) — opaque row-hover token +
      // cellEditor-implies-editable default. 150 KiB hard cap
      // unchanged; ~50 KiB headroom for v0.6 + v0.7 + v0.8 work.
      baselineGzipBytes: 92544,
    },
  ],
}
