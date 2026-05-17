/**
 * Integration tests for cleanupRepository.
 * Runs against a real Redis container via testcontainers globalSetup.
 */
import { describe, expect, it } from 'vitest'

import { redis } from '$lib/server/redis'
import { cleanupRepository } from '$lib/server/repository/cleanup'
import { gameRepository } from '$lib/server/repository/game'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000

describe('cleanupRepository.deleteStaleGames', () => {
  it('returns zero when no games exist', async () => {
    const result = await cleanupRepository.deleteStaleGames(SEVEN_DAYS_MS)
    expect(result.deleted).toBe(0)
    expect(result.errors).toBe(0)
  })

  it('does not delete a recently updated game', async () => {
    const game = await gameRepository.create('FRESH01')
    const result = await cleanupRepository.deleteStaleGames(SEVEN_DAYS_MS)
    expect(result.deleted).toBe(0)
    const found = await gameRepository.findById(game.id)
    expect(found).not.toBeNull()
  })

  it('deletes a game whose updatedAt is older than the threshold', async () => {
    const game = await gameRepository.create('STALE01')
    const staleTime = Date.now() - SEVEN_DAYS_MS - 1
    await redis.hSet(`game:${game.id}`, 'updatedAt', String(staleTime))

    const result = await cleanupRepository.deleteStaleGames(SEVEN_DAYS_MS)

    expect(result.deleted).toBe(1)
    expect(result.errors).toBe(0)
    expect(await gameRepository.findById(game.id)).toBeNull()
    expect(await redis.exists(`game:${game.id}:turn-order`)).toBe(0)
    expect(await redis.exists(`invite:STALE01`)).toBe(0)
  })

  it('deletes only stale games when mix of fresh and stale exist', async () => {
    const fresh = await gameRepository.create('FRESH02')
    const stale = await gameRepository.create('STALE02')
    const staleTime = Date.now() - SEVEN_DAYS_MS - 1
    await redis.hSet(`game:${stale.id}`, 'updatedAt', String(staleTime))

    const result = await cleanupRepository.deleteStaleGames(SEVEN_DAYS_MS)

    expect(result.deleted).toBe(1)
    expect(await gameRepository.findById(fresh.id)).not.toBeNull()
    expect(await gameRepository.findById(stale.id)).toBeNull()
  })
})

describe('cleanupRepository.deleteOrphanedSessions', () => {
  it('deletes sessions whose game no longer exists', async () => {
    await redis.hSet('session:orphan-test', {
      id: 'orphan-test',
      gameId: 'nonexistent-game-id',
      playerId: 'player-x',
      createdAt: String(Date.now()),
      updatedAt: String(Date.now()),
    })

    const result = await cleanupRepository.deleteOrphanedSessions()

    expect(result.deleted).toBeGreaterThanOrEqual(1)
    expect(await redis.exists('session:orphan-test')).toBe(0)
  })

  it('keeps sessions whose game still exists', async () => {
    const game = await gameRepository.create('LIVE01')
    await redis.hSet('session:live-test', {
      id: 'live-test',
      gameId: game.id,
      playerId: 'player-y',
      createdAt: String(Date.now()),
      updatedAt: String(Date.now()),
    })

    await cleanupRepository.deleteOrphanedSessions()

    expect(await redis.exists('session:live-test')).toBe(1)
    await redis.del('session:live-test')
  })
})
