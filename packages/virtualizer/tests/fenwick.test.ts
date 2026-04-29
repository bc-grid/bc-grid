import { describe, expect, test } from "bun:test"
import { FenwickTree } from "../src/fenwick"

/**
 * Reference O(N) cumulative-sum implementation. Every Fenwick test
 * compares against this naive baseline over random sequences — if a
 * Fenwick op disagrees, the test fails with both values logged.
 */
class NaiveCumulativeSum {
  values: number[]
  constructor(size: number, defaultValue = 0) {
    this.values = new Array(size).fill(defaultValue)
  }
  value(i: number): number {
    return this.values[i] ?? 0
  }
  set(i: number, v: number): void {
    if (i >= 0 && i < this.values.length) this.values[i] = v
  }
  add(i: number, delta: number): void {
    if (i >= 0 && i < this.values.length) {
      this.values[i] = (this.values[i] ?? 0) + delta
    }
  }
  prefixSum(i: number): number {
    if (i < 0) return 0
    const upper = Math.min(i, this.values.length - 1)
    let sum = 0
    for (let k = 0; k <= upper; k++) sum += this.values[k] ?? 0
    return sum
  }
  total(): number {
    return this.prefixSum(this.values.length - 1)
  }
  /** Smallest i where prefixSum(i) > target. */
  upperBound(target: number): number {
    let acc = 0
    for (let i = 0; i < this.values.length; i++) {
      acc += this.values[i] ?? 0
      if (acc > target) return i
    }
    return this.values.length
  }
}

describe("FenwickTree — basic correctness", () => {
  test("empty tree", () => {
    const f = new FenwickTree(0)
    expect(f.size).toBe(0)
    expect(f.total()).toBe(0)
    expect(f.prefixSum(0)).toBe(0)
    expect(f.prefixSum(-1)).toBe(0)
    expect(f.prefixSum(100)).toBe(0)
  })

  test("uniform default value populates every slot", () => {
    const f = new FenwickTree(10, 5)
    expect(f.size).toBe(10)
    expect(f.value(0)).toBe(5)
    expect(f.value(9)).toBe(5)
    expect(f.prefixSum(0)).toBe(5)
    expect(f.prefixSum(4)).toBe(25)
    expect(f.total()).toBe(50)
  })

  test("set replaces a value and shifts every prefix sum past it", () => {
    const f = new FenwickTree(5, 10)
    f.set(2, 100)
    expect(f.value(2)).toBe(100)
    expect(f.prefixSum(1)).toBe(20) // unchanged
    expect(f.prefixSum(2)).toBe(120) // includes new value
    expect(f.prefixSum(4)).toBe(140)
    expect(f.total()).toBe(140)
  })

  test("set is a no-op when value is unchanged", () => {
    const f = new FenwickTree(5, 7)
    f.set(2, 7)
    expect(f.total()).toBe(35)
  })

  test("add accumulates onto existing value", () => {
    const f = new FenwickTree(5, 10)
    f.add(2, 5)
    expect(f.value(2)).toBe(15)
    expect(f.prefixSum(2)).toBe(35)
    f.add(2, -5)
    expect(f.value(2)).toBe(10)
  })

  test("out-of-range indexes are no-ops on set / add and return 0 on value", () => {
    const f = new FenwickTree(5, 10)
    f.set(-1, 999)
    f.set(99, 999)
    f.add(-1, 999)
    f.add(99, 999)
    expect(f.value(-1)).toBe(0)
    expect(f.value(99)).toBe(0)
    expect(f.total()).toBe(50) // unchanged
  })
})

describe("FenwickTree — upperBound (rowAtOffset semantics)", () => {
  test("uniform 32px rows: pixel 0 is row 0", () => {
    const f = new FenwickTree(100, 32)
    expect(f.upperBound(0)).toBe(0) // 0 < prefixSum(0) = 32
  })

  test("uniform 32px rows: pixel 31 is still row 0", () => {
    const f = new FenwickTree(100, 32)
    expect(f.upperBound(31)).toBe(0)
  })

  test("uniform 32px rows: pixel 32 is row 1 (boundary inclusive)", () => {
    const f = new FenwickTree(100, 32)
    // prefixSum(0) = 32; 32 > 32 is false; 32 > prefixSum(0) iff target < 32
    // target = 32: smallest i where prefixSum(i) > 32 is 1 (prefixSum(1) = 64)
    expect(f.upperBound(32)).toBe(1)
  })

  test("uniform 32px rows: pixel 1000 lands on row 31", () => {
    const f = new FenwickTree(100, 32)
    // 1000 / 32 = 31.25; row 31 spans [992, 1024)
    expect(f.upperBound(1000)).toBe(31)
  })

  test("upperBound past total returns size (no row contains that pixel)", () => {
    const f = new FenwickTree(10, 32)
    // total = 320; pixel 1000 is past the end
    expect(f.upperBound(1000)).toBe(10)
  })

  test("variable heights: upperBound walks correctly", () => {
    const f = new FenwickTree(5, 0)
    f.set(0, 100)
    f.set(1, 50)
    f.set(2, 75)
    f.set(3, 25)
    f.set(4, 200)
    // cumulative: 100, 150, 225, 250, 450
    expect(f.upperBound(0)).toBe(0)
    expect(f.upperBound(99)).toBe(0)
    expect(f.upperBound(100)).toBe(1)
    expect(f.upperBound(149)).toBe(1)
    expect(f.upperBound(150)).toBe(2)
    expect(f.upperBound(224)).toBe(2)
    expect(f.upperBound(225)).toBe(3)
    expect(f.upperBound(249)).toBe(3)
    expect(f.upperBound(250)).toBe(4)
    expect(f.upperBound(449)).toBe(4)
    expect(f.upperBound(450)).toBe(5) // past end
  })
})

describe("FenwickTree — randomised vs naive baseline", () => {
  /**
   * Run a sequence of random sets / adds against both Fenwick + Naive.
   * After every operation, query random prefix sums and upperBounds and
   * assert they agree.
   */
  function rng(seed: number): () => number {
    let s = seed
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff
      return s
    }
  }

  test("1000 random ops on 100 elements stay in lockstep", () => {
    const SIZE = 100
    const OPS = 1000
    const f = new FenwickTree(SIZE)
    const naive = new NaiveCumulativeSum(SIZE)
    const r = rng(42)

    for (let op = 0; op < OPS; op++) {
      const choice = r() % 4
      const idx = r() % SIZE
      if (choice === 0) {
        const v = r() % 1000
        f.set(idx, v)
        naive.set(idx, v)
      } else if (choice === 1) {
        const delta = (r() % 200) - 100
        f.add(idx, delta)
        naive.add(idx, delta)
      } else if (choice === 2) {
        // prefixSum agreement at this index
        expect(f.prefixSum(idx)).toBe(naive.prefixSum(idx))
      } else {
        // upperBound agreement at a random target across the total range
        const total = naive.total()
        const target = total > 0 ? (r() % (total + 50)) - 10 : 0
        expect(f.upperBound(target)).toBe(naive.upperBound(target))
      }
    }
    // Final agreement on every index.
    for (let i = 0; i < SIZE; i++) {
      expect(f.value(i)).toBe(naive.value(i))
      expect(f.prefixSum(i)).toBe(naive.prefixSum(i))
    }
  })

  test("randomised ops on 10k elements (stress)", () => {
    const SIZE = 10_000
    const OPS = 5_000
    const f = new FenwickTree(SIZE, 32)
    const naive = new NaiveCumulativeSum(SIZE, 32)
    const r = rng(0xc1)

    for (let op = 0; op < OPS; op++) {
      const idx = r() % SIZE
      const v = r() % 200
      f.set(idx, v)
      naive.set(idx, v)
    }
    expect(f.total()).toBe(naive.total())
    // Spot-check 50 random prefix sums.
    for (let k = 0; k < 50; k++) {
      const i = r() % SIZE
      expect(f.prefixSum(i)).toBe(naive.prefixSum(i))
    }
  })
})

describe("FenwickTree — edge sizes", () => {
  test("size 1", () => {
    const f = new FenwickTree(1, 5)
    expect(f.value(0)).toBe(5)
    expect(f.total()).toBe(5)
    expect(f.upperBound(4)).toBe(0)
    expect(f.upperBound(5)).toBe(1)
  })

  test("non-power-of-2 size (the common real case)", () => {
    const f = new FenwickTree(13, 1)
    expect(f.total()).toBe(13)
    // prefixSum(i) = i + 1; smallest i where prefixSum(i) > 6 is 6.
    expect(f.upperBound(6)).toBe(6)
    expect(f.upperBound(12)).toBe(12)
    expect(f.upperBound(13)).toBe(13) // past end
  })

  test("power-of-2 size (edge case for maxStep traversal)", () => {
    const f = new FenwickTree(16, 2)
    expect(f.total()).toBe(32)
    // prefixSum(i) = 2 * (i + 1); smallest i where 2(i+1) > 15 is 7
    // (prefixSum(7) = 16).
    expect(f.upperBound(15)).toBe(7)
    expect(f.upperBound(31)).toBe(15)
    expect(f.upperBound(32)).toBe(16) // past end
  })
})
