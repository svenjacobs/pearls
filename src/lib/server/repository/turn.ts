import { createId } from '@paralleldrive/cuid2'

import { redis } from '$lib/server/redis'

import { gameRepository } from './game'
import type { Die, Turn, TurnStatus } from './types'

const DICE_COUNT = 6

const key = (id: string) => `turn:${id}`

const inCupDice = (): Die[] =>
  Array.from({ length: DICE_COUNT }, () => ({ value: 0, status: 'in_cup' as const }))

export const turnRepository = {
  /**
   * Creates a fresh turn for the given player, persists it, appends it to the
   * game's turn history, and sets it as the current turn.
   */
  async create(gameId: string, playerId: string, index: number): Promise<Turn> {
    const now = Date.now()
    const turn: Turn = {
      id: createId(),
      gameId,
      playerId,
      index,
      target: null,
      dice: inCupDice(),
      rolls: [],
      pearlsRemoved: 0,
      status: 'rolling',
      createdAt: now,
      updatedAt: now,
    }
    await Promise.all([
      redis.set(key(turn.id), JSON.stringify(turn)),
      gameRepository.appendTurn(gameId, turn.id),
      gameRepository.setCurrentTurn(gameId, turn.id),
    ])
    return turn
  },

  async findById(id: string): Promise<Turn | null> {
    const raw = await redis.get(key(id))
    if (!raw) return null
    return JSON.parse(raw) as Turn
  },

  /** Returns the active turn for a game, or null if no turn is in progress. */
  async findCurrentForGame(gameId: string): Promise<Turn | null> {
    const id = await gameRepository.getCurrentTurnId(gameId)
    if (!id) return null
    return this.findById(id)
  },

  /** Persists an updated turn, refreshing `updatedAt`. */
  async save(turn: Turn): Promise<void> {
    turn.updatedAt = Date.now()
    await redis.set(key(turn.id), JSON.stringify(turn))
  },

  /**
   * Marks a turn as terminated (`bust`, `completed`, or `forfeited`), clears
   * the current-turn pointer, and persists. Caller is responsible for
   * advancing to the next player and creating their turn.
   */
  async end(
    turn: Turn,
    status: Extract<TurnStatus, 'bust' | 'completed' | 'forfeited'>,
  ): Promise<void> {
    turn.status = status
    await this.save(turn)
    await gameRepository.setCurrentTurn(turn.gameId, null)
  },

  async delete(id: string): Promise<void> {
    await redis.del(key(id))
  },
}
