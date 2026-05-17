import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('$lib/server/redis', () => ({
  redis: {
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    getDel: vi.fn().mockResolvedValue(null),
  },
}))

import {
  clearPendingNotification,
  setPendingNotification,
  takePendingNotification,
} from '$lib/server/push/pending'
import { redis } from '$lib/server/redis'

const turnNotification = {
  type: 'turn' as const,
  inviteCode: 'INVITE',
  baseUrl: 'https://example.com',
}
const gameFinishedNotification = {
  type: 'game-finished' as const,
  winnerName: 'Alice',
  isWinner: false,
  inviteCode: 'INVITE',
  baseUrl: 'https://example.com',
}

describe('setPendingNotification', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.clearAllMocks())

  it('sets the pending key with serialised turn notification', () => {
    setPendingNotification('game-1', 'player-1', turnNotification)

    expect(redis.set).toHaveBeenCalledOnce()
    expect(redis.set).toHaveBeenCalledWith(
      'pending-notification:game-1:player-1',
      JSON.stringify(turnNotification),
    )
  })

  it('sets the pending key with serialised game-finished notification', () => {
    setPendingNotification('game-1', 'player-1', gameFinishedNotification)

    expect(redis.set).toHaveBeenCalledWith(
      'pending-notification:game-1:player-1',
      JSON.stringify(gameFinishedNotification),
    )
  })

  it('overwrites a previous pending notification (latest wins)', () => {
    setPendingNotification('game-1', 'player-1', turnNotification)
    setPendingNotification('game-1', 'player-1', gameFinishedNotification)

    expect(redis.set).toHaveBeenCalledTimes(2)
    expect(redis.set).toHaveBeenLastCalledWith(
      'pending-notification:game-1:player-1',
      JSON.stringify(gameFinishedNotification),
    )
  })

  it('fire-and-forgets — returns void synchronously', () => {
    expect(setPendingNotification('game-1', 'player-1', turnNotification)).toBeUndefined()
  })

  it('scopes the key by gameId and playerId', () => {
    setPendingNotification('game-abc', 'player-xyz', turnNotification)

    expect(redis.set).toHaveBeenCalledWith(
      'pending-notification:game-abc:player-xyz',
      expect.any(String),
    )
  })
})

describe('clearPendingNotification', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.clearAllMocks())

  it('deletes the pending key', () => {
    clearPendingNotification('game-1', 'player-1')

    expect(redis.del).toHaveBeenCalledOnce()
    expect(redis.del).toHaveBeenCalledWith('pending-notification:game-1:player-1')
  })

  it('fire-and-forgets — returns void synchronously', () => {
    expect(clearPendingNotification('game-1', 'player-1')).toBeUndefined()
  })
})

describe('takePendingNotification', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.clearAllMocks())

  it('returns null when no pending notification exists', async () => {
    vi.mocked(redis.getDel).mockResolvedValue(null)

    expect(await takePendingNotification('game-1', 'player-1')).toBeNull()
  })

  it('returns a parsed turn notification', async () => {
    vi.mocked(redis.getDel).mockResolvedValue(JSON.stringify(turnNotification))

    expect(await takePendingNotification('game-1', 'player-1')).toEqual(turnNotification)
  })

  it('returns a parsed game-finished notification', async () => {
    vi.mocked(redis.getDel).mockResolvedValue(JSON.stringify(gameFinishedNotification))

    expect(await takePendingNotification('game-1', 'player-1')).toEqual(gameFinishedNotification)
  })

  it('uses GETDEL (atomic) on the correct key', async () => {
    vi.mocked(redis.getDel).mockResolvedValue(null)

    await takePendingNotification('game-42', 'player-99')

    expect(redis.getDel).toHaveBeenCalledWith('pending-notification:game-42:player-99')
  })
})
