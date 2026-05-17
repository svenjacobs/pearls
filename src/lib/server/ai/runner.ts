/**
 * AI turn runner. Drives AI players through their turns by calling the same
 * service functions that human API routes use. No game logic lives here —
 * only orchestration, delays, and error handling.
 */

import { delay, randomInt } from 'es-toolkit'

import { chooseDiceForTarget, chooseTarget } from '$lib/server/ai/strategy'
import {
  performEndTurn,
  performInitiativeRoll,
  performRoll,
  performSelect,
} from '$lib/server/game/service'
import { reachableTargets } from '$lib/server/game/state'
import { gameRepository, playerRepository, turnRepository } from '$lib/server/repository'
import type { GameInitiative } from '$lib/server/repository/types'

// ── Timing constants ──────────────────────────────────────────────────────────

/** Global multiplier — increase to slow down AI, decrease to speed up. */
const DELAY_MULTIPLIER = 1

/** Delay before rolling dice (ms). */
const ROLL_DELAY_MIN = 800
const ROLL_DELAY_MAX = 1_600

/** Delay before selecting dice / choosing a target (ms). */
const SELECT_DELAY_MIN = 2_000
const SELECT_DELAY_MAX = 3_000

/** Delay before ending a busted turn (ms). */
const END_TURN_DELAY_MIN = 800
const END_TURN_DELAY_MAX = 1_600

/** Delay before rolling the initiative die (ms). */
const INITIATIVE_DELAY_MIN = 1_000
const INITIATIVE_DELAY_MAX = 2_200

const aiDelay = (min: number, max: number) =>
  delay(randomInt(min * DELAY_MULTIPLIER, max * DELAY_MULTIPLIER))

// Per-game-player flag to prevent concurrent runners.
const active = new Map<string, boolean>()
const lock = (gameId: string, playerId: string) => `${gameId}:${playerId}`

// ── Turn runner ───────────────────────────────────────────────────────────────

const runAiTurn = async (gameId: string, playerId: string): Promise<void> => {
  for (let safety = 0; safety < 50; safety++) {
    const turn = await turnRepository.findCurrentForGame(gameId)
    if (!turn || turn.playerId !== playerId) return
    if (turn.status === 'completed' || turn.status === 'bust' || turn.status === 'forfeited') return

    if (turn.status === 'rolling' || turn.status === 'locked') {
      await aiDelay(ROLL_DELAY_MIN, ROLL_DELAY_MAX)
      const rollResult = await performRoll(gameId, playerId)

      if (rollResult.status === 'pending-end') {
        await aiDelay(END_TURN_DELAY_MIN, END_TURN_DELAY_MAX)
        await performEndTurn(gameId, playerId)
        return
      }
      if (rollResult.status === 'cleared-row') {
        return
      }
      if (rollResult.status !== 'choosing') return // won / completed
      continue
    }

    if (turn.status === 'choosing') {
      const [board, staged] = await gameRepository.getBoardAndStaged(gameId, playerId)

      // When a target is already locked, use it directly — calling chooseTarget
      // would pick from all reachable targets and likely return a different one,
      // causing performSelect to throw "Target does not match locked target".
      let target: number
      if (turn.target !== null) {
        target = turn.target
      } else {
        const targets = reachableTargets(turn.dice, board)
        if (targets.size === 0) return
        target = chooseTarget(targets, board, staged)
      }

      const dieIndices = chooseDiceForTarget(turn.dice, target)
      if (dieIndices.length === 0) return

      await aiDelay(SELECT_DELAY_MIN, SELECT_DELAY_MAX)
      const selectResult = await performSelect(gameId, playerId, target, dieIndices)

      if (selectResult.status === 'cleared-row') {
        return
      }
      if (selectResult.status === 'won' || selectResult.status === 'completed') return

      // 'locked' or 'pending-end' → loop continues
      continue
    }

    if (turn.status === 'pending-end') {
      await aiDelay(END_TURN_DELAY_MIN, END_TURN_DELAY_MAX)
      await performEndTurn(gameId, playerId)
      return
    }

    return
  }
}

export const scheduleAiTurn = (gameId: string, playerId: string): void => {
  const key = lock(gameId, playerId)
  if (active.get(key)) return
  active.set(key, true)
  void (async () => {
    try {
      await runAiTurn(gameId, playerId)
    } catch {
      // Non-fatal: turn will be cleaned up by game logic or next trigger.
    } finally {
      active.delete(key)
    }
  })()
}

// ── Initiative runner ─────────────────────────────────────────────────────────

const runAiInitiativeRoll = async (gameId: string, playerId: string): Promise<void> => {
  await aiDelay(INITIATIVE_DELAY_MIN, INITIATIVE_DELAY_MAX)
  try {
    const updated = await performInitiativeRoll(gameId, playerId)
    // Cascade: if more AI players need to roll in the next round, trigger them.
    void triggerAiInitiativeIfNeeded(gameId, updated)
  } catch {
    // Race condition (already rolled, or round advanced) — ignore.
  }
}

export const triggerAiInitiativeIfNeeded = async (
  gameId: string,
  initiative: GameInitiative,
): Promise<void> => {
  if (!initiative.activePlayerIds.length) return

  const players = await playerRepository.findManyByIds(initiative.activePlayerIds)
  for (const player of players) {
    if (!player?.isAI) continue
    const alreadyRolled = (initiative.rolls[player.id]?.value ?? 0) > 0
    if (alreadyRolled) continue
    const key = lock(gameId, player.id)
    if (active.get(key)) continue
    active.set(key, true)
    void (async () => {
      try {
        await runAiInitiativeRoll(gameId, player.id)
      } finally {
        active.delete(key)
      }
    })()
  }
}

// ── Game turn hook ────────────────────────────────────────────────────────────

/** Called from turn-flow.ts after a new turn is created. */
export const triggerAiIfNeeded = async (gameId: string, playerId: string): Promise<void> => {
  const player = await playerRepository.findById(playerId)
  if (player?.isAI) scheduleAiTurn(gameId, playerId)
}
