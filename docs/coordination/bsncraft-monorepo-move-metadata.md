# bsncraft Monorepo Move Metadata Patch

**Status:** pre-staged for the move.
**Patch file:** `docs/coordination/bsncraft-monorepo-move-metadata.patch`.
**Apply location:** the imported bc-grid root at `~/work/bsncraft/packages/bc-grid/`.

This document explains the metadata patch worker1's runbook should apply after bc-grid is imported under `bsncraft/packages/bc-grid/`. The patch updates publishable package metadata only. It does not perform the monorepo move and does not touch `~/work/bsncraft`.

## What The Patch Changes

The patch updates all 11 publishable `packages/*/package.json` files:

- `repository.url`
- `repository.directory`
- `publishConfig.registry`

The 4 `apps/*/package.json` manifests were checked. They have no `repository` or `publishConfig` metadata, so there are no app hunks in the patch.

The patch intentionally does not rewrite `homepage` or `bugs.url`. Those still point at the standalone bc-grid GitHub project and should be handled by the archival/docs cleanup decision, not by the package-manager metadata patch.

## Placeholders

Replace these placeholders before applying the patch:

- `<BSNCRAFT_GIT_URL>`: canonical bsncraft repository URL for package metadata. Expected shape: `git+https://github.com/<bsncraft-org>/bsncraft.git`.
- `<BC_GRID_PUBLISH_REGISTRY>`: package publish registry decision.

Use one of these registry choices:

- Keep GitHub Packages: `https://npm.pkg.github.com`
- Move to a bsncraft-owned registry: use that registry URL
- Internal-only packages: apply the patch with a temporary registry value, then remove each `publishConfig` block in a reviewed follow-up edit

## Apply Command

From the imported bc-grid root:

```bash
cd ~/work/bsncraft/packages/bc-grid
perl -0pi -e 's#<BSNCRAFT_GIT_URL>#git+https://github.com/<bsncraft-org>/bsncraft.git#g; s#<BC_GRID_PUBLISH_REGISTRY>#https://npm.pkg.github.com#g' docs/coordination/bsncraft-monorepo-move-metadata.patch
git apply docs/coordination/bsncraft-monorepo-move-metadata.patch
```

Replace `<bsncraft-org>` and the registry value before running the `perl` command. If the maintainer chooses a registry other than GitHub Packages, substitute that URL for `https://npm.pkg.github.com`.

## Verification

After applying the patch from `~/work/bsncraft/packages/bc-grid`, these checks should pass:

```bash
git diff --check
rg -n '"url": "git\+https://github\.com/bc-grid/bc-grid\.git"' packages/*/package.json
rg -n '"directory": "packages/(aggregations|animations|core|editors|enterprise|export|filters|react|server-row-model|theming|virtualizer)"' packages/*/package.json
rg -n '<BSNCRAFT_GIT_URL>|<BC_GRID_PUBLISH_REGISTRY>' packages/*/package.json docs/coordination/bsncraft-monorepo-move-metadata.patch
```

Expected results:

- `git diff --check` exits zero.
- The two old-metadata `rg` commands return no matches.
- The placeholder `rg` command returns no matches after placeholder fill.

If `publishConfig` is being removed for an internal-only move, verify separately that no `publishConfig` blocks remain in the 11 publishable package manifests.
