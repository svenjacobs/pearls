/**
 * Integration tests for sessionRepository.
 *
 * Runs against a real Redis instance started by the testcontainers globalSetup.
 * Each test starts with a clean database (redis-flush.ts runs FLUSHALL beforeEach).
 */
import { describe, expect, it } from 'vitest'

import { sessionRepository } from '$lib/server/repository/session'

const GAME_ID = 'game-abc'
const PLAYER_ID = 'player-xyz'

describe('sessionRepository', () => {
  // ── create / findById ──────────────────────────────────────────────────────

  it('creates a session and retrieves it by id', async () => {
    const session = await sessionRepository.create(GAME_ID, PLAYER_ID)

    expect(session.id).toBeTruthy()
    expect(session.gameId).toBe(GAME_ID)
    expect(session.playerId).toBe(PLAYER_ID)
    expect(session.createdAt).toBeGreaterThan(0)
    expect(session.updatedAt).toBe(session.createdAt)

    const found = await sessionRepository.findById(session.id)
    expect(found).toMatchObject({
      id: session.id,
      gameId: GAME_ID,
      playerId: PLAYER_ID,
    })
  })

  it('returns null for an unknown id', async () => {
    expect(await sessionRepository.findById('nonexistent')).toBeNull()
  })

  // ── save ───────────────────────────────────────────────────────────────────

  it('persists mutations via save', async () => {
    const session = await sessionRepository.create(GAME_ID, PLAYER_ID)

    session.gameId = 'game-updated'
    await sessionRepository.save(session)

    const found = await sessionRepository.findById(session.id)
    expect(found?.gameId).toBe('game-updated')
    expect(found?.playerId).toBe(PLAYER_ID)
  })

  // ── delete ─────────────────────────────────────────────────────────────────

  it('removes the session on delete', async () => {
    const session = await sessionRepository.create(GAME_ID, PLAYER_ID)
    await sessionRepository.delete(session.id)

    expect(await sessionRepository.findById(session.id)).toBeNull()
  })

  // ── isolation ─────────────────────────────────────────────────────────────

  it('two sessions for different players coexist independently', async () => {
    const s1 = await sessionRepository.create(GAME_ID, 'player-1')
    const s2 = await sessionRepository.create(GAME_ID, 'player-2')

    const found1 = await sessionRepository.findById(s1.id)
    const found2 = await sessionRepository.findById(s2.id)

    expect(found1?.playerId).toBe('player-1')
    expect(found2?.playerId).toBe('player-2')
    expect(found1?.id).not.toBe(found2?.id)
  })
})
