# Changesets

bc-grid uses [Changesets](https://github.com/changesets/changesets) to manage versions and changelogs for the 11 `@bc-grid/*` packages. All packages are kept at a **single shared version** (the `fixed` array in `config.json`).

## Workflow

### When you make a change that should appear in a release

```bash
bun run changeset
```

This is interactive:
1. Pick which package(s) the change affects (or all, since they're fixed).
2. Pick a bump level — `patch` / `minor` / `major`.
3. Write a one-line summary.

The result is a markdown file in `.changeset/` like `pretty-words-quack.md`. **Commit it** with your code change. Changesets are merged into `main` along with PRs.

### When you cut a release

For alpha prereleases, enter Changesets prerelease mode before versioning
(skip this if `.changeset/pre.json` already exists):

```bash
bunx changeset pre enter alpha
```

```bash
bun run changeset:version
```

This consumes all pending changeset files in `.changeset/`, bumps the package versions, generates `CHANGELOG.md` entries, and updates `bun.lock`. Commit the result.

```bash
git tag v0.1.0-alpha.2
git push --tags
```

The tag push triggers `.github/workflows/release.yml`, which runs the full quality gate then `bun publish` for each package against GitHub Packages.

When leaving alpha prerelease mode for a stable release, run `bunx changeset pre exit` before the final `bun run changeset:version`.

## Why fixed-version mode

All `@bc-grid/*` packages bump together because they're tightly coupled (the React layer pulls 6 sibling packages). A fixed version simplifies consumer install (`bun add @bc-grid/react@0.1.0` resolves all transitives correctly) and reduces version-skew bugs.

If a package needs to ship independently in the future, remove it from the `fixed` array in `.changeset/config.json`.

## Why `commit: false`

The default would auto-commit changesets. We keep changesets human-reviewed before merging — the markdown file goes through PR review like any other change.
