# bsncraft Monorepo Move - bc-grid Side Prep

**Status:** ready with metadata edits required during the move.
**Author:** worker2.
**Source baseline:** `v0.6.0` / `7b4d276` on `origin/main`.
**Target location:** `~/work/bsncraft/packages/bc-grid/`.

This is the bc-grid-side pre-flight for the upcoming move into the bsncraft monorepo. It does not perform the move. Worker1's runbook should consume these findings before the actual import.

## Overall Verdict

bc-grid is structurally ready to move as a nested workspace package. The package dependency graph already uses `workspace:*` for internal `@bc-grid/*` dependencies, build and API-surface paths are relative, and no source/config file hardcodes `/Users/johnc/work/bc-grid`.

The non-code blockers are package metadata decisions:

- All publishable package manifests still point `repository.url` at `git+https://github.com/bc-grid/bc-grid.git`.
- All publishable package manifests still use `repository.directory: "packages/<name>"`, which will be wrong after nesting under `packages/bc-grid/`.
- All publishable package manifests still publish to GitHub Packages via `publishConfig.registry: "https://npm.pkg.github.com"`. That can remain valid, but the move plan needs an explicit maintainer decision.

## Checklist

| Item | Verdict | Findings | Move Action |
| --- | --- | --- | --- |
| Internal `@bc-grid/*` deps use `workspace:*` | Ready | Every tracked `@bc-grid/*` dependency in package and app manifests is `workspace:*`. No non-workspace internal dependency was found. | No bc-grid-side change needed before import. |
| `packages/*/package.json` `repository.url` | Not ready until move | All 11 publishable packages point at `git+https://github.com/bc-grid/bc-grid.git`. | Replace with the bsncraft repo URL if the canonical source becomes bsncraft. |
| `packages/*/package.json` `repository.directory` | Not ready until move | All 11 publishable packages use `packages/<name>`. | Replace with `packages/bc-grid/packages/<name>` after import. |
| `publishConfig.registry` | Decision required | All 11 publishable packages use GitHub Packages with restricted access. | Decide whether to keep GitHub Packages, matching the current bsncraft strategy doc, or move to a bsncraft-owned registry. |
| TypeScript build config paths | Ready | There is no root `tsconfig.build.json`. Package build tsconfigs are relative and safe: `packages/core`, `aggregations`, `react`, `editors`, and `virtualizer`. Other packages build through `tsup` without a build tsconfig. | No path rewrite needed if commands run from `packages/bc-grid/`. |
| API-surface manifest paths | Ready | `tools/api-surface/src/manifest.ts` uses relative paths like `packages/react/dist/index.d.ts` and `packages/react/dist/index.js`. | Keep the API-surface command rooted at `packages/bc-grid/`, or wrap it from bsncraft root with `cd packages/bc-grid`. |
| Hardcoded `/Users/johnc/work/bc-grid` sweep | Ready | The exact handoff command only found the handoff itself. No source/config hit was found. | No source/config rewrite needed. |
| `~/work/bc-grid` doc references | Follow-up cleanup | Coordination docs and worker instructions still describe the old standalone worktree layout. These are not build blockers. | After the move, update operational docs to point coordinator/worker instructions at the new bsncraft location. |

## Package Dependency Audit

Tracked internal dependencies found:

```text
apps/animation-benchmarks/package.json  dependencies     @bc-grid/animations        workspace:*
apps/benchmarks/package.json            dependencies     @bc-grid/core              workspace:*
apps/benchmarks/package.json            dependencies     @bc-grid/react             workspace:*
apps/benchmarks/package.json            dependencies     @bc-grid/server-row-model  workspace:*
apps/benchmarks/package.json            dependencies     @bc-grid/virtualizer       workspace:*
apps/examples/package.json              dependencies     @bc-grid/editors           workspace:*
apps/examples/package.json              dependencies     @bc-grid/react             workspace:*
apps/examples/package.json              dependencies     @bc-grid/theming           workspace:*
packages/aggregations/package.json      dependencies     @bc-grid/core              workspace:*
packages/animations/package.json        dependencies     @bc-grid/core              workspace:*
packages/editors/package.json           dependencies     @bc-grid/core              workspace:*
packages/editors/package.json           dependencies     @bc-grid/react             workspace:*
packages/enterprise/package.json        dependencies     @bc-grid/core              workspace:*
packages/enterprise/package.json        dependencies     @bc-grid/react             workspace:*
packages/export/package.json            dependencies     @bc-grid/core              workspace:*
packages/filters/package.json           dependencies     @bc-grid/core              workspace:*
packages/react/package.json             dependencies     @bc-grid/core              workspace:*
packages/react/package.json             dependencies     @bc-grid/virtualizer       workspace:*
packages/react/package.json             dependencies     @bc-grid/animations        workspace:*
packages/react/package.json             dependencies     @bc-grid/theming           workspace:*
packages/react/package.json             dependencies     @bc-grid/aggregations      workspace:*
packages/react/package.json             dependencies     @bc-grid/filters           workspace:*
packages/react/package.json             dependencies     @bc-grid/export            workspace:*
packages/react/package.json             dependencies     @bc-grid/server-row-model  workspace:*
packages/react/package.json             devDependencies  @bc-grid/editors           workspace:*
packages/server-row-model/package.json  dependencies     @bc-grid/core              workspace:*
packages/theming/package.json           dependencies     @bc-grid/core              workspace:*
packages/virtualizer/package.json       dependencies     @bc-grid/core              workspace:*
```

No internal dependency with a version other than `workspace:*` was found.

## Package Metadata Rewrite

All publishable packages currently share this shape:

```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/bc-grid/bc-grid.git",
  "directory": "packages/<package-name>"
},
"publishConfig": {
  "registry": "https://npm.pkg.github.com",
  "access": "restricted"
}
```

Recommended post-import metadata shape if bsncraft becomes canonical source:

```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/bsncraft/bsncraft.git",
  "directory": "packages/bc-grid/packages/<package-name>"
}
```

Mechanical replacement pattern after import:

```bash
cd ~/work/bsncraft/packages/bc-grid
perl -0pi -e 's#git\+https://github\.com/bc-grid/bc-grid\.git#git+https://github.com/bsncraft/bsncraft.git#g; s#"directory": "packages/#"directory": "packages/bc-grid/packages/#g' packages/*/package.json
```

Do not change `publishConfig.registry` mechanically unless the maintainer decides package publishing should move away from GitHub Packages.

## TypeScript Config Audit

There is no root `tsconfig.build.json` in bc-grid. Actual build configs:

- `packages/core/tsconfig.build.json`
- `packages/aggregations/tsconfig.build.json`
- `packages/react/tsconfig.build.json`
- `packages/editors/tsconfig.build.json`
- `packages/virtualizer/tsconfig.build.json`

All of these use relative paths such as `extends: "../../tsconfig.base.json"`, `rootDir: "./src"`, and `outDir: "./dist"`. The root `tsconfig.json` also uses relative project references like `./packages/react` and `./tools/api-surface`.

Ready verdict: these stay valid when the whole bc-grid repo root is nested under `bsncraft/packages/bc-grid/`, provided bc-grid commands run from that directory.

## API Surface Audit

`tools/api-surface/src/manifest.ts` uses package-root-relative paths only:

```text
packages/core/dist/index.d.ts
packages/core/dist/index.js
packages/react/dist/index.d.ts
packages/react/dist/index.js
packages/virtualizer/dist/index.d.ts
packages/virtualizer/dist/index.js
packages/animations/dist/index.d.ts
packages/animations/dist/index.js
packages/theming/dist/index.d.ts
packages/theming/dist/index.js
packages/aggregations/dist/index.d.ts
packages/aggregations/dist/index.js
packages/filters/dist/index.d.ts
packages/filters/dist/index.js
packages/export/dist/index.d.ts
packages/export/dist/index.js
packages/server-row-model/dist/index.d.ts
packages/server-row-model/dist/index.js
packages/editors/dist/index.d.ts
packages/editors/dist/index.js
packages/enterprise/dist/index.d.ts
packages/enterprise/dist/index.js
```

Ready verdict: no manifest rewrite needed if `bun run api-surface` runs from `packages/bc-grid/`.

## Hardcoded Path Audit

Exact handoff command:

```bash
git ls-files | xargs grep -l '/Users/johnc/work/bc-grid'
```

Result:

```text
docs/coordination/handoff-worker2.md
```

Additional operational-doc note: many docs intentionally mention `~/work/bc-grid` as the old coordinator worktree. These are not source/config blockers, but they should be swept after the move so future worker instructions do not point at a retired checkout.

## bsncraft-Side Observations

These are not bc-grid-side blockers, but they affect the move runbook:

- `~/work/bsncraft/apps/web/package.json` currently depends on `@bc-grid/editors`, `@bc-grid/react`, and `@bc-grid/theming` at `0.6.0-alpha.3`.
- `~/work/bsncraft/packages/ui/package.json` currently depends on `@bc-grid/react` and `@bc-grid/theming` at `0.6.0-alpha.3`.
- After import, these should become `workspace:*`.
- bsncraft root workspaces are currently only `apps/*` and `packages/*`; the move needs to add `packages/bc-grid/packages/*` so Bun sees the individual `@bc-grid/*` packages.

## Commands Run

```bash
git fetch origin
git switch --detach origin/main
git switch -c agent/worker2/v1-bsncraft-monorepo-move-bc-grid-side-prep
git ls-files '*package.json' | xargs jq -r '... internal dependency audit ...'
rg -n '(/Users|~/work|/work/bc-grid|bc-grid/)' tsconfig.json tsconfig.base.json packages/*/tsconfig*.json tools/*/tsconfig.json apps/*/tsconfig.json
rg -n '(/Users|~/work|^\\s*(declarationPath|runtimePath):\\s*")' tools/api-surface/src/manifest.ts
git ls-files | xargs grep -n '/Users/johnc/work/bc-grid'
```
