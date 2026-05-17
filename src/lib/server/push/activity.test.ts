import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('$lib/server/redis', () => ({
  redis: {
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    exists: vi.fn().mockResolvedValue(0),
  },
}))

vi.mock('$env/dynamic/private', () => ({
  env: { PUSH_INACTIVITY_SECONDS: '60' },
}))

import { isPlayerActive, markPlayerActive, markPlayerInactive } from '$lib/server/push/activity'
import { redis } from '$lib/server/redis'

describe('markPlayerActive', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.clearAllMocks())

  it('sets the activity key with correct value and TTL', () => {
    markPlayerActive('game-1', 'player-1')

    expect(redis.set).toHaveBeenCalledOnce()
    expect(redis.set).toHaveBeenCalledWith('player-activity:game-1:player-1', '1', { EX: 60 })
  })

  it('fire-and-forgets — returns void synchronously', () => {
    const result = markPlayerActive('game-1', 'player-1')
    expect(result).toBeUndefined()
  })

  it('uses gameId and playerId to scope the key', () => {
    markPlayerActive('game-abc', 'player-xyz')
    expect(redis.set).toHaveBeenCalledWith(
      'player-activity:game-abc:player-xyz',
      '1',
      expect.anything(),
    )
  })
})

describe('markPlayerInactive', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.clearAllMocks())

  it('deletes the activity key', () => {
    markPlayerInactive('game-1', 'player-1')

    expect(redis.del).toHaveBeenCalledOnce()
    expect(redis.del).toHaveBeenCalledWith('player-activity:game-1:player-1')
  })

  it('fire-and-forgets — returns void synchronously', () => {
    const result = markPlayerInactive('game-1', 'player-1')
    expect(result).toBeUndefined()
  })

  it('uses gameId and playerId to scope the key', () => {
    markPlayerInactive('game-abc', 'player-xyz')
    expect(redis.del).toHaveBeenCalledWith('player-activity:game-abc:player-xyz')
  })
})

describe('isPlayerActive', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.clearAllMocks())

  it('returns true when the activity key exists', async () => {
    vi.mocked(redis.exists).mockResolvedValue(1)

    expect(await isPlayerActive('game-1', 'player-1')).toBe(true)
  })

  it('returns false when the activity key does not exist', async () => {
    vi.mocked(redis.exists).mockResolvedValue(0)

    expect(await isPlayerActive('game-1', 'player-1')).toBe(false)
  })

  it('checks the correct Redis key', async () => {
    vi.mocked(redis.exists).mockResolvedValue(0)

    await isPlayerActive('game-42', 'player-99')

    expect(redis.exists).toHaveBeenCalledWith('player-activity:game-42:player-99')
  })
})
