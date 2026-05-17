/**
 * Pure initiative logic: determines playing order via a dice-off before the
 * game starts. Players roll one die per round; ties for the highest value
 * prompt a re-roll among those tied players. Rank is determined by
 * (last-round, die-value) descending on both axes.
 */

import type { GameInitiative, InitiativeRollState } from '$lib/server/repository/types'

/** Creates a fresh initiative state for the given set of players (round 1). */
export const createInitiative = (playerIds: string[]): GameInitiative => {
  const rolls: Record<string, InitiativeRollState> = {}
  for (const id of playerIds) {
    rolls[id] = { value: 0, round: 1, locked: false }
  }
  return { round: 1, rolls, activePlayerIds: [...playerIds], playerOrder: null }
}

/** Records a player's die roll for the current round. */
export const applyRoll = (
  initiative: GameInitiative,
  playerId: string,
  value: number,
): GameInitiative => ({
  ...initiative,
  rolls: {
    ...initiative.rolls,
    [playerId]: { ...initiative.rolls[playerId]!, value, round: initiative.round },
  },
})

/** True when every active player has rolled in the current round. */
export const isRoundComplete = (initiative: GameInitiative): boolean =>
  initiative.activePlayerIds.every((id) => (initiative.rolls[id]?.value ?? 0) > 0)

/** True when all active players in a completed round share the same (max) value. */
export const isTied = (initiative: GameInitiative): boolean => {
  const values = initiative.activePlayerIds.map((id) => initiative.rolls[id]!.value)
  const max = Math.max(...values)
  return values.filter((v) => v === max).length > 1
}

/**
 * Sorts all players by (round desc, value desc). Players who survived to later
 * rounds always rank above those locked in earlier rounds; within the same
 * round, higher value wins.
 */
export const computePlayerOrder = (rolls: Record<string, InitiativeRollState>): string[] =>
  Object.entries(rolls)
    .sort(([, a], [, b]) => b.round - a.round || b.value - a.value)
    .map(([id]) => id)

/**
 * Advances initiative after a round completes:
 * - Finds the max value among active players.
 * - If unique winner (or single player): locks everyone, sets playerOrder.
 * - If tied: locks non-winners, resets winners for the next round.
 */
export const advanceRound = (initiative: GameInitiative): GameInitiative => {
  const activeRolls = initiative.activePlayerIds.map((id) => ({
    id,
    state: initiative.rolls[id]!,
  }))

  const maxValue = Math.max(...activeRolls.map(({ state }) => state.value))
  const winners = activeRolls.filter(({ state }) => state.value === maxValue)

  const updatedRolls = { ...initiative.rolls }

  if (winners.length <= 1) {
    for (const { id, state } of activeRolls) {
      updatedRolls[id] = { ...state, locked: true }
    }
    return {
      ...initiative,
      rolls: updatedRolls,
      activePlayerIds: [],
      playerOrder: computePlayerOrder(updatedRolls),
    }
  }

  const nextRound = initiative.round + 1
  for (const { id, state } of activeRolls) {
    if (state.value === maxValue) {
      updatedRolls[id] = { ...state, value: 0 }
    } else {
      updatedRolls[id] = { ...state, locked: true }
    }
  }

  return {
    ...initiative,
    round: nextRound,
    rolls: updatedRolls,
    activePlayerIds: winners.map(({ id }) => id),
    playerOrder: null,
  }
}

/** True when all positions have been determined. */
export const isComplete = (initiative: GameInitiative): boolean => initiative.playerOrder !== null
