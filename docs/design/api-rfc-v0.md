# RFC: Public API v0 (api-rfc-v0)

**Status:** Done — see `docs/api.md` for the spec.
**Owner:** c1 (Claude)

The `api-rfc-v0` task drafted the binding public API surface for bc-grid. The spec lives at `docs/api.md` and becomes the contract enforced by CI's `api-surface-diff` after merge.

This file remains as a stub so links from `queue.md` continue to resolve, but the substantive content is at `docs/api.md`.

## Process reminder

1. RFC reviewed by a fresh agent.
2. Once merged, `docs/api.md` is the binding contract.
3. CI runs `tools/api-surface-diff` on every subsequent PR; non-empty diff → architect review.
4. Q2+ extensions append to `docs/api.md`; never edit a `frozen at v0.1` section without major version bump.
