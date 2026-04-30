import type { BcServerGridApi, ServerRowUpdate } from "@bc-grid/core"
import type { RefObject } from "react"
import { useEffect } from "react"

export type BcServerRowUpdateHandler<TRow> = (update: ServerRowUpdate<TRow>) => void

export type BcServerRowUpdateUnsubscribe = undefined | (() => void) | { unsubscribe(): void }

export type BcServerRowUpdateSubscribe<TRow> = (
  handler: BcServerRowUpdateHandler<TRow>,
) => BcServerRowUpdateUnsubscribe

export function useServerRowUpdates<TRow>(
  apiRef: RefObject<BcServerGridApi<TRow> | null>,
  subscribe: BcServerRowUpdateSubscribe<TRow> | undefined,
): void {
  useEffect(() => {
    if (!subscribe) return
    const unsubscribe = subscribe((update) => apiRef.current?.applyServerRowUpdate(update))
    return () => disposeServerRowUpdateSubscription(unsubscribe)
  }, [apiRef, subscribe])
}

function disposeServerRowUpdateSubscription(unsubscribe: BcServerRowUpdateUnsubscribe): void {
  if (typeof unsubscribe === "function") {
    unsubscribe()
    return
  }
  unsubscribe?.unsubscribe()
}
