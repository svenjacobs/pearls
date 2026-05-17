import { describe, expect, it } from 'vitest'

import type { Die } from '$lib/server/repository/types'

import {
  canFormAnyTarget,
  canFormTarget,
  computeScore,
  hasPerfectRoll,
  isBoardCleared,
  isValidSelection,
  reachableTargets,
} from './state'

const fullBoard = Array<number>(12).fill(7)
const emptyBoard = Array<number>(12).fill(0)

const dice = (...values: (number | null)[]): Die[] =>
  values.map((v) =>
    v === null
      ? ({ value: 0, status: 'spent' } satisfies Die)
      : ({ value: v, status: 'active' } satisfies Die),
  )

describe('reachableTargets', () => {
  it('includes single-die targets 1–6 when matching values are present', () => {
    const result = reachableTargets(dice(1, 3, 5, 6, 6, 2), fullBoard)
    expect(result.has(1)).toBe(true)
    expect(result.has(2)).toBe(true)
    expect(result.has(3)).toBe(true)
    expect(result.has(5)).toBe(true)
    expect(result.has(6)).toBe(true)
    expect(result.has(4)).toBe(false)
  })

  it('includes pair-sum targets 7–12', () => {
    const result = reachableTargets(dice(3, 4, 5, 6, 6, 6), fullBoard)
    expect(result.has(7)).toBe(true) // 3+4
    expect(result.has(9)).toBe(true) // 3+6 / 4+5
    expect(result.has(12)).toBe(true) // 6+6
  })

  it('excludes targets whose row is already cleared', () => {
    const board = [...fullBoard]
    board[3] = 0 // row 4 cleared
    const result = reachableTargets(dice(2, 2, 5, 5, 5, 5), board)
    expect(result.has(4)).toBe(false) // single 2+2 doesn't reach row 4, but pair sums only score 7–12
    expect(result.has(7)).toBe(true) // 2+5
    expect(result.has(10)).toBe(true) // 5+5
  })

  it('ignores spent dice', () => {
    const result = reachableTargets(dice(null, null, null, null, null, 4), fullBoard)
    expect(result.has(4)).toBe(true)
    expect(result.has(8)).toBe(false) // only one active die
  })
})

describe('canFormAnyTarget', () => {
  it('is true when at least one target is reachable', () => {
    expect(canFormAnyTarget(dice(1, 2, 3, 4, 5, 6), fullBoard)).toBe(true)
  })

  it('is false on an empty board', () => {
    expect(canFormAnyTarget(dice(1, 2, 3, 4, 5, 6), emptyBoard)).toBe(false)
  })
})

describe('canFormTarget', () => {
  it('accepts a single matching die for 1–6', () => {
    expect(canFormTarget(dice(2, 5), 5)).toBe(true)
    expect(canFormTarget(dice(2, 3), 5)).toBe(false)
  })

  it('accepts a sum pair for 7–12', () => {
    expect(canFormTarget(dice(3, 4), 7)).toBe(true)
    expect(canFormTarget(dice(6, 6), 12)).toBe(true)
    expect(canFormTarget(dice(1, 2), 7)).toBe(false)
  })
})

describe('isValidSelection', () => {
  it('accepts a single die for target 1–6', () => {
    expect(isValidSelection(dice(4, 2, 3), 4, [0])).toBe(true)
    expect(isValidSelection(dice(4, 2, 3), 3, [0])).toBe(false)
  })

  it('accepts multiple dice showing the same value for target 1–6', () => {
    expect(isValidSelection(dice(4, 4, 4), 4, [0, 1, 2])).toBe(true)
    expect(isValidSelection(dice(4, 4, 3), 4, [0, 1, 2])).toBe(false) // 3 doesn't match
  })

  it('accepts a pair for target 7–12', () => {
    expect(isValidSelection(dice(4, 3, 5), 7, [0, 1])).toBe(true)
    expect(isValidSelection(dice(4, 3, 5), 9, [0, 2])).toBe(true)
  })

  it('accepts multiple complete pairs for target 7–12', () => {
    expect(isValidSelection(dice(3, 4, 3, 4), 7, [0, 1, 2, 3])).toBe(true)
    expect(isValidSelection(dice(4, 4, 4, 4), 8, [0, 1, 2, 3])).toBe(true)
    // three dice (odd) for a pair target is always invalid
    expect(isValidSelection(dice(3, 4, 3), 7, [0, 1, 2])).toBe(false)
  })

  it('rejects a set with leftover dice for pair target', () => {
    // [2, 4, 4]: the 2 cannot pair to form 8 with any other die
    expect(isValidSelection(dice(2, 4, 4), 8, [0, 1, 2])).toBe(false)
    // [5, 5] cannot form target 7 (needs a 2, not a 5)
    expect(isValidSelection(dice(5, 5), 7, [0, 1])).toBe(false)
    // [5, 5] cannot form target 8 (needs 3+5, but both are 5)
    expect(isValidSelection(dice(5, 5), 8, [0, 1])).toBe(false)
    // [5, 5] can form target 10 (5+5)
    expect(isValidSelection(dice(5, 5), 10, [0, 1])).toBe(true)
  })

  it('rejects a single die for 7–12', () => {
    expect(isValidSelection(dice(7, 3), 7, [0])).toBe(false)
  })

  it('rejects a pair for 1–6', () => {
    expect(isValidSelection(dice(1, 2), 3, [0, 1])).toBe(false)
  })

  it('rejects out-of-range indices', () => {
    expect(isValidSelection(dice(4), 4, [99])).toBe(false)
    expect(isValidSelection(dice(4), 4, [-1])).toBe(false)
  })

  it('rejects spent dice', () => {
    expect(isValidSelection(dice(null, 4), 4, [0])).toBe(false)
  })

  it('rejects duplicate indices', () => {
    expect(isValidSelection(dice(2, 2), 4, [0, 0])).toBe(false)
  })

  it('rejects empty selection', () => {
    expect(isValidSelection(dice(4), 4, [])).toBe(false)
  })
})

describe('isBoardCleared', () => {
  it('is true only when all rows are empty', () => {
    expect(isBoardCleared(emptyBoard)).toBe(true)
    expect(isBoardCleared(fullBoard)).toBe(false)
    const almost = [...emptyBoard]
    almost[11] = 1
    expect(isBoardCleared(almost)).toBe(false)
  })
})

describe('computeScore', () => {
  it('is 546 for a fully cleared board', () => {
    expect(computeScore(emptyBoard)).toBe(546)
  })

  it('is 0 for a full board with no pearls cleared', () => {
    expect(computeScore(fullBoard)).toBe(0)
  })

  it('weights cleared pearls by their row number', () => {
    // row 10 (index 9): 6 cleared (1 remaining) → 10 × 6 = 60
    // row 5  (index 4): 5 cleared (2 remaining) →  5 × 5 = 25
    // all other rows: 0 cleared → 0; total 85
    const board = Array<number>(12).fill(7)
    board[9] = 1
    board[4] = 2
    expect(computeScore(board)).toBe(85)
  })
})

describe('hasPerfectRoll', () => {
  it('returns false when fewer than 6 dice are active', () => {
    expect(hasPerfectRoll(dice(3, 3, 3, 3, 3, null))).toBe(false)
  })

  it('returns false when no dice are provided', () => {
    expect(hasPerfectRoll([])).toBe(false)
  })

  it('returns true when all 6 dice show the same value', () => {
    expect(hasPerfectRoll(dice(3, 3, 3, 3, 3, 3))).toBe(true)
    expect(hasPerfectRoll(dice(1, 1, 1, 1, 1, 1))).toBe(true)
    expect(hasPerfectRoll(dice(6, 6, 6, 6, 6, 6))).toBe(true)
  })

  it('returns true when 6 dice form 3 equal-sum pairs (target 7–12)', () => {
    // three 3+4=7 pairs
    expect(hasPerfectRoll(dice(3, 4, 3, 4, 3, 4))).toBe(true)
    // three 5+6=11 pairs
    expect(hasPerfectRoll(dice(5, 6, 5, 6, 5, 6))).toBe(true)
    // mixed pairs all summing to 8: 3+5, 3+5, 4+4
    expect(hasPerfectRoll(dice(3, 5, 3, 5, 4, 4))).toBe(true)
    // 1+6=7, 2+5=7, 3+4=7 — three distinct pairs all summing to 7
    expect(hasPerfectRoll(dice(1, 2, 3, 4, 5, 6))).toBe(true)
  })

  it('returns false when dice are mixed and cannot form equal-sum pairs 7–12', () => {
    // pairs only sum to 6 (not in 7–12)
    expect(hasPerfectRoll(dice(2, 4, 2, 4, 3, 3))).toBe(false)
    // last die breaks the pairing
    expect(hasPerfectRoll(dice(3, 4, 3, 4, 3, 5))).toBe(false)
    // duplicate 1 makes balancing impossible for any target 7–12
    expect(hasPerfectRoll(dice(1, 1, 2, 4, 5, 6))).toBe(false)
  })
})
