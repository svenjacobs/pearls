import { describe, expect, it } from 'vitest'

import type { Die } from '$lib/server/repository/types'

import { chooseDiceForTarget, chooseTarget, rowPriority } from './strategy'

const active = (value: number): Die => ({ value, status: 'active' })
const inCup = (): Die => ({ value: 0, status: 'in_cup' })

describe('rowPriority', () => {
  it('gives priority 3 to rows 11 and 12', () => {
    expect(rowPriority(11)).toBe(3)
    expect(rowPriority(12)).toBe(3)
  })
  it('gives priority 2 to rows 7–10', () => {
    for (const r of [7, 8, 9, 10]) expect(rowPriority(r)).toBe(2)
  })
  it('gives priority 1 to rows 1–6', () => {
    for (const r of [1, 2, 3, 4, 5, 6]) expect(rowPriority(r)).toBe(1)
  })
})

describe('chooseTarget', () => {
  const board = Array(12).fill(7)
  const staged = Array(12).fill(0)
  const noDice: Die[] = []

  it('prefers row 12 over row 7 over row 3', () => {
    const reachable = new Set([3, 7, 12])
    expect(chooseTarget(reachable, board, staged, noDice)).toBe(12)
  })

  it('prefers row 11 over row 10', () => {
    const reachable = new Set([10, 11])
    expect(chooseTarget(reachable, board, staged, noDice)).toBe(11)
  })

  it('within same priority tier prefers the row where most pearls can be cleared this roll', () => {
    const b = Array(12).fill(7)
    b[10] = 5 // row 11 has 5 pearls
    b[11] = 5 // row 12 has 5 pearls
    // [6,6,6,5,6]: row 12 gets (6+6),(6+6) = 2 pairs; row 11 gets only (6+5) = 1 pair
    const dice: Die[] = [active(6), active(6), active(6), active(5), active(6)]
    const reachable = new Set([11, 12])
    expect(chooseTarget(reachable, b, staged, dice)).toBe(12)
  })

  it('within row 1–6 tier prefers row where most pearls can be cleared this roll', () => {
    const b = Array(12).fill(7)
    // dice: three 3s and one 6 → row 3 clears 3, row 6 clears 1
    const dice: Die[] = [active(3), active(3), active(3), active(6)]
    const reachable = new Set([3, 6])
    expect(chooseTarget(reachable, b, staged, dice)).toBe(3)
  })

  it('prefers most clearable even when the other row has fewer pearls remaining', () => {
    // row 1: 1 pearl left, roll has one 1 → clears 1
    // row 4: 7 pearls left, roll has three 4s → clears 3
    // same priority tier (1–6); should prefer row 4 despite row 1 being nearly done
    const b = Array(12).fill(7)
    b[0] = 1 // row 1 has 1 pearl
    const dice: Die[] = [active(1), active(4), active(4), active(4), active(3), active(2)]
    const reachable = new Set([1, 4])
    expect(chooseTarget(reachable, b, staged, dice)).toBe(4)
  })
})

describe('chooseDiceForTarget', () => {
  it('selects all dice matching a single target', () => {
    const dice: Die[] = [active(4), active(2), active(4), inCup()]
    expect(chooseDiceForTarget(dice, 4)).toEqual([0, 2])
  })

  it('returns empty array when no dice match single target', () => {
    const dice: Die[] = [active(3), active(5)]
    expect(chooseDiceForTarget(dice, 4)).toEqual([])
  })

  it('finds one pair for a pair target', () => {
    const dice: Die[] = [active(3), active(4), active(1)]
    const result = chooseDiceForTarget(dice, 7)
    expect(result).toHaveLength(2)
    expect(result).toContain(0) // 3
    expect(result).toContain(1) // 4
  })

  it('finds two pairs when available', () => {
    const dice: Die[] = [active(5), active(5), active(3), active(7)]
    // Two pairs summing to 10: (5+5) and (3+7)
    const result = chooseDiceForTarget(dice, 10)
    expect(result).toHaveLength(4)
  })

  it('returns even-length array only (no partial pairs)', () => {
    const dice: Die[] = [active(6), active(4), active(2)] // only (6+4)=10 pair; 2 is unpaired
    const result = chooseDiceForTarget(dice, 10)
    expect(result.length % 2).toBe(0)
    expect(result).toHaveLength(2)
  })
})
