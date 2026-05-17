/**
 * Pure game-state logic: target validity, scoring, win detection.
 *
 * Lives outside the repository layer so the same rules can be reused by the
 * API endpoints, by tests, and (in the future) by a replay engine.
 */

import { MAX_PEARLS, SLOTS } from '$lib/server/game/constants'
import type { Die } from '$lib/server/repository/types'

/** Active die values that the player could still use this roll. */
const activeValues = (dice: Die[]): number[] =>
  dice.filter((d) => d.status === 'active').map((d) => d.value)

/**
 * Returns the set of targets (1–12) that can be formed from the currently
 * active dice and that still have pearls on the board. A target is reachable
 * if a single active die matches (1–6) or two distinct active dice sum to it
 * (7–12).
 */
export const reachableTargets = (dice: Die[], board: number[]): Set<number> => {
  const reachable = new Set<number>()
  const values = activeValues(dice)

  for (let v = 1; v <= 6; v++) {
    if (board[v - 1] > 0 && values.includes(v)) reachable.add(v)
  }
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      const sum = values[i] + values[j]
      if (sum >= 7 && sum <= 12 && board[sum - 1] > 0) reachable.add(sum)
    }
  }
  return reachable
}

/** True if at least one 1–12 target can be formed from the active dice. */
export const canFormAnyTarget = (dice: Die[], board: number[]): boolean =>
  reachableTargets(dice, board).size > 0

/**
 * True if a specific locked target can still be formed from the active dice.
 * Single die for 1–6, pair sum for 7–12.
 */
export const canFormTarget = (dice: Die[], target: number): boolean => {
  const values = activeValues(dice)
  if (target >= 1 && target <= 6) return values.includes(target)
  if (target >= 7 && target <= 12) {
    for (let i = 0; i < values.length; i++) {
      for (let j = i + 1; j < values.length; j++) {
        if (values[i] + values[j] === target) return true
      }
    }
  }
  return false
}

/**
 * Validates a selection of die slot indices against a target. Returns true if
 * the chosen dice are all currently `active` and their values form the target
 * with no leftover dice.
 *
 * - Targets 1–6: every selected die must show the target value; one pearl is
 *   removed per die.
 * - Targets 7–12: an even number of dice must be selected; the full set must
 *   be partitionable into pairs each summing to the target; one pearl is
 *   removed per pair.
 */
export const isValidSelection = (
  dice: Die[],
  target: number,
  dieIndices: readonly number[],
): boolean => {
  if (target < 1 || target > 12) return false
  if (dieIndices.length === 0) return false

  // No duplicate slot indices
  const unique = new Set(dieIndices)
  if (unique.size !== dieIndices.length) return false

  // All chosen dice must be active
  for (const i of dieIndices) {
    if (i < 0 || i >= dice.length) return false
    if (dice[i].status !== 'active') return false
  }

  if (target >= 1 && target <= 6) {
    // All staged dice must show the target value; one pearl removed per die
    return dieIndices.every((i) => dice[i].value === target)
  }

  // Pair target (7–12): must be an even count that partitions into pairs
  // each summing to target, with no leftover dice.
  if (dieIndices.length % 2 !== 0) return false
  const count: number[] = Array(7).fill(0)
  for (const i of dieIndices) {
    const v = dice[i].value
    const comp = target - v
    if (v < 1 || v > 6 || comp < 1 || comp > 6) return false
    count[v]++
  }
  // Check every (v, c) pair once (v < c) and the self-pair (v === c).
  // Do NOT skip when count[v] === 0 — that would miss mismatches like
  // count[2]=0 vs count[5]=2 for target 7.
  for (let v = 1; v <= 6; v++) {
    const c = target - v
    if (c < 1 || c > 6) continue
    if (c === v) {
      if (count[v] % 2 !== 0) return false
    } else if (v < c) {
      if (count[v] !== count[c]) return false
    }
  }
  return true
}

/** True when every row has been cleared — the win condition. */
export const isBoardCleared = (board: number[]): boolean => board.every((c) => c === 0)

/**
 * Computes the score at game end: sum of (slot_number × cleared_pearls) across all 12 slots.
 * Slot numbers are 1-indexed (slot 1 = index 0, …, slot 12 = index 11).
 * Each pearl in slot N is worth N points — higher-numbered rows are harder and reward more.
 * Maximum score: 7 × (1 + 2 + … + 12) = 7 × 78 = 546.
 * Higher is better.
 */
export const computeScore = (board: number[]): number => {
  let score = 0
  for (let i = 0; i < SLOTS; i++) score += (i + 1) * (MAX_PEARLS - (board[i] ?? 0))
  return score
}

/**
 * True when all 6 dice are active and every die can be consumed in a single
 * selection:
 * - all dice show the same face value (6 singles for slot 1–6), OR
 * - the 6 dice form 3 pairs each summing to the same target (7–12).
 *
 * Only meaningful when cupSlots.length === 6 at roll time (caller's responsibility).
 */
export const hasPerfectRoll = (dice: Die[]): boolean => {
  const active = dice.filter((d) => d.status === 'active')
  if (active.length !== 6) return false
  const values = active.map((d) => d.value)

  if (values.every((v) => v === values[0])) return true

  for (let s = 7; s <= 12; s++) {
    const count: number[] = Array(7).fill(0)
    let valid = true
    for (const v of values) {
      const comp = s - v
      if (v < 1 || v > 6 || comp < 1 || comp > 6) {
        valid = false
        break
      }
      count[v]++
    }
    if (!valid) continue
    let balanced = true
    for (let v = 1; v <= 6; v++) {
      const c = s - v
      if (c < 1 || c > 6) continue
      if (c === v) {
        if (count[v] % 2 !== 0) {
          balanced = false
          break
        }
      } else if (v < c) {
        if (count[v] !== count[c]) {
          balanced = false
          break
        }
      }
    }
    if (balanced) return true
  }

  return false
}
