/**
 * Game action service layer.
 *
 * Extracted from API route handlers so both HTTP endpoints and the AI runner
 * can call the same logic without duplication or session dependencies.
 */

import { delay } from 'es-toolkit'

import {
  advanceRound,
  applyRoll,
  createInitiative,
  isRoundComplete,
  isTied,
} from '$lib/server/game/initiative'
import { hasTripleRoll, triggerAiReactions } from '$lib/server/ai/reactions'
import {
  canFormAnyTarget,
  canFormTarget,
  hasPerfectRoll,
  isValidSelection,
} from '$lib/server/game/state'
import { commitAndAdvanceTurn } from '$lib/server/game/turn-flow'
import { publishGameEvent } from '$lib/server/pubsub'
import { gameRepository, initiativeRepository, turnRepository } from '$lib/server/repository'
import type { GameInitiative } from '$lib/server/repository/types'

// ── Roll ──────────────────────────────────────────────────────────────────────

export type RollOutcome =
  | { status: 'choosing'; perfectRoll?: true }
  | { status: 'pending-end' }
  | { status: 'cleared-row' | 'won' | 'completed' }

export const performRoll = async (gameId: string, playerId: string): Promise<RollOutcome> => {
  const turn = await turnRepository.findCurrentForGame(gameId)
  if (!turn || turn.playerId !== playerId) throw new Error('No active turn for player')
  if (turn.status !== 'rolling' && turn.status !== 'locked')
    throw new Error(`Cannot roll while turn is "${turn.status}"`)

  const cupSlots: number[] = []
  for (let i = 0; i < turn.dice.length; i++) {
    if (turn.dice[i].status === 'in_cup') cupSlots.push(i)
  }
  if (cupSlots.length === 0) throw new Error('No dice in cup')

  const randomBytes = new Uint8Array(cupSlots.length)
  crypto.getRandomValues(randomBytes)
  const values = Array.from(randomBytes, (b) => (b % 6) + 1)

  cupSlots.forEach((slot, i) => {
    turn.dice[slot] = { value: values[i]!, status: 'active' }
  })
  turn.rolls.push({ index: turn.rolls.length, values, slots: cupSlots, at: Date.now() })
  turn.status = 'choosing'

  await turnRepository.save(turn)
  await publishGameEvent(gameId, { event: 'turn-rolled', turnId: turn.id })

  const [board, staged] = await gameRepository.getBoardAndStaged(gameId, playerId)

  if (turn.target === null) {
    if (!canFormAnyTarget(turn.dice, board)) {
      turn.status = 'pending-end'
      await turnRepository.save(turn)
      await publishGameEvent(gameId, { event: 'turn-pending-end', turnId: turn.id })
      return { status: 'pending-end' }
    }
  } else {
    const effectiveRemaining = (board[turn.target - 1] ?? 0) - (staged[turn.target - 1] ?? 0)
    if (effectiveRemaining <= 0) {
      const outcome = await commitAndAdvanceTurn(turn, board, staged, 800)
      if (outcome === 'cleared-row') void triggerAiReactions(gameId, playerId, 'cleared-row')
      return { status: outcome }
    }
    if (!canFormTarget(turn.dice, turn.target)) {
      turn.status = 'pending-end'
      await turnRepository.save(turn)
      await publishGameEvent(gameId, { event: 'turn-pending-end', turnId: turn.id })
      return { status: 'pending-end' }
    }
  }

  const perfectRoll = cupSlots.length === 6 && hasPerfectRoll(turn.dice)
  if (perfectRoll) void triggerAiReactions(gameId, playerId, 'perfect-roll')
  if (hasTripleRoll(turn.dice)) void triggerAiReactions(gameId, playerId, 'triple-roll')
  return { status: 'choosing', ...(perfectRoll ? { perfectRoll: true as const } : {}) }
}

// ── Select ────────────────────────────────────────────────────────────────────

const CLEARED_ROW_DELAY_MS = 800

export type SelectOutcome =
  | { status: 'locked' | 'pending-end' }
  | { status: 'cleared-row' | 'won' | 'completed' }

export const performSelect = async (
  gameId: string,
  playerId: string,
  target: number,
  dieIndices: number[],
): Promise<SelectOutcome> => {
  const turn = await turnRepository.findCurrentForGame(gameId)
  if (!turn || turn.playerId !== playerId) throw new Error('No active turn for player')
  if (turn.status !== 'choosing') throw new Error(`Cannot select while turn is "${turn.status}"`)
  if (turn.target !== null && turn.target !== target)
    throw new Error('Target does not match locked target')

  const [board, staged] = await gameRepository.getBoardAndStaged(gameId, playerId)
  const remaining = (board[target - 1] ?? 0) - (staged[target - 1] ?? 0)
  if (remaining <= 0) throw new Error('Target row is empty')
  if (!isValidSelection(turn.dice, target, dieIndices)) throw new Error('Invalid die selection')

  const pearlsToRemove = target <= 6 ? dieIndices.length : dieIndices.length / 2
  const actualPearlsToRemove = Math.min(pearlsToRemove, remaining)

  turn.target = target

  if (target >= 7) {
    const nextPairBase =
      turn.dice.reduce(
        (max, d) => (d.pairId !== undefined && d.pairId > max ? d.pairId : max),
        -1,
      ) + 1
    const used = new Set<number>()
    let pairOffset = 0
    for (let a = 0; a < dieIndices.length && pairOffset < actualPearlsToRemove; a++) {
      if (used.has(a)) continue
      const ia = dieIndices[a]!
      for (let b = a + 1; b < dieIndices.length; b++) {
        if (used.has(b)) continue
        const ib = dieIndices[b]!
        if (turn.dice[ia]!.value + turn.dice[ib]!.value === target) {
          const pid = nextPairBase + pairOffset++
          turn.dice[ia] = { ...turn.dice[ia]!, status: 'spent', pairId: pid }
          turn.dice[ib] = { ...turn.dice[ib]!, status: 'spent', pairId: pid }
          used.add(a)
          used.add(b)
          break
        }
      }
    }
  } else {
    let spent = 0
    for (const i of dieIndices) {
      if (spent >= actualPearlsToRemove) break
      turn.dice[i] = { ...turn.dice[i]!, status: 'spent' }
      spent++
    }
  }

  turn.pearlsRemoved += actualPearlsToRemove
  const newStaged = [...staged]
  newStaged[target - 1] = (newStaged[target - 1] ?? 0) + actualPearlsToRemove
  await gameRepository.setStaged(gameId, playerId, newStaged)

  for (let i = 0; i < turn.dice.length; i++) {
    if (turn.dice[i]!.status === 'active') {
      turn.dice[i] = { value: 0, status: 'in_cup' }
    }
  }

  const anyInCup = turn.dice.some((d) => d.status === 'in_cup')
  const targetRowFullyStaged = newStaged[target - 1]! >= (board[target - 1] ?? 0)

  if (targetRowFullyStaged) {
    await turnRepository.save(turn)
    await publishGameEvent(gameId, { event: 'turn-selected', turnId: turn.id })
    const outcome = await commitAndAdvanceTurn(turn, board, newStaged, CLEARED_ROW_DELAY_MS)
    if (outcome === 'cleared-row') void triggerAiReactions(gameId, playerId, 'cleared-row')
    return { status: outcome }
  }

  if (!anyInCup) {
    for (let i = 0; i < turn.dice.length; i++) {
      turn.dice[i] = { value: 0, status: 'in_cup' }
    }
    turn.status = 'locked'
    await turnRepository.save(turn)
    await publishGameEvent(gameId, { event: 'turn-selected', turnId: turn.id })
    if (target >= 7) void triggerAiReactions(gameId, playerId, 'high-value')
    return { status: 'locked' }
  }

  turn.status = 'locked'
  await turnRepository.save(turn)
  await publishGameEvent(gameId, { event: 'turn-selected', turnId: turn.id })
  if (target >= 7) void triggerAiReactions(gameId, playerId, 'high-value')
  return { status: 'locked' }
}

// ── End Turn ──────────────────────────────────────────────────────────────────

const HANDOVER_DELAY_MS = 1_500

export type EndTurnOutcome = 'won' | 'cleared-row' | 'completed'

export const performEndTurn = async (gameId: string, playerId: string): Promise<EndTurnOutcome> => {
  const turn = await turnRepository.findCurrentForGame(gameId)
  if (!turn || turn.playerId !== playerId) throw new Error('No active turn for player')
  if (turn.status !== 'pending-end') throw new Error(`Cannot end turn with status "${turn.status}"`)

  const [board, staged] = await Promise.all([
    gameRepository.getBoard(gameId, playerId),
    gameRepository.getStaged(gameId, playerId),
  ])

  return commitAndAdvanceTurn(turn, board, staged, HANDOVER_DELAY_MS)
}

// ── Initiative Roll ───────────────────────────────────────────────────────────

export const performInitiativeRoll = async (
  gameId: string,
  playerId: string,
): Promise<GameInitiative> => {
  const game = await gameRepository.findById(gameId)
  if (!game || game.status !== 'waiting') throw new Error('Game not in waiting state')
  if (!game.playerIds.includes(playerId)) throw new Error('Player not in game')

  let initiative = await initiativeRepository.findByGameId(gameId)
  if (!initiative) initiative = createInitiative(game.playerIds)

  if (!initiative.activePlayerIds.includes(playerId)) throw new Error('Not your turn to roll')
  if ((initiative.rolls[playerId]?.value ?? 0) > 0) throw new Error('Already rolled this round')

  const [byte] = crypto.getRandomValues(new Uint8Array(1))
  const value = (byte! % 6) + 1

  let updated = applyRoll(initiative, playerId, value)

  if (isRoundComplete(updated)) {
    if (isTied(updated)) {
      await initiativeRepository.save(gameId, updated)
      await publishGameEvent(gameId, { event: 'refresh' })
      await delay(1_500)
    }
    updated = advanceRound(updated)
  }

  await initiativeRepository.save(gameId, updated)
  await publishGameEvent(gameId, { event: 'refresh' })

  return updated
}
