# Release Milestone Roadmap

Coordinator-owned checklist for moving from the current `0.1.x` alpha line toward `1.0.0`.

This document is a release gate, not a deadline. Do not rush work to satisfy a version number. If a milestone grows, split it and insert another `0.x.0` release. If the product is genuinely ready, it is acceptable to skip a numeric stop, for example `0.8.0` to `1.0.0`.

## Coordinator Rule

At the start of each coordination session:

1. Check this file, `docs/queue.md`, open PRs, and CI.
2. Keep each milestone checkbox honest as PRs merge.
3. When every item in the next milestone is complete and the release gates pass, tell the maintainer: `Milestone vX.Y.0 is ready; recommend bumping versions and publishing packages.`
4. Do not start a new feature train if the next milestone only needs review, merge, packaging, or consumer validation.

## Release Gates

Every milestone release candidate must satisfy these gates before the coordinator suggests a version bump:

- [ ] `main` is green in CI.
- [ ] Type-check, lint, unit tests, package builds, API-surface, bundle-size, and tarball-smoke pass.
- [ ] Coordinator-owned Playwright and smoke-perf checks pass, or failures are explicitly documented as non-blocking.
- [ ] `~/work/bsncraft` can install the candidate version and pass its type-check/build smoke for the grid surfaces it uses.
- [ ] Package metadata has no internal `@bc-grid/*` version skew or workspace leakage in published artifacts. Automated by `bun run release-preflight` (`tools/release-preflight`); the same script runs in `release.yml` before `bun publish` and fails when source / packed-tarball / release-tag are out of step.
- [ ] `docs/queue.md` reflects merged, deferred, or blocked work accurately.
- [ ] Known issues are documented with a severity call; no P0/P1 issue is open.

## v0.2.0 - Integration-Stable Alpha

Goal: make the published package line boring to consume in `bsncraft`.

> **Candidate snapshot (2026-05-01):** `coordinator/v020-release-prep` has all 11 publishable packages bumped to `0.2.0`. `RELEASE_TAG=v0.2.0 bun run release-preflight` reports source-version coherence, source-side `workspace:*` internal dependencies, coherent packed metadata, and tag/source match. Local gates pass: type-check, lint, unit tests, package builds, API-surface, bundle-size, tarball-smoke, and release-preflight. A detached `bsncraft` smoke using local `0.2.0` tarballs installs cleanly and passes `bun run check-types` after the wrapper widens `handleGridFilterChange` to accept the `null` filter state emitted when filters are cleared.
>
> **Released (2026-05-01):** tag `v0.2.0` published all 11 packages to GitHub Packages. Release workflow passed type-check, lint, unit tests, package builds, bundle-size, API-surface, release-preflight, tarball-smoke, and publish. Coordinator Playwright Chromium slice passed 141/141 before tagging. The remaining `bsncraft` work is consumer integration validation and wrapper cleanup on its own branch.

- [x] Published package metadata is coherent: all internal `@bc-grid/*` dependencies resolve to the same release line. Enforced by `bun run release-preflight` (source-version coherence + workspace:* policy in source + no workspace: leak in packed tarballs + tag/source match when running under a release tag).
- [x] Host apps do not need hidden CSS knowledge for core layout: fixed-height grids scroll vertically, header/body widths stay aligned, and resize affordances are visible.
- [x] Sorting, column resize, pinned columns, vertical scrolling, and basic filters are stable in fit-to-screen mode.
- [ ] `bsncraft` installs the candidate, passes `bun run check-types`, and can load representative grid pages without import/export errors. **Package-side result:** local tarball install passes after one consumer typing fix for nullable filter callbacks; unpatched `bsncraft` still needs that wrapper update.
- [x] Bundle budget remains under the current `100 KiB` gzip hard cap with the per-PR drift guard intact (`65.64 KiB` gzip on the v0.2.0 candidate).
- [x] README install guidance and package docs match the actual release process.

## v0.3.0 - Filtering, Search, and Persistence

Goal: complete the day-to-day data finding workflow.

- [ ] Text, number/range, date/range, boolean, set, and multi-value filters are implemented and covered.
- [ ] Popup filter variant and filters tool panel are merged, accessible, and documented.
- [ ] Filter state persists through URL and `localStorage` where configured.
- [ ] Search applies to the row model and highlights matches without breaking virtualization.
- [ ] Custom filter extension recipe is published in docs.
- [ ] `bsncraft` can exercise the common customer/vendor/invoice filter flows without local patches.

## v0.4.0 - Editing and Validation

Goal: make editable ERP grids viable.

- [ ] `BcEditGrid` commit lifecycle is complete: prepare, validate, commit, optimistic update, rollback, and stale mutation handling.
- [ ] Built-in editors are complete enough for ERP data entry: text, number, date, datetime, time, select, multi-select, autocomplete.
- [ ] Dirty, pending, and error states render clearly and announce correctly.
- [ ] Keyboard editing flows are covered: Enter, F2, Escape, Tab, Shift+Tab, click-outside, and portal-aware interactions.
- [ ] Custom editor recipe is documented and uses the same contract as built-in editors.
- [ ] `bsncraft` can wire at least one realistic editable form/grid without forking bc-grid.

## v0.5.0 - Range, Clipboard, and Spreadsheet Flows

Goal: make spreadsheet-style work practical.

- [ ] Range state machine is merged in core and React can render active ranges through virtualization.
- [ ] Clipboard copy emits TSV and HTML for rectangular ranges.
- [ ] Clipboard paste from Excel/Sheets parses TSV, applies value parsers and validators, and rolls back atomically on failure.
- [ ] Fill handle supports copy and simple linear fill where safe.
- [ ] Keyboard range extension and clear/select-all behavior match the range RFC.
- [ ] Visual range overlays, active cell, selection, and editing states do not fight each other.

## v0.6.0 - Server Row Model and Live Data

Goal: support large ERP datasets without loading everything into the browser.

- [ ] Paged, infinite, and tree row models are complete with request dedupe, abort handling, retry, cache eviction, and invalidation.
- [ ] Mutation pipeline reconciles optimistic local rows with server results.
- [ ] Streaming row updates can add, update, remove, and invalidate rows without corrupting row identity.
- [ ] Server row model exposes usable state snapshots for persistence, restore, export, and selection.
- [ ] Server-mode performance tuning has a baseline and no obvious cache/fetch regressions.
- [ ] `bsncraft` has at least one server-backed grid path validated against the candidate package.

## v0.7.0 - Aggregation, Pivot, and Export

Goal: cover analytical and reporting workflows.

- [ ] Aggregation engine and React adapter are merged and documented.
- [ ] Pivot engine, pivot tool panel, and pivoted row/column rendering are merged.
- [ ] Footer/status aggregation display works with current filters, grouping, and selection.
- [ ] CSV, XLSX, PDF, and server-mode export flows are available and documented.
- [ ] Exported values respect value getters, formatters, hidden columns, and selected/range scopes as documented.
- [ ] Pivot/export interactions have focused tests for the public behavior, not only helper functions.

## v0.8.0 - Chrome, Charts, and Productivity Surface

Goal: make the grid feel like a full product surface, not just a table.

- [ ] Status bar, sidebar shell, columns panel, filters panel, pivot panel, and context menu are merged and accessible.
- [ ] Client pagination UI is merged and composes with filtering/searching.
- [ ] Charts peer-dep integration is merged, documented, and usable without bundling a chart library.
- [ ] Examples app demonstrates the main productivity workflows without hidden flags.
- [ ] Migration guide from AG Grid is current and honest about gaps.
- [ ] Bundle-size and smoke-perf baselines are refreshed after the major productivity features land.

## v0.9.0 - Release Candidate Hardening

Goal: stop adding broad surface area and remove release risk.

This milestone is optional. If v0.8.0 already satisfies the GA gate, the coordinator may recommend going directly to `1.0.0`.

- [ ] WCAG deep pass is complete and issues are either fixed or explicitly deferred below P1.
- [ ] Clean-room AG Grid comparison audits cover the major v1.0 surfaces in `docs/coordination/ag-grid-clean-room-audit-plan.md`.
- [ ] Browser compatibility matrix is complete for Chromium, Firefox, WebKit/Safari, and Edge.
- [ ] Mobile/touch fallback is complete enough for coarse-pointer users: 44px targets, double-tap edit, long-press context menu, and range handles.
- [ ] Screenreader spot-checks cover pinned columns, row/col counts, treegrid/group rows, editing announcements, and status regions.
- [ ] Nightly and smoke performance baselines are healthy.
- [ ] Public API surface is reviewed as the likely `1.0.0` contract.
- [ ] Docs, examples, package READMEs, and migration guide have no known stale sections.

## v1.0.0 - GA

Goal: ship the first stable major version for ERP workloads.

- [ ] All release gates pass.
- [ ] The maintainer explicitly signs off that no remaining gap blocks GA.
- [ ] `bsncraft` is using the candidate package without local patches for its representative grid, edit-grid, lookup-grid, and data-table surfaces.
- [ ] No P0/P1 bugs are open; P2s are either fixed or documented as post-1.0 backlog.
- [ ] Public API surface is locked for semver stability.
- [ ] Performance and bundle-size numbers are recorded in the release notes.
- [ ] Known non-goals are documented: RTL, spreadsheet formulas, bug-for-bug AG Grid parity, and any other deferred scope.
- [ ] Coordinator recommends `1.0.0`, then follows the release workflow and verifies the published package install.

## Release Action Checklist

When a milestone is ready:

1. Announce the recommendation to the maintainer before changing versions.
2. Follow `docs/design/publish-rfc.md` and the current release workflow.
3. Use the repo's fixed-version package policy: all published `@bc-grid/*` packages move together.
4. Run the full release gate locally or in CI.
5. Tag with the chosen semver, for example `v0.3.0` or `v1.0.0`.
6. Watch the publish workflow finish.
7. Install the published version into `~/work/bsncraft`, refresh the lockfile, and run consumer validation.
8. Update this file and `docs/queue.md` with the release result and the next milestone focus.
