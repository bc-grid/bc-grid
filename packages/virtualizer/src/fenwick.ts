/**
 * Fenwick tree (binary indexed tree) for fast cumulative sums under
 * point updates. Used by `Virtualizer` to track cumulative row / column
 * offsets in O(log N) per update + query — replaces the spike's flat-array
 * rebuild which was O(N) per height change.
 *
 * Indexing is 0-based on the public API; internal storage is 1-indexed
 * because the Fenwick algorithm is cleaner that way (the lowest set bit
 * trick relies on idx > 0).
 *
 * Storage: `Float64Array` of size N+1. ~8 bytes per slot. For 100k rows
 * that's ~800KB — within the §3.2 < 30MB grid-overhead bar by a wide
 * margin (and identical to the spike's flat array of N entries).
 *
 * Backed by a parallel `values` array so `value(i)` is O(1) without an
 * extra prefix-sum subtraction. Memory cost: 2× — acceptable.
 */

export class FenwickTree {
  /** 1-indexed internal storage; index 0 is unused. Length = size + 1. */
  private readonly tree: Float64Array
  /** 0-indexed mirror of the input values. */
  private readonly values: Float64Array
  readonly size: number
  /** Largest power of 2 ≤ size; pre-computed for findLowerBound traversal. */
  private readonly maxStep: number

  constructor(size: number, defaultValue = 0) {
    if (size < 0) throw new Error("FenwickTree size must be ≥ 0")
    this.size = size
    this.tree = new Float64Array(size + 1)
    this.values = new Float64Array(size)

    if (defaultValue !== 0 && size > 0) {
      this.values.fill(defaultValue)
      // O(N) build via the standard linear-time Fenwick construction.
      // After this, tree[i] holds the sum of its responsibility range.
      for (let i = 1; i <= size; i++) {
        const slot = (this.tree[i] ?? 0) + defaultValue
        this.tree[i] = slot
        const parent = i + (i & -i)
        if (parent <= size) {
          this.tree[parent] = (this.tree[parent] ?? 0) + slot
        }
      }
    }

    // Largest power of 2 ≤ size, for findLowerBound's bit-decomposition.
    let step = 1
    while (step <= size) step <<= 1
    this.maxStep = step >> 1
  }

  /**
   * Point query: value at 0-based index `i`. O(1).
   */
  value(i: number): number {
    if (i < 0 || i >= this.size) return 0
    return this.values[i] ?? 0
  }

  /**
   * Replace the value at `i`. O(log N). No-op if the value is unchanged.
   */
  set(i: number, newValue: number): void {
    if (i < 0 || i >= this.size) return
    const old = this.values[i] ?? 0
    if (old === newValue) return
    this.values[i] = newValue
    const delta = newValue - old
    for (let idx = i + 1; idx <= this.size; idx += idx & -idx) {
      this.tree[idx] = (this.tree[idx] ?? 0) + delta
    }
  }

  /**
   * Add `delta` to the value at `i`. O(log N).
   */
  add(i: number, delta: number): void {
    if (i < 0 || i >= this.size || delta === 0) return
    this.values[i] = (this.values[i] ?? 0) + delta
    for (let idx = i + 1; idx <= this.size; idx += idx & -idx) {
      this.tree[idx] = (this.tree[idx] ?? 0) + delta
    }
  }

  /**
   * Sum of values in `[0..i]` (inclusive). Returns 0 for `i < 0`. O(log N).
   */
  prefixSum(i: number): number {
    if (i < 0) return 0
    const upper = Math.min(i, this.size - 1)
    let sum = 0
    for (let idx = upper + 1; idx > 0; idx -= idx & -idx) {
      sum += this.tree[idx] ?? 0
    }
    return sum
  }

  /**
   * Sum of all values. O(log N) (could be cached as O(1) but kept simple).
   */
  total(): number {
    return this.prefixSum(this.size - 1)
  }

  /**
   * Returns the smallest 0-based index `i` such that `prefixSum(i) > target`.
   * Equivalently: "which row does pixel `target` fall into when traversing
   * cumulative heights?"
   *
   * Returns 0 if even `prefixSum(0)` exceeds `target` (target is in row 0).
   * Returns `size` if no prefix exceeds `target` (target is past the end).
   *
   * O(log N) via the standard Fenwick bit-decomposition descent — does not
   * call `prefixSum` per step.
   */
  upperBound(target: number): number {
    let pos = 0
    let remaining = target
    for (let step = this.maxStep; step > 0; step >>= 1) {
      const next = pos + step
      if (next <= this.size) {
        const slot = this.tree[next] ?? 0
        if (slot <= remaining) {
          pos = next
          remaining -= slot
        }
      }
    }
    // `pos` is the largest 1-indexed position whose cumulative slot sum is
    // ≤ target. The first index with prefixSum > target is `pos` (1-indexed)
    // = `pos - 1 + 1` (0-indexed) = `pos` 0-indexed. If `pos === size`,
    // every prefix is ≤ target.
    return pos
  }
}
