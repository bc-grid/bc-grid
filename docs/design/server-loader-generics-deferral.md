# Server Loader Generics — Deferred to v0.6

**Status:** v0.5 deferred; revisit in v0.6
**Author:** worker1 (audit P1-C2 follow-up after server-hook trio shipped)
**Date:** 2026-05-03
**Related:** audit-2026-05 P1-C2 (typed sort/filter against column ids), audit P0-6 (server-hook trio: PR #363 / #368 / #371), handoff-worker1.md "stretch generic TRow propagation"

## Goal

Tighten `columnId` from bare `string` to `keyof TRow & string` inside the server query types so a typo on a column id in the consumer's `loadPage` / `loadBlock` / `loadChildren` switch becomes a compile error rather than a silent miss at runtime.

```ts
// Today
const loader: LoadServerPage<Customer> = async (query) => {
  switch (query.view.sort[0]?.columnId) {
    case "lgalName":  // ← typo, no error
      ...
  }
}

// Goal
case "lgalName":  // ← compile error: '"lgalName"' is not assignable to '"id" | "legalName" | "balance" | ...'
```

## Why this is deferred

The natural shape — parameterize the chain `ServerSort<TRow>`, `ServerColumnFilter<TRow>`, `ServerGroup<TRow>`, `ServerViewState<TRow>`, `ServerQueryBase<TRow>`, `ServerPagedQuery<TRow>`, `ServerBlockQuery<TRow>`, `ServerTreeQuery<TRow>` with default `TRow = unknown` — is implementable but breaks TypeScript's strict variance for callback types.

When `ServerPagedQuery` becomes `ServerPagedQuery<TRow>`, the loader signature

```ts
export type LoadServerPage<TRow> = (
  query: ServerPagedQuery<TRow>,  // contravariant input
  context: ServerLoadContext,
) => Promise<ServerPagedResult<TRow>>
```

puts `TRow` in **contravariant** position (the function accepts `query: ServerPagedQuery<TRow>` as input). With strict function types, `LoadServerPage<Customer>` is **no longer assignable** to a parameter expecting `LoadServerPage<unknown>` because:

- `LoadServerPage<unknown>` accepts `query: ServerPagedQuery<unknown>` (where `columnId: string`)
- `LoadServerPage<Customer>` accepts `query: ServerPagedQuery<Customer>` (where `columnId: keyof Customer & string`)
- Going from the loose to the tight requires `string` to be assignable to `keyof Customer & string`, which it is not.

This breaks every existing call site that passes a typed loader through a function whose parameter is not also generic. Concretely, the experiment surfaced compile errors in:

- `apps/examples/src/serverEditExample.tsx:142` — `queryServerCustomers(rows, query)` where `queryServerCustomers` accepts the un-parameterized `ServerPagedQuery`.
- `packages/react/src/useServerInfiniteGrid.ts` and `useServerTreeGrid.ts` — the wrapped loader callbacks, where `loadChildrenRef.current(query, ctx)` falls through generic-loader→generic-loader and TS rejects the variance mismatch.

The handoff for this stretch task (`handoff-worker1.md` → "Active now → v05-server-loader-generics") was explicit: **"Only ship if low risk — this touches the public type surface in `@bc-grid/core` server query types. If the change ripples through bsncraft's wrapper unfavorably, defer to v0.6."** It does ripple. Deferring.

## Workarounds considered

- **Make the loader a method on an interface (bivariant).** TS checks methods bivariantly while function-typed properties are checked strictly. So changing `LoadServerPage<TRow>` from a callable type alias to an interface with a named method (`{ load(query, ctx): Promise<...> }`) sidesteps the variance check — but breaks the consumer ergonomic of writing the loader as a plain async function. Rejected: forces a callable→method API change on every consumer.
- **Add `ColumnId` to the union (`keyof TRow & string | string`).** Resolves to `string`, defeating the purpose. Rejected.
- **Cast at the boundary inside the React hooks.** Hides the variance issue but consumers still hit it whenever they pass a typed loader through any generic helper. Rejected: addresses the symptom in one place, not the root.
- **Phantom-type `BrandedColumnId<TRow>`.** Layered on top of `ColumnId = string` with a brand. Same variance trap; the brand is what TS variance-checks.
- **Don't parameterize the query, only the result.** Status quo — what we have today. The audit ask was specifically to narrow the query side, so this is the deferral.

## Recommended v0.6 approach

Two paths to choose from in v0.6:

1. **Breaking change to the loader signature.** Bump major before v1.0 cut and switch `LoadServerPage<TRow>` (and friends) to a method-style interface so bivariance gives us the narrowing without the variance trap. Cost: one-time consumer migration; benefit: typo-safe loaders going forward.
2. **Consumer-side opt-in narrowing helper.** Ship `narrowServerPagedQuery<TRow>(query: ServerPagedQuery): ServerPagedQuery & { view: { sort: ServerSort<TRow>[]; filter?: ServerFilter<TRow>; ... } }` that consumers call inside their loader to obtain the narrowed view without modifying the loader signature. Cost: one extra call per loader; benefit: zero breaking change, opt-in, doesn't affect non-typed consumers.

Path **(2)** is the lower-friction default and the recommended starting point for v0.6. Path **(1)** is an option if the v1.0 release window is the natural breaking-change window anyway.

## What did NOT change in this PR

This is a docs-only PR. No source changes. The audit P1-C2 ticket stays open as a v0.6 follow-up.

## Cross-references

- Audit findings: `docs/coordination/audit-2026-05/worker1-findings.md` P1-W1-? and synthesis P1-C2.
- Handoff: `docs/coordination/handoff-worker1.md` → "Active now → v05-server-loader-generics".
- Server query types: `packages/core/src/index.ts:443-590` (`ServerSort`, `ServerColumnFilter`, `ServerGroup`, `ServerViewState`, `ServerQueryBase`, `ServerPagedQuery`, `ServerBlockQuery`, `ServerTreeQuery`, `LoadServerPage`, `LoadServerBlock`, `LoadServerTreeChildren`).
