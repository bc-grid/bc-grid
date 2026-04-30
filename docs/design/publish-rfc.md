# publish-rfc — distributing bc-grid to private consumers

**Author:** c2
**Date:** 2026-04-30
**Status:** approved (sole maintainer; private-only distribution)
**Implements:** items 1-11 from "What's needed to deploy bc-grid as a private package" (audit conversation 2026-04-30).

## Goal

bc-grid ships as a private npm-style package set installable from the consuming bc-next ERP via `bun add @bc-grid/react`. The bc-grid repo stays fully private — only the maintainer (and any future explicitly-granted accounts) can read or install.

## Decision summary

| Decision | Choice | Why |
|---|---|---|
| Registry | **GitHub Packages** (`https://npm.pkg.github.com`) | Repo is on GitHub; no extra hosting; private-by-default for private repos. |
| Auth (publish) | CI's automatic `GITHUB_TOKEN` | Already scoped `write:packages`, no manual token rotation. |
| Auth (consume) | **Classic** Personal Access Token with `read:packages` + `repo` scopes | Fine-grained PATs are flaky for cross-repo private package reads; Classic is rock-solid. Stored in `~/.npmrc` locally; in consumer-side CI as a secret. |
| Versioning | **Changesets** (`@changesets/cli`) | Per-package version bumps + auto-generated changelog + handles `workspace:*` rewrite at publish-time. Battle-tested. |
| Initial version | `0.1.0-alpha.1` | Matches `docs/coordination/v0.1-alpha-release-plan.md`. |
| License | `UNLICENSED` (proprietary, all rights reserved) | Internal/ERP use only; no public consumers. |
| Release trigger | Tag push (`v0.1.0-alpha.1`, etc.) — workflow runs `bun publish` per package | Manual control; predictable. |
| Stub packages | Publish all 11 (including the 3 reserved-empty ones: editors, enterprise, plus filters/aggregations until they ship) | Locks the `@bc-grid/*` namespace under our scope. Empty publishes are <1KB each. |

## Out of scope

- npm provenance attestation (post-v1; nice-to-have).
- Consumer-facing examples app or quickstart guide beyond a README install snippet.
- Multi-org distribution (e.g., npm.pkg.github.com under a different org account). If that's needed later, the registry URL just changes — no architectural impact.

## Auth model details

### Publish (CI-only)

Release workflow uses `${{ secrets.GITHUB_TOKEN }}` which GitHub Actions injects automatically. It has `write:packages` scope by default for the actions-running repo. **No manual token creation needed.**

The workflow's `permissions:` block must declare:
```yaml
permissions:
  contents: read
  packages: write
```

### Consume (local + consumer CI)

The consumer (bc-next ERP) needs a Classic PAT. Setup steps for the maintainer:

1. GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate new token (classic).
2. Scopes: `read:packages` + `repo`. (`repo` is required because the package lives in a private repo; without it, GitHub Packages denies the install.)
3. Set "no expiration" or a long expiration; rotate annually.
4. Save the token; it's never shown again.

Local install (`~/.npmrc`):
```
@bc-grid:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=ghp_xxx...
```

Consumer-side CI (e.g., bc-next's `.github/workflows/ci.yml`):
- Add the PAT as a repo secret (e.g., `BC_GRID_READ_TOKEN`).
- Project `.npmrc` (committed to the consumer's repo):
  ```
  @bc-grid:registry=https://npm.pkg.github.com
  //npm.pkg.github.com/:_authToken=${BC_GRID_READ_TOKEN}
  ```
- The consumer's CI step reads the env var; locally each maintainer reads from `~/.npmrc`.

### Important: Classic PAT > Fine-grained

Fine-grained PATs technically support `Packages: read` permission but the cross-repo private-package read path has known issues (404s, perm denials, scope confusion). Stick with Classic until GitHub firms up the fine-grained model. Documenting this here so future-me doesn't re-evaluate and switch.

## Package-by-package publish list

11 packages. All in `packages/`. Top-level `apps/*` and `tools/*` never publish.

| Package | Status | Bundle size (gzip) | Publish? |
|---|---|---:|---|
| `@bc-grid/core` | enforced — core types | 53 B | ✓ |
| `@bc-grid/virtualizer` | enforced — runtime engine | 6.88 KiB | ✓ |
| `@bc-grid/animations` | enforced — runtime engine | 1.63 KiB | ✓ |
| `@bc-grid/theming` | enforced — CSS + tokens | n/a (CSS) | ✓ |
| `@bc-grid/react` | enforced — main consumer entry | ~22 KiB | ✓ |
| `@bc-grid/server-row-model` | planned (paged + infinite shipping) | small | ✓ |
| `@bc-grid/export` | enforced — toCsv/toExcel/toPdf | small | ✓ |
| `@bc-grid/aggregations` | planned, empty stub | <1 KB | ✓ (namespace lock) |
| `@bc-grid/filters` | planned, empty stub | <1 KB | ✓ (namespace lock) |
| `@bc-grid/editors` | reserved Q2, empty | <1 KB | ✓ (namespace lock) |
| `@bc-grid/enterprise` | reserved Q5, empty | <1 KB | ✓ (namespace lock) |

Total combined gzipped install footprint at v0.1.0-alpha.1: ~31 KiB across the runtime packages, ~4 KB for the empty stubs. Comfortable inside the 60 KiB design budget.

## Versioning policy

- **Single shared version** across all 11 packages (changesets default mode for monorepos).
- Pre-1.0: `0.1.0-alpha.X` for sprint snapshots; `0.1.0-beta.X` once feature-complete; `0.1.0` for the alpha-release acceptance criteria; `0.2.0` for v1 parity sprint completion; `1.0.0` when GA.
- Changesets manages bumps via `bun run changeset` + `bun run changeset version` + `bun run release`.
- Internal `workspace:*` deps stay as `workspace:*` in source `package.json` files; changesets/bun rewrite them to actual version pins **only at publish-time**. Source-of-truth is `workspace:*`.

## Release workflow shape

`.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags: ['v*']

permissions:
  contents: read
  packages: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun run type-check
      - run: bun run lint
      - run: bun run --filter './packages/*' build
      - run: bun run bundle-size
      - run: bun run api-surface
      - run: bun run test
      - name: Configure npm registry
        run: |
          cat > ~/.npmrc <<EOF
          @bc-grid:registry=https://npm.pkg.github.com
          //npm.pkg.github.com/:_authToken=${{ secrets.GITHUB_TOKEN }}
          EOF
      - name: Publish all packages
        run: |
          for pkg in packages/*/; do
            (cd "$pkg" && bun publish --access restricted)
          done
```

Notes:
- Pre-publish gate: full test/lint/type-check/build/bundle-size/api-surface must pass.
- `bun publish` (Bun 1.3+) handles the `workspace:*` rewrite automatically.
- Tags drive releases (`git tag v0.1.0-alpha.1 && git push --tags`).
- The `for pkg in packages/*/` loop publishes every package individually; failures halt on the first error (since `bash -e` is GH Actions' default).

## Consumer install path

Once the first release is out, the bc-next consumer:

1. Adds the repo secret `BC_GRID_READ_TOKEN` (one-time).
2. Drops a project `.npmrc`:
   ```
   @bc-grid:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${BC_GRID_READ_TOKEN}
   ```
3. Adds the local `~/.npmrc` for dev (out-of-band; not committed).
4. Runs `bun add @bc-grid/react @bc-grid/theming` (theming is needed for CSS).
5. In their bootstrap code:
   ```ts
   import "@bc-grid/theming/styles.css"
   import { BcGrid } from "@bc-grid/react"
   ```

That's the entire consumer setup.

## Implementation tasks (file in queue.md under a new "Phase 5.6 — Publishing" section)

| Task slug | What | Effort |
|---|---|---|
| `publish-config-pass-1` | Drop `private: true`, set version `0.1.0-alpha.1`, add `publishConfig`/`repository`/`homepage`/`bugs`/`license`/`author` to all 11 `package.json` files. Drop unused `@tanstack/react-table` peerDep from `@bc-grid/react`. | S |
| `license-file` | Root `LICENSE` file with proprietary/UNLICENSED text. | XS |
| `package-readmes` | Per-package `README.md` files (at minimum `@bc-grid/react` + `@bc-grid/theming`; one-paragraph stubs for the others). | S |
| `changesets-setup` | Install `@changesets/cli`, `bun run changeset init`, configure for restricted GitHub Packages access. | S |
| `release-workflow` | `.github/workflows/release.yml` per the RFC's workflow sketch. | S |
| `consumer-install-doc` | README section + `.npmrc.example` template + step-by-step PAT creation guide. | S |
| `tarball-smoke-test` | Pre-publish script: `bun pack` each package, install into a clean tmp project, verify `import { BcGrid }` resolves. | M |
| `first-release` | Cut tag `v0.1.0-alpha.1`, watch the workflow succeed, verify install from a fresh consumer. | S |

Total: ~6 hours of focused work, sized so each can be a separate PR.

## Open questions

1. **Final license text** — is "UNLICENSED" sufficient or does the user want a custom proprietary license string? Default to UNLICENSED unless told otherwise.
2. **Will any future package open-source?** If so, that package would need `"license": "MIT"` etc. and would publish to the public npm registry instead of GitHub Packages. Out of scope for v0.1.0-alpha.

## Why not the alternatives

- **Direct git install** (`bun add github:johncotdev/bc-grid#main`) — Skips the registry; consumer pulls source + builds at install-time. Faster to set up but loses version semantics and adds build tooling to every consumer. Rejected.
- **Verdaccio / private npm Pro / JFrog** — Extra hosting, cost, and operational burden. GitHub Packages is free for private repos and integrates with the existing GH auth.
- **Tarballs in Releases** — Workable for one-off versions but no resolution graph; consumer's `bun.lock` would have to pin tarball URLs. Rejected.
