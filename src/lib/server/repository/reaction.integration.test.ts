/**
 * Integration tests for reactionRepository.
 *
 * Runs against a real Redis instance started by the testcontainers globalSetup.
 * Each test starts with a clean database (redis-flush.ts runs FLUSHALL beforeEach).
 */
import { describe, expect, it } from 'vitest'

import { REACTION_THROTTLE_MS } from '$lib/server/game/constants'
import { reactionRepository } from '$lib/server/repository/reaction'

const GAME_ID = 'game-test'
const PLAYER_A = 'player-a'
const PLAYER_B = 'player-b'

describe('reactionRepository', () => {
  // ── add / listSince ───────────────────────────────────────────────────────

  it('adds a reaction and retrieves it via listSince', async () => {
    const before = Date.now()
    const reaction = await reactionRepository.add(GAME_ID, PLAYER_A, 'smile')

    expect(reaction.id).toBeTruthy()
    expect(reaction.gameId).toBe(GAME_ID)
    expect(reaction.playerId).toBe(PLAYER_A)
    expect(reaction.type).toBe('smile')
    expect(reaction.emoji).toBe('🙂')
    expect(reaction.at).toBeGreaterThanOrEqual(before)

    const results = await reactionRepository.listSince(GAME_ID, before)
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ id: reaction.id, type: 'smile', emoji: '🙂' })
  })

  it('listSince returns reactions in chronological order', async () => {
    const since = Date.now()
    const r1 = await reactionRepository.add(GAME_ID, PLAYER_A, 'smile')
    await new Promise((r) => setTimeout(r, 2))
    const r2 = await reactionRepository.add(GAME_ID, PLAYER_B, 'tada')
    await new Promise((r) => setTimeout(r, 2))
    const r3 = await reactionRepository.add(GAME_ID, PLAYER_A, 'clap')

    const results = await reactionRepository.listSince(GAME_ID, since)
    expect(results).toHaveLength(3)
    expect(results.map((r) => r.id)).toEqual([r1.id, r2.id, r3.id])
  })

  it('listSince excludes reactions before the given timestamp', async () => {
    await reactionRepository.add(GAME_ID, PLAYER_A, 'smile')
    await new Promise((r) => setTimeout(r, 10))
    const cutoff = Date.now()
    const r2 = await reactionRepository.add(GAME_ID, PLAYER_B, 'tada')

    const results = await reactionRepository.listSince(GAME_ID, cutoff)
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe(r2.id)
  })

  it('listSince returns an empty array when there are no reactions', async () => {
    const results = await reactionRepository.listSince(GAME_ID, Date.now())
    expect(results).toEqual([])
  })

  it('reactions from different games are isolated', async () => {
    const since = Date.now()
    await reactionRepository.add(GAME_ID, PLAYER_A, 'smile')
    await reactionRepository.add('other-game', PLAYER_A, 'frown')

    const results = await reactionRepository.listSince(GAME_ID, since)
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('smile')
  })

  // ── throttle ─────────────────────────────────────────────────────────────

  it('isThrottled returns false before any setThrottle call', async () => {
    expect(await reactionRepository.isThrottled(GAME_ID, PLAYER_A)).toBe(false)
  })

  it('isThrottled returns true immediately after setThrottle', async () => {
    const acquired = await reactionRepository.setThrottle(GAME_ID, PLAYER_A)
    expect(acquired).toBe(true)
    expect(await reactionRepository.isThrottled(GAME_ID, PLAYER_A)).toBe(true)
  })

  it('throttle is scoped per player — different players are independent', async () => {
    await reactionRepository.setThrottle(GAME_ID, PLAYER_A)
    expect(await reactionRepository.isThrottled(GAME_ID, PLAYER_B)).toBe(false)
  })

  it('throttle is scoped per game — same player in different games is independent', async () => {
    await reactionRepository.setThrottle(GAME_ID, PLAYER_A)
    expect(await reactionRepository.isThrottled('other-game', PLAYER_A)).toBe(false)
  })

  it('second setThrottle within window does not extend the window (NX semantics)', async () => {
    // Set throttle, wait half the window, call setThrottle again.
    // The key should still expire at the original time (NX means no-overwrite).
    const first = await reactionRepository.setThrottle(GAME_ID, PLAYER_A)
    expect(first).toBe(true)
    await new Promise((r) => setTimeout(r, 100))
    const second = await reactionRepository.setThrottle(GAME_ID, PLAYER_A) // no-op due to NX
    expect(second).toBe(false)
    // The key should still exist immediately after
    expect(await reactionRepository.isThrottled(GAME_ID, PLAYER_A)).toBe(true)
  })

  it(`throttle expires after approximately ${REACTION_THROTTLE_MS} ms`, async () => {
    // This test relies on a short TTL. We override indirectly by using a very
    // short wait — REACTION_THROTTLE_MS is 1000 ms in production but since we
    // cannot change the constant here, we just verify the key exists after set
    // and would expire eventually. Actual expiry is covered by contract of Redis
    // SET EX; we trust Redis TTL semantics and only verify the constant is applied.
    await reactionRepository.setThrottle(GAME_ID, PLAYER_A)
    expect(await reactionRepository.isThrottled(GAME_ID, PLAYER_A)).toBe(true)
    // Verify the TTL is set (> 0 means expiring key; Redis returns -1 for no TTL).
    // We import redis directly to check the TTL field.
    const { redis } = await import('$lib/server/redis')
    const ttl = await redis.ttl(`reaction-throttle:${GAME_ID}:${PLAYER_A}`)
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(Math.ceil(REACTION_THROTTLE_MS / 1_000))
  })
})
