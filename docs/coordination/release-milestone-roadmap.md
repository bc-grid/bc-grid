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

### Status snapshot — 2026-05-01 (refresh)

> **Source-version skew (still open, automated guard now in place).** `packages/*/package.json` declares `0.1.0-alpha.2`; the latest tag is `v0.1.0-alpha.5`. Tagging `v0.2.0` against current main would publish artifacts with `version: "0.1.0-alpha.2"` because nothing in the release flow synchronises source `version` to the tag. The coherence guard is automated (#199, merged): `bun run release-preflight` fails fast on source / tag / packed-metadata mismatch and runs in `.github/workflows/release.yml` before `bun publish`. The version bump itself is still a coordinator action — see the "v0.2 release gate checklist" below.

**Open v0.2.0 blockers (in review, awaiting coordinator merge):**

- **#202** `agent/worker1/resize-affordance-polish` — `Polish column resize affordance`. Closes the milestone gate "resize affordances are visible". Status: clean CI / mergeable, awaiting coordinator review. **This is the last open milestone-gate blocker.**

**Recently landed (already on `main`):**

- **#200** `fix: emit filter clear state` — closes the "basic filters are stable in fit-to-screen mode" milestone gate. Merged 2026-05-01.
- **#198** `fix: true auto-height page-flow for BcGrid` — closes the "no hidden CSS knowledge for core layout" milestone gate. Merged 2026-05-01.
- **#199** `release preflight: package coherence guard for v0.2.0` — adds the automated coherence gate referenced above. Merged 2026-05-01.

### Milestone gates

- [ ] Published package metadata is coherent: all internal `@bc-grid/*` dependencies resolve to the same release line. Enforced by `bun run release-preflight` (source-version coherence + workspace:* policy in source + no workspace: leak in packed tarballs + tag/source match when running under a release tag). **Currently `0.1.0-alpha.2`; coordinator-owned bump pending.**
- [ ] Host apps do not need hidden CSS knowledge for core layout: fixed-height grids scroll vertically, header/body widths stay aligned, and resize affordances are visible. **Auto-height + header/body sync closed by #198 (merged); resize affordance gated on #202 (open).**
- [ ] Sorting, column resize, pinned columns, vertical scrolling, and basic filters are stable in fit-to-screen mode. **Filter-clear regression closed by #200 (merged).**
- [ ] `bsncraft` installs the candidate, passes `bun run check-types`, and can load representative grid pages without import/export errors. **Pending the candidate version's existence; cannot validate while source is `0.1.0-alpha.2`.**
- [ ] Bundle budget remains under the current `100 KiB` gzip hard cap with the per-PR drift guard intact.
- [ ] README install guidance and package docs match the actual release process.

### v0.2 release gate checklist

Ordered steps the coordinator runs once the open blockers are merged. Each step has a binary pass/fail; do not skip ahead on a yellow.

1. **Confirm `main` carries every blocker.** #202 merged, CI green, no new P0 surfacing.
2. **Decide pre-mode.** The repo is currently in changesets `pre` mode (`tag: "alpha"`, see `.changeset/pre.json`). Either `bunx changeset pre exit` to leave pre-mode for the `0.2.0` cut, or stay in pre and tag a final alpha — pick one and document in the changeset.
3. **Bump source versions to `0.2.0`.** Either:
   - **Via changesets** (preferred): write a changeset describing the v0.2.0 scope → `bun run changeset:version` → confirm every `packages/*/package.json` reads `"version": "0.2.0"` → commit. Regenerate `bun.lock` if the tooling demands it.
   - **By hand** (fallback): edit all 11 `packages/*/package.json` to `"version": "0.2.0"` and commit.
4. **Run `bun run release-preflight` locally.** Must report `shared source version: 0.2.0` and pass all four checks (source-version coherence, workspace:* policy, packed-tarball metadata, tag/source match). If checks 1–3 fail there is a metadata bug to fix before tagging.
5. **Run `bun run tarball-smoke` locally.** Verifies the tarballs install + type-check from a clean throwaway consumer; catches missing exports / broken types that would break a host install.
6. **Coordinator-owned Playwright + smoke-perf passes** on `main`, or any failures are documented as non-blocking. Workers do not run these; the coordinator owns the suite.
7. **`bsncraft` install + check-types.** In `~/work/bsncraft`: install the candidate version (file: tarball or pre-publish from the workspace), run `bun run check-types` against the grid surfaces it actually uses. Confirms the v0.2 "boring to consume" goal end-to-end.
8. **Push the `v0.2.0` tag.** `release.yml` re-runs preflight under `GITHUB_REF_NAME=v0.2.0` so the tag-vs-source check fires; `tarball-smoke` runs again; then `bun publish` per package. If any step fails, abort the tag and fix at source rather than retrying with a `.1`.
9. **Post-publish smoke.** Install `@bc-grid/react@0.2.0` from a fresh consumer (in a tmp dir) to confirm the registry actually has the artifacts and the install path matches the README guidance.

### v0.2 readiness call (this refresh, 2026-05-01)

**Not ready.** Two requirements are still unmet on `main`:

1. **#202 (resize affordance polish) is unmerged.** Until it merges, the milestone gate "resize affordances are visible" is open.
2. **Package versions still read `0.1.0-alpha.2`.** Steps 2–4 of the release checklist (pre-mode decision, version bump, preflight verification) have not been performed against current main.

When #202 merges, the next coordination session can run the checklist top-to-bottom against a clean `main`.

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
