/**
 * Integration tests for pushSubscriptionRepository.
 *
 * Runs against a real Redis instance started by the testcontainers globalSetup.
 * Each test starts with a clean database (redis-flush.ts runs FLUSHALL beforeEach).
 */
import { describe, expect, it } from 'vitest'

import type { PushSubscriptionJSON } from '$lib/server/push/types'
import { pushSubscriptionRepository } from '$lib/server/repository/push-subscription'

const PLAYER_A = 'player-a'
const PLAYER_B = 'player-b'

const makeSub = (endpoint: string): PushSubscriptionJSON => ({
  endpoint,
  expirationTime: null,
  keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
})

describe('pushSubscriptionRepository', () => {
  // ── findAll ────────────────────────────────────────────────────────────────

  it('returns empty array when player has no subscriptions', async () => {
    expect(await pushSubscriptionRepository.findAll(PLAYER_A)).toEqual([])
  })

  // ── add / findAll ──────────────────────────────────────────────────────────

  it('stores and retrieves a subscription', async () => {
    const sub = makeSub('https://push.example.com/sub-1')
    await pushSubscriptionRepository.add(PLAYER_A, sub)

    const result = await pushSubscriptionRepository.findAll(PLAYER_A)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject(sub)
  })

  it('stores multiple subscriptions for the same player', async () => {
    await pushSubscriptionRepository.add(PLAYER_A, makeSub('https://push.example.com/sub-1'))
    await pushSubscriptionRepository.add(PLAYER_A, makeSub('https://push.example.com/sub-2'))

    const result = await pushSubscriptionRepository.findAll(PLAYER_A)
    expect(result).toHaveLength(2)
    const endpoints = result.map((s) => s.endpoint)
    expect(endpoints).toContain('https://push.example.com/sub-1')
    expect(endpoints).toContain('https://push.example.com/sub-2')
  })

  it('adding the same subscription twice is idempotent (set semantics)', async () => {
    const sub = makeSub('https://push.example.com/sub-1')
    await pushSubscriptionRepository.add(PLAYER_A, sub)
    await pushSubscriptionRepository.add(PLAYER_A, sub)

    expect(await pushSubscriptionRepository.findAll(PLAYER_A)).toHaveLength(1)
  })

  it('isolates subscriptions between players', async () => {
    await pushSubscriptionRepository.add(PLAYER_A, makeSub('https://push.example.com/sub-a'))
    await pushSubscriptionRepository.add(PLAYER_B, makeSub('https://push.example.com/sub-b'))

    const aResult = await pushSubscriptionRepository.findAll(PLAYER_A)
    const bResult = await pushSubscriptionRepository.findAll(PLAYER_B)

    expect(aResult).toHaveLength(1)
    expect(aResult[0].endpoint).toBe('https://push.example.com/sub-a')
    expect(bResult).toHaveLength(1)
    expect(bResult[0].endpoint).toBe('https://push.example.com/sub-b')
  })

  // ── removeByEndpoint ───────────────────────────────────────────────────────

  it('removes only the subscription matching the given endpoint', async () => {
    await pushSubscriptionRepository.add(PLAYER_A, makeSub('https://push.example.com/keep'))
    await pushSubscriptionRepository.add(PLAYER_A, makeSub('https://push.example.com/remove'))

    await pushSubscriptionRepository.removeByEndpoint(PLAYER_A, 'https://push.example.com/remove')

    const result = await pushSubscriptionRepository.findAll(PLAYER_A)
    expect(result).toHaveLength(1)
    expect(result[0].endpoint).toBe('https://push.example.com/keep')
  })

  it('is a no-op when the endpoint does not exist', async () => {
    await pushSubscriptionRepository.add(PLAYER_A, makeSub('https://push.example.com/sub-1'))

    await pushSubscriptionRepository.removeByEndpoint(
      PLAYER_A,
      'https://push.example.com/nonexistent',
    )

    expect(await pushSubscriptionRepository.findAll(PLAYER_A)).toHaveLength(1)
  })

  it('is a no-op when player has no subscriptions at all', async () => {
    await expect(
      pushSubscriptionRepository.removeByEndpoint(PLAYER_A, 'https://push.example.com/sub'),
    ).resolves.toBeUndefined()
  })

  it('removes the only subscription leaving an empty set', async () => {
    const sub = makeSub('https://push.example.com/sole')
    await pushSubscriptionRepository.add(PLAYER_A, sub)

    await pushSubscriptionRepository.removeByEndpoint(PLAYER_A, sub.endpoint)

    expect(await pushSubscriptionRepository.findAll(PLAYER_A)).toEqual([])
  })

  it('preserves subscription keys (p256dh, auth) through serialisation round-trip', async () => {
    const sub: PushSubscriptionJSON = {
      endpoint: 'https://push.example.com/sub-1',
      expirationTime: 1_700_000_000,
      keys: { p256dh: 'BNTrxqV_abc', auth: 'xyz123' },
    }
    await pushSubscriptionRepository.add(PLAYER_A, sub)

    const [result] = await pushSubscriptionRepository.findAll(PLAYER_A)
    expect(result.expirationTime).toBe(1_700_000_000)
    expect(result.keys.p256dh).toBe('BNTrxqV_abc')
    expect(result.keys.auth).toBe('xyz123')
  })
})
