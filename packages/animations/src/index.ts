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

export type MotionPolicy = "normal" | "reduced"
export type SlideDirection = "up" | "down" | "left" | "right"

export interface AnimationOptions {
  duration?: number
  easing?: string
  motionPolicy?: MotionPolicy
  reducedMotion?: boolean
  budget?: AnimationBudget
}

export interface FlipOptions extends AnimationOptions {
  maxAnimations?: number
}

export interface FlipTarget {
  element: HTMLElement
  first: FlipRect
  last?: FlipRect
}

export interface SlideOptions extends AnimationOptions {
  distance?: number
}

export interface AnimationBudgetOptions {
  maxInFlight?: number
  hardMaxInFlight?: number
}

export const DEFAULT_ANIMATION_MAX_IN_FLIGHT = 100
export const HARD_ANIMATION_MAX_IN_FLIGHT = 200

const defaultAnimationOptions = {
  duration: 200,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
} as const

export class AnimationBudget {
  readonly maxInFlight: number
  readonly hardMaxInFlight: number
  private inFlightCount = 0

  constructor(options: AnimationBudgetOptions = {}) {
    this.hardMaxInFlight = Math.max(1, options.hardMaxInFlight ?? HARD_ANIMATION_MAX_IN_FLIGHT)
    this.maxInFlight = Math.min(
      Math.max(1, options.maxInFlight ?? DEFAULT_ANIMATION_MAX_IN_FLIGHT),
      this.hardMaxInFlight,
    )
  }

  get inFlight(): number {
    return this.inFlightCount
  }

  get available(): number {
    return Math.max(0, this.maxInFlight - this.inFlightCount)
  }

  canStart(count = 1): boolean {
    return count > 0 && this.inFlightCount + count <= this.maxInFlight
  }

  reserve(count = 1): boolean {
    if (!this.canStart(count)) return false
    this.inFlightCount += count
    return true
  }

  release(count = 1): void {
    this.inFlightCount = Math.max(0, this.inFlightCount - Math.max(0, count))
  }

  reset(): void {
    this.inFlightCount = 0
  }

  limit<T>(items: readonly T[], requested = items.length): T[] {
    const count = Math.max(0, Math.min(requested, this.available, items.length))
    return items.slice(0, count)
  }
}

const defaultAnimationBudget = new AnimationBudget()

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
      transform: `translate3d(${delta.x}px, ${delta.y}px, 0)${fromScale}`,
    },
    {
      transform: "translate3d(0, 0, 0) scale(1, 1)",
    },
  ]
}

export function createFlashKeyframes(): Keyframe[] {
  return [{ opacity: 0.72 }, { opacity: 1 }]
}

export function createSlideKeyframes(direction: SlideDirection, distance = 12): Keyframe[] {
  const offset = Math.max(0, distance)
  const from = {
    up: `translate3d(0, ${offset}px, 0)`,
    down: `translate3d(0, -${offset}px, 0)`,
    left: `translate3d(${offset}px, 0, 0)`,
    right: `translate3d(-${offset}px, 0, 0)`,
  } satisfies Record<SlideDirection, string>

  return [
    { transform: from[direction], opacity: 0 },
    { transform: "translate3d(0, 0, 0)", opacity: 1 },
  ]
}

export function flip(targets: Iterable<FlipTarget>, options: FlipOptions = {}): Animation[] {
  if (shouldReduceMotion(options)) return []

  const budget = options.budget ?? defaultAnimationBudget
  const targetList = Array.from(targets)
  const maxAnimations = Math.max(
    0,
    Math.min(options.maxAnimations ?? targetList.length, targetList.length),
  )
  const animations: Animation[] = []

  for (const target of targetList) {
    if (animations.length >= maxAnimations) break
    const last = target.last ?? readFlipRect(target.element)
    const delta = calculateFlipDelta(target.first, last)
    if (!shouldAnimateDelta(delta)) continue

    const animation = animateWithBudget(target.element, createFlipKeyframes(delta), options, budget)
    if (!animation) break
    animations.push(animation)
  }

  return animations
}

export function flash(element: HTMLElement, options: AnimationOptions = {}): Animation | null {
  if (shouldReduceMotion(options)) return null

  return animateWithBudget(element, createFlashKeyframes(), { duration: 140, ...options })
}

export function slide(
  element: HTMLElement,
  direction: SlideDirection,
  options: SlideOptions = {},
): Animation | null {
  if (shouldReduceMotion(options)) return null

  return animateWithBudget(element, createSlideKeyframes(direction, options.distance), {
    duration: 160,
    ...options,
  })
}

export function playFlip(
  element: HTMLElement,
  first: FlipRect,
  options: AnimationOptions = {},
): Animation | null {
  return flip([{ element, first }], { ...options, maxAnimations: 1 })[0] ?? null
}

export function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
}

export function resolveMotionPolicy(policy?: MotionPolicy): MotionPolicy {
  return policy ?? (prefersReducedMotion() ? "reduced" : "normal")
}

function shouldReduceMotion(options: AnimationOptions): boolean {
  return options.reducedMotion === true || resolveMotionPolicy(options.motionPolicy) === "reduced"
}

function animateWithBudget(
  element: HTMLElement,
  keyframes: Keyframe[],
  options: AnimationOptions,
  budget = options.budget ?? defaultAnimationBudget,
): Animation | null {
  if (!budget.reserve(1)) return null
  try {
    const animation = element.animate(keyframes, timing(options))
    trackBudget(animation, budget)
    return animation
  } catch (error) {
    budget.release(1)
    throw error
  }
}

function trackBudget(animation: Animation, budget: AnimationBudget | undefined): void {
  if (!budget) return
  let released = false
  const release = () => {
    if (released) return
    released = true
    budget.release(1)
  }
  void animation.finished.then(release, release)
}

function timing(options: AnimationOptions): KeyframeAnimationOptions {
  return {
    duration: options.duration ?? defaultAnimationOptions.duration,
    easing: options.easing ?? defaultAnimationOptions.easing,
    fill: "both",
  }
}
