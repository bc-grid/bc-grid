# bsncraft monorepo move runbook

**Status:** ratified strategy + executable runbook. Pre-flight gate is worker2's bc-grid-side prep audit.
**Author:** worker1 (Claude — v1.0 prep lane)
**Date:** 2026-05-04 (post v0.6.0 GA cut, commit `7b4d276`)
**Strategy doc:** `~/work/bsncraft/bc-grid.md` (option B — workspace dependency, 11 sub-packages relocated under `bsncraft/packages/bc-grid/`)
**Companion:** `docs/coordination/bsncraft-monorepo-move-bc-grid-prep.md` (worker2 — bc-grid-side audit; verifies no hardcoded paths, repo-field cleanup, etc.)

This runbook is the paste-executable migration plan. Each step is independently reversible until step 7. The maintainer runs it; this document is concrete enough that no judgement calls are needed mid-flight (they're all spelled out below). The strategy and "why" live in `~/work/bsncraft/bc-grid.md`; this is the "how."

---

## 0. Pre-flight checklist

Before starting, confirm:

- [ ] **v0.6.0 GA published** — `git log origin/main --oneline | head -1` shows `release: v0.6.0 GA`. ✅ done 2026-05-04 (commit `7b4d276`).
- [ ] **Zero open bc-grid PRs** — `gh pr list --state open --repo bc-grid/bc-grid` returns empty. Coordinate with workers to land or close anything in flight before the move.
- [ ] **Worker2's bc-grid-side audit complete** — `docs/coordination/bsncraft-monorepo-move-bc-grid-prep.md` exists with a "ready" verdict per item. If not yet shipped, read worker2's findings first; fix any "not ready" items before proceeding.
- [ ] **Maintainer ratification on the 5 decision points in `~/work/bsncraft/bc-grid.md §Decision`:** scope (all 11 packages), timing (now — post-GA), naming (keep `@bc-grid/*` scope), CI (path-scoped), old repo (archive).
- [ ] **bsncraft on a clean branch** — `cd ~/work/bsncraft && git status` is clean.
- [ ] **bc-grid soak feedback from bsncraft** — `bun update @bc-grid/*@0.6.0` in bsncraft was attempted and reported clean. v0.6.0 GA is the version that ships in the move.

---

## 1. Branch + import (step 1, ~1 hour)

```bash
cd ~/work/bsncraft
git checkout -b agent/maintainer/bc-grid-monorepo-import
mkdir -p packages
```

**Import bc-grid history under `packages/bc-grid/`:**

The recommended approach is **`git filter-repo --to-subdirectory-filter`** on a fresh clone of bc-grid, then merge that into bsncraft. This preserves full bc-grid history (every PR, every author) and keeps the directory tree intact.

```bash
# In a temporary location — DO NOT do this inside ~/work/bsncraft.
cd /tmp
git clone --no-local ~/work/bc-grid bc-grid-import
cd bc-grid-import

# Rewrite history so every file is moved into packages/bc-grid/.
# `git filter-repo` is from https://github.com/newren/git-filter-repo — install via `brew install git-filter-repo` if missing.
git filter-repo --to-subdirectory-filter packages/bc-grid

# Verify: every file under packages/bc-grid/, history intact.
git log --oneline | head -3            # Same commits as ~/work/bc-grid
ls packages/bc-grid/                   # Should show packages/, apps/, docs/, tools/, etc.
```

**Merge into bsncraft:**

```bash
cd ~/work/bsncraft
git remote add bc-grid-import /tmp/bc-grid-import
git fetch bc-grid-import

# Allow unrelated histories — bsncraft and bc-grid never shared a commit before this merge.
git merge bc-grid-import/main --allow-unrelated-histories -m "import bc-grid v0.6.0 history under packages/bc-grid/"

# Sanity: both bsncraft and bc-grid file trees should now coexist.
ls packages/                           # bc-grid alongside accounts-receivable / auth / db / ... / ui
ls packages/bc-grid/                   # packages/, apps/, docs/, tools/, etc.

# Cleanup the import remote — no longer needed.
git remote remove bc-grid-import
rm -rf /tmp/bc-grid-import
```

### Alternatives considered

| Approach | When to use | Tradeoffs |
|---|---|---|
| **`git filter-repo --to-subdirectory-filter` + merge** | **Recommended.** | Preserves all history. ~1 hour. Requires `git-filter-repo` install. |
| `git subtree split` + `git subtree add` | If `git-filter-repo` is unavailable. | Same outcome, more verbose commands. Subtle bug-prone with merge commits in bc-grid history. |
| Plain copy (`cp -r ~/work/bc-grid packages/bc-grid && cd packages/bc-grid && rm -rf .git`) | Maintainer wants a fresh start. | **Loses all bc-grid history.** Drop the audit trail (RFCs, every PR's discussion via commit messages). Don't recommend. |

The filter-repo approach is the only one that satisfies the strategy doc's `~/work/bsncraft/bc-grid.md §What stays the same` line: _"bc-grid's existing tests, RFCs, design docs, coordination docs all migrate intact (under `packages/bc-grid/docs/`). bc-grid's CHANGELOG, release-milestone-roadmap, AGENTS.md — all preserved."_

---

## 2. Wire root workspace + Tailwind source (step 2, ~30 min)

### 2.1 Root `package.json` workspaces

`bsncraft/package.json`:

```diff
   "workspaces": [
     "apps/*",
-    "packages/*"
+    "packages/*",
+    "packages/bc-grid/packages/*",
+    "packages/bc-grid/apps/*",
+    "packages/bc-grid/tools/*"
   ]
```

The 3 nested globs cover:
- `packages/bc-grid/packages/*` — the 11 `@bc-grid/*` source packages
- `packages/bc-grid/apps/*` — `@bc-grid/app-examples` + `@bc-grid/app-benchmarks` + `@bc-grid/app-docs`
- `packages/bc-grid/tools/*` — `@bc-grid/api-surface`, `@bc-grid/bundle-size`, `@bc-grid/release-preflight`, etc.

### 2.2 Bun install at bsncraft root

```bash
cd ~/work/bsncraft
bun install
```

**Expected output:** Bun resolves the new nested workspaces, deduplicates shared devDeps (biome, typescript, react, vitest, etc.) by hoisting to the root `node_modules/.bun/` store. ~10 second install on a warm cache.

**If Bun chokes on the nested glob** (per the strategy doc §Risks): fall back to flattening — each `@bc-grid/*` becomes a top-level workspace at `packages/bc-grid-react/`, `packages/bc-grid-core/`, etc. Less tidy, same outcome. Do this only if Bun emits an explicit error about the nested glob.

### 2.3 Tailwind v4 `@source` for bc-grid

bsncraft uses **Tailwind v4 with CSS-first config** in `apps/web/app/globals.css`. Today it has:

```css
@import "tailwindcss";
@import "@bc-grid/theming/styles.css";

@source "../../../packages/ui/src/**/*.{ts,tsx}";
```

After the move, the bc-grid source files live at `packages/bc-grid/packages/*/src/**/*.{ts,tsx}` (now visible from the bsncraft repo root). Add the source directive so Tailwind sees them and generates the utility classes the shadcn primitives use:

```diff
 @import "tailwindcss";
 @import "@bc-grid/theming/styles.css";

 @source "../../../packages/ui/src/**/*.{ts,tsx}";
+@source "../../../packages/bc-grid/packages/*/src/**/*.{ts,tsx}";
```

**This is "the Tailwind content array fix that resolves the transparency bug"** the worker1 handoff cited. Pre-fix, Tailwind didn't see bc-grid's shadcn primitives, so the utility classes (e.g., `bg-popover`, `text-foreground`, `border-border`) weren't generated, and primitives rendered with browser defaults. Post-fix: full styling.

### 2.4 Smoke test

```bash
cd ~/work/bsncraft
bun run build                          # Build everything: bsncraft + bc-grid sub-packages
bun run --filter @bsn/web type-check   # bsncraft's web app type-checks
bun run --filter @bsn/web dev          # Dev server starts; visit http://localhost:3000 and load any grid view
```

If the dev server renders a grid with proper shadcn-styled chrome (popover backgrounds, dropdown borders, no transparent menus), step 2 is good.

---

## 3. Switch internal consumers from registry to workspace (step 3, ~30 min)

### 3.1 `apps/web/package.json`

```diff
   "dependencies": {
-    "@bc-grid/editors": "0.6.0",
-    "@bc-grid/react": "0.6.0",
-    "@bc-grid/theming": "0.6.0",
+    "@bc-grid/editors": "workspace:*",
+    "@bc-grid/react": "workspace:*",
+    "@bc-grid/theming": "workspace:*",
     ...
   }
```

### 3.2 `packages/ui/package.json`

```diff
   "dependencies": {
-    "@bc-grid/react": "0.6.0",
-    "@bc-grid/theming": "0.6.0",
+    "@bc-grid/react": "workspace:*",
+    "@bc-grid/theming": "workspace:*",
     ...
   }
```

### 3.3 Re-install + verify

```bash
cd ~/work/bsncraft
bun install                            # Resolves @bc-grid/* to local workspace.
bun run --filter @bsn/web build        # Builds successfully.
bun run --filter @bsn/web dev          # Dev server reflects local edits to packages/bc-grid/packages/react/src/grid.tsx.
```

**Verification:** edit `packages/bc-grid/packages/react/src/grid.tsx` (e.g., add a `console.log("hello from local")`), reload the bsncraft dev page; the log fires. Revert the test edit.

---

## 4. Wire Turborepo (step 4, ~30 min)

bsncraft's `turbo.json` already declares `build`, `test`, `check-types`, `lint`, `dev`. bc-grid sub-packages already have `build` / `test` / `type-check` scripts in their `package.json` files. Turborepo picks them up automatically once they're in the workspace — no config edits required for the basics.

**Optional optimisation:** add path-scoped task hints if you want bc-grid CI to skip when bsncraft-only changes land. For Turborepo this is `$TURBO_FILTER_SCOPE` or a `turbo.json` `inputs` key, but more commonly handled by the CI workflow `paths:` filter (covered in step 5).

**Smoke test:**

```bash
cd ~/work/bsncraft
turbo run build                        # Builds bsncraft + bc-grid in topological order.
turbo run test                         # Runs all tests across all workspaces.
turbo run check-types                  # Type-checks everything.
```

If any bc-grid sub-package fails type-check inside bsncraft but passes inside `~/work/bc-grid`, suspect a shared devdep version mismatch — typescript or react. Resolve by aligning the versions; the strategy doc allowed ~1 day for this in §Risks.

---

## 5. CI: move bc-grid workflows under `bsncraft/.github/workflows/` with path-scoping (step 5, ~half day)

bc-grid has three CI workflows under `packages/bc-grid/.github/workflows/`: `ci.yml`, `e2e-nightly.yml`, `perf.yml`, plus the release workflow (covered in step 6). After the import they sit alongside bsncraft's workflows but won't trigger because GitHub Actions only reads `.github/workflows/` at the **repo root**.

### 5.1 Move + rename

```bash
cd ~/work/bsncraft
mv packages/bc-grid/.github/workflows/ci.yml          .github/workflows/bc-grid-ci.yml
mv packages/bc-grid/.github/workflows/e2e-nightly.yml .github/workflows/bc-grid-e2e-nightly.yml
mv packages/bc-grid/.github/workflows/perf.yml        .github/workflows/bc-grid-perf.yml
```

The `bc-grid-` prefix avoids collision with any future bsncraft CI of the same name.

### 5.2 Path-scope each workflow

For each moved workflow, edit the trigger:

```diff
 name: bc-grid CI
 on:
   pull_request:
+    paths:
+      - "packages/bc-grid/**"
+      - ".github/workflows/bc-grid-*.yml"
   push:
     branches: [main]
+    paths:
+      - "packages/bc-grid/**"
+      - ".github/workflows/bc-grid-*.yml"
```

Without path-scoping, every bsncraft PR would run the full bc-grid Playwright suite. Path-scoping keeps PR latency on ERP-only changes unchanged.

### 5.3 Verify

```bash
cd ~/work/bsncraft
git add .github/ packages/bc-grid/
git commit -m "ci: relocate bc-grid workflows + path-scope"
git push -u origin agent/maintainer/bc-grid-monorepo-import

# Open a no-op PR touching only bsncraft files (e.g., apps/web/README.md):
gh pr create --title "test: bc-grid CI path-scoping" --body "Verify bc-grid workflows stay quiet on bsncraft-only changes."
```

The opened PR's checks list should NOT include `bc-grid-ci`, `bc-grid-e2e-nightly`, or `bc-grid-perf`.

Then push a no-op change touching `packages/bc-grid/README.md` and verify the bc-grid checks DO fire.

---

## 6. Move bc-grid release workflow (step 6, ~half day)

bc-grid's release workflow lives at `packages/bc-grid/.github/workflows/release.yml` after the import. It publishes the 11 packages on tag push. Two changes needed:

### 6.1 Move + rename + retag

```bash
cd ~/work/bsncraft
mv packages/bc-grid/.github/workflows/release.yml .github/workflows/bc-grid-release.yml
```

Edit the trigger:

```diff
 name: bc-grid release
 on:
   push:
     tags:
-      - "v*"
+      - "bc-grid-v*"
```

bsncraft tags use `vX.Y.Z` (the bsncraft app version). bc-grid tags become `bc-grid-vX.Y.Z` so the two release workflows don't collide. The next bc-grid release (`bc-grid-v0.6.1` or `bc-grid-v1.0.0`) ships from this workflow.

### 6.2 Update working directories

The original workflow assumes the repo root is bc-grid. Now the repo root is bsncraft and bc-grid lives under `packages/bc-grid/`. Audit every step:

```diff
- working-directory: packages/react
+ working-directory: packages/bc-grid/packages/react
```

OR add a global `defaults.run.working-directory: packages/bc-grid` if all steps share that prefix. Choose whichever produces the smaller diff.

### 6.3 GitHub Packages auth

The `NPM_TOKEN` / `GITHUB_TOKEN` secrets used to publish `@bc-grid/*` are repository secrets — they need to exist on the bsncraft repo too. Coordinate with the maintainer to either:

- Mirror the bc-grid `NPM_TOKEN` secret to bsncraft (preferred: same publishing identity).
- OR generate a new GitHub Packages `repo`+`write:packages` PAT scoped to bsncraft and update the workflow.

### 6.4 Smoke test (no actual publish)

Cut a `bc-grid-v0.6.1-test.0` tag against the import branch, watch the workflow run through the dry-run gates (build, type-check, test, api-surface, bundle-size), but **do NOT push the published tarballs**. Comment out the `bun publish` lines, run the workflow, verify all gates pass, then revert and push the real tag for the next real release.

---

## 7. Final-state shadcn primitive cleanup (step 7, ~half day)

This is the v0.7-RFC-mandated end state. Once bc-grid is in the bsncraft monorepo, the local copies of shadcn primitives become redundant — bsncraft's `@bsn/ui` already provides the same primitives.

### 7.1 Inventory

bc-grid currently ships **two parallel shadcn sets**:

`packages/bc-grid/packages/react/src/shadcn/` (14 files):
- `checkbox.tsx`, `command.tsx`, `context-menu.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `label.tsx`, `popover.tsx`, `scroll-area.tsx`, `select.tsx`, `separator.tsx`, `sheet.tsx`, `tabs.tsx`, `tooltip.tsx`, `utils.ts`

`packages/bc-grid/packages/editors/src/shadcn/` (7 files):
- `Combobox.tsx`, `comboboxSlots.ts`, `command.tsx`, `dialog.tsx`, `popover.tsx`, `utils.ts`, `checkbox.tsx`

Compared to `packages/ui/src/components/` (37 files): bsn/ui is a strict superset.

### 7.2 Add @bsn/ui workspace dep to bc-grid sub-packages

`packages/bc-grid/packages/react/package.json`:

```diff
   "dependencies": {
+    "@bsn/ui": "workspace:*",
     ...
   }
```

`packages/bc-grid/packages/editors/package.json`: same edit.

(`@bsn/ui` is already a workspace package in bsncraft; it'll resolve via the existing workspace glob.)

### 7.3 Find-replace import sites

In `packages/bc-grid/`, find every relative import of the local shadcn primitives and replace with the bsn/ui import:

```bash
cd ~/work/bsncraft

# packages/bc-grid/packages/react/ has 6 callers identified pre-move:
#   columnVisibility.tsx, tooltip.tsx, headerCells.tsx, sidebar.tsx,
#   internal/context-menu-layer.tsx, internal/context-menu.tsx
# Plus the shadcn primitives themselves all import "./utils" → "@bsn/ui/lib/utils"

# Use ripgrep to verify the find-replace targets:
rg -lE 'from "(\./|\.\./)shadcn/' packages/bc-grid/packages/react/src packages/bc-grid/packages/editors/src

# Then run the find-replace per primitive. Example for the 14 packages/react primitives:
for primitive in checkbox command context-menu dialog dropdown-menu label popover scroll-area select separator sheet tabs tooltip; do
  rg -l "from \"\\./shadcn/$primitive\"" packages/bc-grid/packages/react/src | xargs sed -i "" "s|from \"./shadcn/$primitive\"|from \"@bsn/ui/components/$primitive\"|g"
  rg -l "from \"\\.\\./shadcn/$primitive\"" packages/bc-grid/packages/react/src | xargs sed -i "" "s|from \"\\.\\./shadcn/$primitive\"|from \"@bsn/ui/components/$primitive\"|g"
done

# Same for editors (only 5 primitives):
for primitive in command dialog popover Combobox comboboxSlots; do
  rg -l "from \"\\./shadcn/$primitive\"" packages/bc-grid/packages/editors/src | xargs sed -i "" "s|from \"./shadcn/$primitive\"|from \"@bsn/ui/components/$primitive\"|g"
done
```

**Important caveat for the `Combobox` + `comboboxSlots`:** these were authored bc-grid-side (PR-C1 #520, PR-C3 #92c1de4), not from bsn/ui. They likely DO NOT exist in `@bsn/ui/components/`. Two options:

- **Promote them up to bsn/ui** (preferred — bsn/ui owns shadcn primitives in the monorepo). Move `Combobox.tsx` + `comboboxSlots.ts` from `packages/bc-grid/packages/editors/src/shadcn/` to `packages/ui/src/components/`. Update the editor imports to `from "@bsn/ui/components/Combobox"`.
- **Keep them inline** — leave under `packages/bc-grid/packages/editors/src/shadcn/`. Acceptable if bsn/ui doesn't want a Combobox primitive.

Maintainer call. Default: promote to bsn/ui for consistency.

### 7.4 Delete the local shadcn copies

```bash
cd ~/work/bsncraft
rm -rf packages/bc-grid/packages/react/src/shadcn/
rm -rf packages/bc-grid/packages/editors/src/shadcn/  # If everything was promoted/replaced.
# OR keep editors/src/shadcn/Combobox.tsx + comboboxSlots.ts if not promoted; delete the rest.
```

### 7.5 Update the v0.7-shadcn-radix-correction RFC

`packages/bc-grid/docs/design/shadcn-radix-correction-rfc.md` should get a closing note documenting the post-monorepo-move state — the RFC predicted this end state but it lands here.

### 7.6 Verify

```bash
cd ~/work/bsncraft
bun install                            # @bsn/ui dep newly declared on bc-grid packages.
bun run --filter @bsn/web type-check   # No "cannot find module" errors.
bun run --filter @bc-grid/react test   # Existing bc-grid tests pass.
bun run --filter @bsn/web build        # Web app builds.
bun run --filter @bsn/web dev          # Visual smoke: chrome surfaces (context menu, popover, dropdown, tooltip, combobox) all render correctly.
```

---

## 8. Validation gauntlet

Before merging the import branch:

```bash
cd ~/work/bsncraft

# Full type-check across all workspaces.
turbo run check-types

# Full test suite.
turbo run test

# Full build.
turbo run build

# bc-grid-specific gates (still authoritative inside the monorepo).
bun run --filter @bc-grid/api-surface check
bun run --filter @bc-grid/bundle-size check
bun run --filter @bc-grid/release-preflight  # If exists.

# Visual smoke on bsncraft web app.
bun run --filter @bsn/web dev
# → click through: customers grid, edit-grid view, context menu, header column-options, filter popup, tool panels, autocomplete editor, multi-select editor, tree group rows.

# Spot-check the apps/examples and apps/benchmarks demos still build (they're now under packages/bc-grid/apps/).
bun run --filter @bc-grid/app-examples dev
bun run --filter @bc-grid/app-benchmarks dev
```

If any gate fails, see step 9 (rollback) before merging.

---

## 9. Rollback (if validation fails)

The import branch is reversible until step 7's deletes happen. Order of escalation:

1. **Single broken gate** — fix forward on the import branch. The merge from step 1 is a single commit; it's straightforward to add fix commits on top.
2. **Bun nested-workspace error** — fall back to flattening. Each `@bc-grid/*` package becomes a top-level workspace at `packages/bc-grid-react/`, etc. Rewrite the workspaces glob, re-install, retest. Listed as the strategy doc's documented fallback.
3. **Catastrophic** — worst case, discard the branch entirely:

   ```bash
   cd ~/work/bsncraft
   git checkout main
   git branch -D agent/maintainer/bc-grid-monorepo-import
   ```

   bsncraft is back to the pre-move state. `~/work/bc-grid` is unchanged throughout the process (the import was a clone, not a rename), so bc-grid's own repo is the safety net. Continue consuming `@bc-grid/*@0.6.0` from GitHub Packages as before; investigate the failure offline; retry the runbook.

**The only point of no return is step 7.4** (deleting the local shadcn copies). Until then, the move is fully reversible.

---

## 10. Post-merge (after the import branch lands on bsncraft main)

### 10.1 Verify bsncraft CI on the merged main

Push the merge to bsncraft's `main`. Watch GitHub Actions:
- bc-grid CI workflows fire (because the merge touched `packages/bc-grid/**`).
- bsncraft CI workflows also fire (because the merge touched root `package.json` + `apps/web/`).
- All gates pass.

### 10.2 Cut a release smoke

Tag `bc-grid-v0.6.1-postmove.0` (or an alpha) and confirm the new release workflow at `bsncraft/.github/workflows/bc-grid-release.yml` publishes the 11 packages to GitHub Packages exactly as the old workflow did. External consumers (anyone outside bsncraft, even if today that's nobody) install from registry exactly as before. Strategy doc §What stays the same line 1.

### 10.3 Update bc-grid origin's README

```bash
cd ~/work/bc-grid
git checkout main
git pull origin main
```

Edit `README.md`:

```diff
+ # bc-grid (moved)
+
+ **bc-grid has moved into the bsncraft monorepo at `bsncraft/packages/bc-grid/`.**
+ This repo is preserved for history; new development happens at https://github.com/bsncraft/bsncraft#packages/bc-grid.
+ `@bc-grid/*` packages continue to publish to GitHub Packages — install from there as before.
+
- # bc-grid
  ...
```

Commit + push.

### 10.4 Archive the bc-grid repo

In GitHub repo settings → "Archive this repository". This makes the repo read-only, preserves all history (issues, PRs, ratified RFCs, release notes), and signals "moved." The archived URL stays valid forever; npm + GitHub Packages installs still resolve.

**Don't delete.** The archived repo is the public API audit trail.

### 10.5 Decommission the worker fleet (optional)

The 3-worker pattern (worker1/worker2/worker3) running in `~/work/bcg-worker{1,2,3}/` was a coordination shape for bc-grid as a standalone repo. After the move, the same workers can either:

- **Continue from bsncraft** — point each worker's worktree at `~/work/bsncraft` instead of `~/work/bcg-workerN`. Same coordination doc shape (`bsncraft/docs/coordination/handoff-workerN.md`). This is the strategy doc's preferred path: _"The 3-worker pattern can continue if you want, OR collapse into the bsncraft team — your call."_
- **Collapse into the bsncraft dev team** — same person(s) review both bsncraft and bc-grid PRs in the same repo; "anyone touching `packages/bc-grid/` follows bc-grid's PR conventions" (preserved in `packages/bc-grid/docs/AGENTS.md`).

Either way, retire the standalone bc-grid coordinator role; the maintainer's strategy doc anticipates this.

---

## Summary

| Step | Description | Effort | Reversible? |
|---|---|---|---|
| 0 | Pre-flight checklist | 5 min | n/a |
| 1 | Branch + import via `git filter-repo` | 1 hour | Yes |
| 2 | Wire root workspace + Tailwind `@source` | 30 min | Yes |
| 3 | Switch consumers to `workspace:*` | 30 min | Yes |
| 4 | Wire Turborepo | 30 min | Yes |
| 5 | Move CI workflows + path-scope | half day | Yes |
| 6 | Move release workflow + retag | half day | Yes |
| 7 | Delete local shadcn copies + use `@bsn/ui` | half day | **No** (the deletes) |
| 8 | Validation gauntlet | 1 hour | n/a (verification) |
| 9 | Rollback | as needed | until step 7 |
| 10 | Post-merge: archive bc-grid repo, smoke release | 1 hour | n/a (cleanup) |

**Total: 2-3 days of focused work**, matching the strategy doc's estimate.

Cut after v0.6.0 GA (✅ done). Worker2's bc-grid-side prep audit is the last gate before kicking off.

---

## Cross-reference

- **Strategy:** `~/work/bsncraft/bc-grid.md` — why workspace dep, what stays the same, what changes, risks.
- **bc-grid-side prep audit:** `docs/coordination/bsncraft-monorepo-move-bc-grid-prep.md` (worker2; pre-flight gate for this runbook).
- **v0.7 architecture correction RFC:** `docs/design/shadcn-radix-correction-rfc.md` — predicted the post-move shadcn cleanup; step 7 lands the predicted end state.
- **Release milestone roadmap:** `docs/coordination/release-milestone-roadmap.md` — v0.6.0 GA (✅ done) → bsncraft monorepo move (this runbook) → v1.0.
