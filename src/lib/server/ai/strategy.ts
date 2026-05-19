/**
 * Pure AI decision functions. No side effects, fully testable.
 *
 * Priority tiers (per game rules):
 *   3 — rows 11–12 (hardest to build; paired sums only, fewer combinations)
 *   2 — rows 7–10  (paired sums, moderate difficulty)
 *   1 — rows 1–6   (single die; all equally easy)
 *
 * Within the same tier: prefer the row where the most pearls can be cleared
 * this roll (maximise progress per turn).
 */

import type { Die } from '$lib/server/repository/types'

export const rowPriority = (row: number): number => {
  if (row >= 11) return 3
  if (row >= 7) return 2
  return 1
}

const clearableThisRoll = (dice: Die[], target: number, remaining: number): number => {
  const combos = chooseDiceForTarget(dice, target).length / (target <= 6 ? 1 : 2)
  return Math.min(combos, remaining)
}

/**
 * Choose the best target from the set of reachable targets given the board
 * state (effective remaining pearls = board − staged).
 */
export const chooseTarget = (
  reachable: Set<number>,
  board: number[],
  staged: number[],
  dice: Die[],
): number => {
  const effective = board.map((count, i) => Math.max(0, count - (staged[i] ?? 0)))
  const sorted = [...reachable].sort((a, b) => {
    const priDiff = rowPriority(b) - rowPriority(a)
    if (priDiff !== 0) return priDiff
    return clearableThisRoll(dice, b, effective[b - 1] ?? 7) - clearableThisRoll(dice, a, effective[a - 1] ?? 7)
  })
  return sorted[0]!
}

/**
 * Return all active die indices that can contribute to forming `target`.
 * For single targets (1–6): every die showing that value.
 * For pair targets (7–12): greedy pair matching, returns even-length array.
 */
export const chooseDiceForTarget = (dice: Die[], target: number): number[] => {
  const active = dice.map((d, i) => ({ d, i })).filter(({ d }) => d.status === 'active')

  if (target <= 6) {
    return active.filter(({ d }) => d.value === target).map(({ i }) => i)
  }

  const pairs: number[] = []
  const used = new Set<number>()
  for (let a = 0; a < active.length; a++) {
    if (used.has(a)) continue
    for (let b = a + 1; b < active.length; b++) {
      if (used.has(b)) continue
      if (active[a]!.d.value + active[b]!.d.value === target) {
        pairs.push(active[a]!.i, active[b]!.i)
        used.add(a)
        used.add(b)
        break
      }
    }
  }
  return pairs
}
