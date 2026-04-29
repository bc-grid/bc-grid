export interface FlipRect {
  top: number
  left: number
  width: number
  height: number
}

export interface FlipDelta {
  x: number
  y: number
  scaleX: number
  scaleY: number
}

export interface FlipOptions {
  duration?: number
  easing?: string
  reducedMotion?: boolean
}

const defaultFlipOptions = {
  duration: 250,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
} as const

export function readFlipRect(element: Element): FlipRect {
  const rect = element.getBoundingClientRect()
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  }
}

export function calculateFlipDelta(first: FlipRect, last: FlipRect): FlipDelta {
  return {
    x: first.left - last.left,
    y: first.top - last.top,
    scaleX: first.width === 0 || last.width === 0 ? 1 : first.width / last.width,
    scaleY: first.height === 0 || last.height === 0 ? 1 : first.height / last.height,
  }
}

export function shouldAnimateDelta(delta: FlipDelta): boolean {
  return delta.x !== 0 || delta.y !== 0 || delta.scaleX !== 1 || delta.scaleY !== 1
}

export function createFlipKeyframes(delta: FlipDelta): Keyframe[] {
  const fromScale =
    delta.scaleX === 1 && delta.scaleY === 1 ? "" : ` scale(${delta.scaleX}, ${delta.scaleY})`

  return [
    {
      transform: `translate(${delta.x}px, ${delta.y}px)${fromScale}`,
      opacity: 0.98,
    },
    {
      transform: "translate(0, 0) scale(1, 1)",
      opacity: 1,
    },
  ]
}

export function playFlip(
  element: HTMLElement,
  first: FlipRect,
  options: FlipOptions = {},
): Animation | null {
  const last = readFlipRect(element)
  const delta = calculateFlipDelta(first, last)

  if (options.reducedMotion || !shouldAnimateDelta(delta)) {
    return null
  }

  return element.animate(createFlipKeyframes(delta), {
    duration: options.duration ?? defaultFlipOptions.duration,
    easing: options.easing ?? defaultFlipOptions.easing,
    fill: "both",
  })
}

export function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
}
