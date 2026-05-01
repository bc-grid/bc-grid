/**
 * Shared popup / menu positioning helper.
 *
 * Internal Radix-Popper-style positioner used by `FilterPopup`,
 * the right-click context menu, and (next slice) the column-chooser
 * menu. Pure function — given an anchor, the popup size, and the
 * viewport, returns where to render the popup and which side / align
 * the result resolved to. Output is suitable for inline `style.left`
 * / `style.top` plus `data-side` / `data-align` attributes on the
 * popup root, matching shadcn / Radix conventions.
 *
 * Positioning rules (extracted from
 * `docs/coordination/radix-shadcn-chrome-cleanup.md`):
 *
 * 1. **Side flip.** If the requested `side` doesn't fit, flip to the
 *    opposite side. Mirrors `Popper.Content`'s default
 *    `collisionPadding` flip behaviour.
 * 2. **Align clamp.** If aligning `start` causes the popup to clip on
 *    the right (or `end` clips on the left), shift the popup so it
 *    fits, but report the original alignment via `data-align` so
 *    consumers can react (arrow positioning, etc.).
 * 3. **Viewport margin.** A small gap between popup and viewport
 *    edge (`viewportMargin`, default 8). Avoids edge-touching popups.
 * 4. **Smaller-than-viewport guarantee.** Clamps inside the viewport
 *    even when the popup is much smaller; if the popup is larger
 *    than the viewport (rare), it pins to the top-left margin.
 *
 * Point vs rect anchors. A right-click context menu's anchor is a
 * point (where the user clicked). A filter-trigger anchor is a rect
 * (the button's bounding box). Point anchors short-circuit the side
 * + align math — the popup top-left lands at the click point clamped
 * to the viewport, which is the conventional context-menu behaviour.
 */

export type PopupSide = "top" | "right" | "bottom" | "left"
export type PopupAlign = "start" | "center" | "end"

export interface PopupAnchor {
  x: number
  y: number
  /** Width of the trigger; omit (or pass 0) for point anchors. */
  width?: number
  /** Height of the trigger; omit (or pass 0) for point anchors. */
  height?: number
}

export interface PopupSize {
  width: number
  height: number
}

export interface PopupViewport {
  width: number
  height: number
}

export interface PopupPositionRequest {
  anchor: PopupAnchor
  popup: PopupSize
  viewport: PopupViewport
  /** Preferred side relative to the anchor. Default: `"bottom"`. */
  side?: PopupSide
  /** Preferred alignment along the perpendicular axis. Default: `"start"`. */
  align?: PopupAlign
  /** Gap between the trigger edge and the popup, in px. Default: `4`. */
  sideOffset?: number
  /** Gap between the popup and the viewport edge, in px. Default: `8`. */
  viewportMargin?: number
}

export interface PopupPosition {
  /** Pixel offset from the viewport's top-left for the popup. */
  x: number
  y: number
  /** Resolved side after collision flipping. */
  side: PopupSide
  /** Resolved alignment after viewport clamping. */
  align: PopupAlign
}

const DEFAULT_SIDE: PopupSide = "bottom"
const DEFAULT_ALIGN: PopupAlign = "start"
const DEFAULT_SIDE_OFFSET = 4
const DEFAULT_VIEWPORT_MARGIN = 8

export function computePopupPosition(request: PopupPositionRequest): PopupPosition {
  const {
    anchor,
    popup,
    viewport,
    side = DEFAULT_SIDE,
    align = DEFAULT_ALIGN,
    sideOffset = DEFAULT_SIDE_OFFSET,
    viewportMargin = DEFAULT_VIEWPORT_MARGIN,
  } = request

  const isRect = (anchor.width ?? 0) > 0 || (anchor.height ?? 0) > 0

  if (!isRect) {
    // Point anchor: popup top-left at the click point, clamped to viewport.
    // This is the right-click context-menu shape — `side` / `align` /
    // `sideOffset` don't apply because there's no trigger to anchor to.
    return {
      x: clampToViewport(anchor.x, popup.width, viewport.width, viewportMargin),
      y: clampToViewport(anchor.y, popup.height, viewport.height, viewportMargin),
      side: "bottom",
      align: "start",
    }
  }

  const triggerWidth = anchor.width ?? 0
  const triggerHeight = anchor.height ?? 0

  // Pick a side: prefer the requested side, flip to the opposite if there
  // isn't enough room. We don't try alternative perpendicular sides — the
  // chrome-rfc keeps the placement vocabulary small.
  const resolvedSide = pickSide(
    side,
    anchor,
    triggerWidth,
    triggerHeight,
    popup,
    viewport,
    sideOffset,
    viewportMargin,
  )

  // Compute the popup's primary-axis position (along the chosen side).
  let x: number
  let y: number
  if (resolvedSide === "bottom") {
    y = anchor.y + triggerHeight + sideOffset
    x = alignAlongAxis(align, anchor.x, triggerWidth, popup.width)
  } else if (resolvedSide === "top") {
    y = anchor.y - popup.height - sideOffset
    x = alignAlongAxis(align, anchor.x, triggerWidth, popup.width)
  } else if (resolvedSide === "right") {
    x = anchor.x + triggerWidth + sideOffset
    y = alignAlongAxis(align, anchor.y, triggerHeight, popup.height)
  } else {
    // left
    x = anchor.x - popup.width - sideOffset
    y = alignAlongAxis(align, anchor.y, triggerHeight, popup.height)
  }

  // Clamp the perpendicular axis inside the viewport. This shifts the
  // popup if alignment would otherwise overflow — the requested `align`
  // is reported back so consumers can detect the shift via `data-align`.
  if (resolvedSide === "bottom" || resolvedSide === "top") {
    x = clampToViewport(x, popup.width, viewport.width, viewportMargin)
  } else {
    y = clampToViewport(y, popup.height, viewport.height, viewportMargin)
  }

  return { x, y, side: resolvedSide, align }
}

function pickSide(
  requested: PopupSide,
  anchor: PopupAnchor,
  triggerWidth: number,
  triggerHeight: number,
  popup: PopupSize,
  viewport: PopupViewport,
  sideOffset: number,
  viewportMargin: number,
): PopupSide {
  const fits = sideFits(
    requested,
    anchor,
    triggerWidth,
    triggerHeight,
    popup,
    viewport,
    sideOffset,
    viewportMargin,
  )
  if (fits) return requested
  const flipped = oppositeSide(requested)
  const flippedFits = sideFits(
    flipped,
    anchor,
    triggerWidth,
    triggerHeight,
    popup,
    viewport,
    sideOffset,
    viewportMargin,
  )
  // If neither side fits, keep the requested side — the perpendicular-
  // axis clamp will push the popup back into the viewport.
  return flippedFits ? flipped : requested
}

function sideFits(
  side: PopupSide,
  anchor: PopupAnchor,
  triggerWidth: number,
  triggerHeight: number,
  popup: PopupSize,
  viewport: PopupViewport,
  sideOffset: number,
  viewportMargin: number,
): boolean {
  if (side === "bottom") {
    return anchor.y + triggerHeight + sideOffset + popup.height + viewportMargin <= viewport.height
  }
  if (side === "top") {
    return anchor.y - sideOffset - popup.height - viewportMargin >= 0
  }
  if (side === "right") {
    return anchor.x + triggerWidth + sideOffset + popup.width + viewportMargin <= viewport.width
  }
  // left
  return anchor.x - sideOffset - popup.width - viewportMargin >= 0
}

function oppositeSide(side: PopupSide): PopupSide {
  if (side === "top") return "bottom"
  if (side === "bottom") return "top"
  if (side === "left") return "right"
  return "left"
}

function alignAlongAxis(
  align: PopupAlign,
  anchorStart: number,
  triggerSize: number,
  popupSize: number,
): number {
  if (align === "center") return anchorStart + triggerSize / 2 - popupSize / 2
  if (align === "end") return anchorStart + triggerSize - popupSize
  return anchorStart
}

function clampToViewport(
  value: number,
  popupSize: number,
  viewportSize: number,
  viewportMargin: number,
): number {
  const minPos = viewportMargin
  const maxPos = viewportSize - popupSize - viewportMargin
  if (maxPos <= minPos) return minPos
  return Math.min(Math.max(minPos, value), maxPos)
}
