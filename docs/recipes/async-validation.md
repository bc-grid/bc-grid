# Async Validation

`column.validate` accepts a Promise return AND an `AbortSignal` parameter. ERP scenarios where you need to validate against a remote endpoint — "is this customer code already taken?", "does this email match a known account?", "is this SKU still active?" — wire the validator as an async function that calls your server with the supplied signal.

The runtime support has shipped since v0.5; v0.6 §1 adds documentation + regression guards. This recipe collects the patterns.

## Signature

```ts
interface BcGridColumn<TRow, TValue> {
  validate?: (
    newValue: TValue,
    row: TRow,
    signal?: AbortSignal,
  ) => BcValidationResult | Promise<BcValidationResult>
}

type BcValidationResult = { valid: true } | { valid: false; error: string }
```

The grid awaits the result. While the Promise is pending:
- The editing controller is in `mode: "validating"`.
- The editor portal renders `data-bc-grid-edit-state="pending"` on the editor wrapper.
- The editor input is `disabled` (so a double-Enter doesn't race two commits).

When the Promise resolves:
- `{ valid: true }` → the commit proceeds (overlay write + `onCellEditCommit` fires).
- `{ valid: false, error }` → the editor stays mounted with `error` surfaced via the validation popover (per `editing-rfc §validation`).
- Promise rejection (e.g. network throw) → treated as `{ valid: false, error: err.message }`.

When the user cancels (Esc), starts a new commit (re-edit), or supersedes via another commit:
- The current `AbortController` is `abort()`ed.
- The validator's `signal.aborted` becomes `true`.
- The controller drops the late-resolving result (no `validateResolved` dispatch).
- Consumer's `fetch` (or whatever uses the signal) gets the abort and can clean up.

## Pattern 1 — REST `/exists` endpoint

```ts
const customerCodeColumn: BcGridColumn<Customer> = {
  field: "code",
  header: "Code",
  editable: true,
  cellEditor: textEditor,
  validate: async (newValue, row, signal) => {
    if (typeof newValue !== "string" || newValue.length === 0) {
      return { valid: false, error: "Code is required." }
    }
    if (newValue === row.code) {
      // Unchanged — no need to re-check.
      return { valid: true }
    }
    try {
      const res = await fetch(`/api/customers/code-exists?code=${encodeURIComponent(newValue)}`, {
        signal,
      })
      const { exists } = await res.json()
      return exists
        ? { valid: false, error: `Code "${newValue}" is already taken.` }
        : { valid: true }
    } catch (err) {
      // AbortError thrown when signal aborts during the in-flight fetch.
      // Re-throw so the controller treats it as a stale/aborted commit
      // (silently dropped — the new commit owns the lifecycle).
      if ((err as Error).name === "AbortError") throw err
      return { valid: false, error: "Could not verify code (network error)." }
    }
  },
}
```

Two things to notice:

1. **Skip-validate-when-unchanged.** If `newValue === row.code`, the value matches the canonical row — validating would just round-trip the existing value through the network for no gain. Return `{ valid: true }` immediately.
2. **AbortError propagation.** When the signal aborts mid-fetch, the browser throws an `AbortError` from `fetch`. Re-throw it — the controller's catch block detects `signal.aborted` and silently drops the result. If you `return { valid: false, error: ... }` instead, you'd flash a phantom rejection on a cell the user is no longer editing.

## Pattern 2 — Hasura unique-check via GraphQL

```ts
const skuColumn: BcGridColumn<Item> = {
  field: "sku",
  header: "SKU",
  editable: true,
  cellEditor: textEditor,
  validate: async (newValue, row, signal) => {
    if (typeof newValue !== "string" || newValue.length === 0) {
      return { valid: false, error: "SKU is required." }
    }
    if (newValue === row.sku) return { valid: true }

    const query = `
      query CheckSkuTaken($sku: String!) {
        items_aggregate(where: { sku: { _eq: $sku } }) { aggregate { count } }
      }
    `
    try {
      const res = await fetch("/v1/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { sku: newValue } }),
        signal,
      })
      const json = await res.json()
      const taken = json.data.items_aggregate.aggregate.count > 0
      return taken
        ? { valid: false, error: `SKU "${newValue}" already exists.` }
        : { valid: true }
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err
      return { valid: false, error: "Validation server unavailable." }
    }
  },
}
```

## Pattern 3 — Debounced validate (handle rapid typing)

If your validator is expensive (large server query, high latency), you may want to debounce so the user doesn't fire a validate on every keystroke. The grid does NOT debounce on its own — `validate` runs once at commit time (Tab / Enter / blur). The user has to actively press a commit gesture, which acts as natural debouncing.

If you DO want pre-commit hints (live "this code is taken" feedback while the user types), that's separate from the column's `validate` — you'd render your own popover via the editor's `Component` slot. The column-level validate is for COMMIT-time gating.

## Visual: pending spinner

The grid sets `data-bc-grid-edit-state="pending"` on the editor wrapper during the in-flight validation. Theme it to render a spinner:

```css
.bc-grid-editor-portal[data-bc-grid-edit-state="pending"]::after,
.bc-grid-editor-in-cell[data-bc-grid-edit-state="pending"]::after {
  content: "";
  position: absolute;
  right: 6px;
  top: 50%;
  width: 12px;
  height: 12px;
  margin-top: -6px;
  border-radius: 50%;
  border: 2px solid var(--bc-grid-accent);
  border-top-color: transparent;
  animation: bc-grid-spin 600ms linear infinite;
}

@keyframes bc-grid-spin {
  to {
    transform: rotate(360deg);
  }
}
```

The input is also `disabled` while pending (per `editor-portal.tsx`), so the user can't double-press Enter to race two commits.

## Pitfalls

- **Don't return `{ valid: false }` for an aborted validator.** Re-throw the `AbortError` so the controller silently drops the result. A `valid: false` after abort would flash a phantom rejection on a cell the user is no longer editing.
- **Don't call validate yourself outside `column.validate`.** The grid manages the AbortController lifecycle; calling validate manually bypasses the abort + supersedure handling.
- **Keep validate side-effect-free besides the network call.** A validator that mutates consumer state assumes the commit will succeed — but the commit hasn't happened yet (validate is the gate). State mutations belong in `onCellEditCommit`.
- **The `signal` parameter is optional.** Older validators that don't accept it still work. New ones should accept and pass to `fetch` for proper cancellation.
