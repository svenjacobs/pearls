/**
 * Integration tests for turnRepository.
 *
 * Runs against a real Redis instance started by the testcontainers globalSetup.
 * Each test starts with a clean database (redis-flush.ts runs FLUSHALL beforeEach).
 */
import { describe, expect, it } from 'vitest'

import { gameRepository } from '$lib/server/repository/game'
import { turnRepository } from '$lib/server/repository/turn'

const INVITE_CODE = 'TURNTEST'
const PLAYER_ID = 'player-x'

/** Creates a game with one player and returns its id. */
const setupGame = async (): Promise<string> => {
  const game = await gameRepository.create(INVITE_CODE)
  await gameRepository.addPlayer(game.id, PLAYER_ID)
  return game.id
}

describe('turnRepository', () => {
  // ── create / findById ─────────────────────────────────────────────────────

  it('creates a turn and retrieves it by id', async () => {
    const gameId = await setupGame()
    const turn = await turnRepository.create(gameId, PLAYER_ID, 0)

    expect(turn.id).toBeTruthy()
    expect(turn.gameId).toBe(gameId)
    expect(turn.playerId).toBe(PLAYER_ID)
    expect(turn.index).toBe(0)
    expect(turn.status).toBe('rolling')
    expect(turn.target).toBeNull()
    expect(turn.dice).toHaveLength(6)
    expect(turn.pearlsRemoved).toBe(0)

    const found = await turnRepository.findById(turn.id)
    expect(found).toMatchObject({ id: turn.id, status: 'rolling' })
  })

  it('returns null for an unknown turn id', async () => {
    expect(await turnRepository.findById('nonexistent')).toBeNull()
  })

  // ── findCurrentForGame ────────────────────────────────────────────────────

  it('finds the active turn via the current-turn pointer', async () => {
    const gameId = await setupGame()
    const turn = await turnRepository.create(gameId, PLAYER_ID, 0)

    const current = await turnRepository.findCurrentForGame(gameId)
    expect(current?.id).toBe(turn.id)
  })

  it('returns null when no active turn exists', async () => {
    const gameId = await setupGame()
    expect(await turnRepository.findCurrentForGame(gameId)).toBeNull()
  })

  // ── save ──────────────────────────────────────────────────────────────────

  it('persists turn mutations via save', async () => {
    const gameId = await setupGame()
    const turn = await turnRepository.create(gameId, PLAYER_ID, 0)

    turn.target = 7
    turn.pearlsRemoved = 2
    await turnRepository.save(turn)

    const found = await turnRepository.findById(turn.id)
    expect(found?.target).toBe(7)
    expect(found?.pearlsRemoved).toBe(2)
  })

  // ── end (bust / completed / forfeited) ───────────────────────────────────

  it.each([['bust' as const], ['completed' as const], ['forfeited' as const]])(
    'ends a turn with status "%s" and clears the current-turn pointer',
    async ([status]) => {
      const gameId = await setupGame()
      const turn = await turnRepository.create(gameId, PLAYER_ID, 0)

      await turnRepository.end(turn, status as 'bust' | 'completed' | 'forfeited')

      const found = await turnRepository.findById(turn.id)
      expect(found?.status).toBe(status)

      // Current-turn pointer must be cleared.
      expect(await turnRepository.findCurrentForGame(gameId)).toBeNull()
    },
  )

  // ── turn history ──────────────────────────────────────────────────────────

  it('appends consecutive turns to game turn history', async () => {
    const gameId = await setupGame()
    const t0 = await turnRepository.create(gameId, PLAYER_ID, 0)
    await turnRepository.end(t0, 'completed')
    const t1 = await turnRepository.create(gameId, PLAYER_ID, 1)

    const ids = await gameRepository.listTurnIds(gameId)
    expect(ids).toEqual([t0.id, t1.id])
  })
})
