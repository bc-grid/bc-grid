# @bc-grid/react

## 0.2.0

### Minor Changes

- Release v0.2.0 with integration-stable package metadata, layout and scroll fixes, filter clear-state fixes, resize affordance polish, showFilterRow, context menu, and filters tool panel support.
- Add compatibility props for host-app migration: `showFilters` aliases `showFilterRow`, and `showColumnMenu` can disable the built-in header column menu.
- Keep the header column-menu affordance out of normal label layout and suppress it on built-in control columns.
- Stop row-insertion FLIP animations from scaling master-detail expansion rows before layout settles.

### Patch Changes

- 30c0627: Ship alpha.2 with date and number filters, range clipboard copy, editor polish, the sidebar shell, and release-gate accessibility fixes.
- Updated dependencies [30c0627]
- Updated dependencies
  - @bc-grid/aggregations@0.2.0
  - @bc-grid/animations@0.2.0
  - @bc-grid/core@0.2.0
  - @bc-grid/export@0.2.0
  - @bc-grid/filters@0.2.0
  - @bc-grid/server-row-model@0.2.0
  - @bc-grid/theming@0.2.0
  - @bc-grid/virtualizer@0.2.0

## 0.1.0-alpha.2

### Patch Changes

- Ship alpha.2 with date and number filters, range clipboard copy, editor polish, the sidebar shell, and release-gate accessibility fixes.
- Updated dependencies
  - @bc-grid/aggregations@0.1.0-alpha.2
  - @bc-grid/animations@0.1.0-alpha.2
  - @bc-grid/core@0.1.0-alpha.2
  - @bc-grid/export@0.1.0-alpha.2
  - @bc-grid/filters@0.1.0-alpha.2
  - @bc-grid/server-row-model@0.1.0-alpha.2
  - @bc-grid/theming@0.1.0-alpha.2
  - @bc-grid/virtualizer@0.1.0-alpha.2
