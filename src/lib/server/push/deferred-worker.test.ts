import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('$lib/server/redis', () => ({
  redis: {
    scan: vi.fn().mockResolvedValue({ cursor: '0', keys: [] }),
  },
}))

vi.mock('./activity', () => ({
  isPlayerActive: vi.fn().mockResolvedValue(false),
}))

vi.mock('./pending', () => ({
  takePendingNotification: vi.fn().mockResolvedValue(null),
}))

vi.mock('./notify', () => ({
  dispatchTurnNotification: vi.fn().mockResolvedValue(undefined),
  dispatchGameFinishedNotification: vi.fn().mockResolvedValue(undefined),
}))

import { isPlayerActive } from '$lib/server/push/activity'
import { runOnce, startDeferredWorker, stopDeferredWorker } from '$lib/server/push/deferred-worker'
import { dispatchGameFinishedNotification, dispatchTurnNotification } from '$lib/server/push/notify'
import { takePendingNotification } from '$lib/server/push/pending'
import { redis } from '$lib/server/redis'

const PENDING_KEY = (gameId: string, playerId: string) =>
  `pending-notification:${gameId}:${playerId}`

describe('runOnce', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.clearAllMocks())

  it('does nothing when there are no pending keys', async () => {
    vi.mocked(redis.scan).mockResolvedValue({ cursor: '0', keys: [] })

    await runOnce()

    expect(isPlayerActive).not.toHaveBeenCalled()
    expect(takePendingNotification).not.toHaveBeenCalled()
    expect(dispatchTurnNotification).not.toHaveBeenCalled()
    expect(dispatchGameFinishedNotification).not.toHaveBeenCalled()
  })

  it('skips a key whose player is still active', async () => {
    vi.mocked(redis.scan).mockResolvedValue({
      cursor: '0',
      keys: [PENDING_KEY('game-1', 'player-1')],
    })
    vi.mocked(isPlayerActive).mockResolvedValue(true)

    await runOnce()

    expect(takePendingNotification).not.toHaveBeenCalled()
    expect(dispatchTurnNotification).not.toHaveBeenCalled()
  })

  it('dispatches a turn notification when player is inactive', async () => {
    vi.mocked(redis.scan).mockResolvedValue({
      cursor: '0',
      keys: [PENDING_KEY('game-1', 'player-1')],
    })
    vi.mocked(isPlayerActive).mockResolvedValue(false)
    vi.mocked(takePendingNotification).mockResolvedValue({
      type: 'turn',
      inviteCode: 'INVITE',
      baseUrl: 'https://example.com',
    })

    await runOnce()

    expect(takePendingNotification).toHaveBeenCalledWith('game-1', 'player-1')
    expect(dispatchTurnNotification).toHaveBeenCalledWith(
      'player-1',
      'INVITE',
      'https://example.com',
    )
    expect(dispatchGameFinishedNotification).not.toHaveBeenCalled()
  })

  it('dispatches a game-finished notification when player is inactive', async () => {
    vi.mocked(redis.scan).mockResolvedValue({
      cursor: '0',
      keys: [PENDING_KEY('game-1', 'player-1')],
    })
    vi.mocked(isPlayerActive).mockResolvedValue(false)
    vi.mocked(takePendingNotification).mockResolvedValue({
      type: 'game-finished',
      winnerName: 'Alice',
      isWinner: false,
      inviteCode: 'INVITE',
      baseUrl: 'https://example.com',
    })

    await runOnce()

    expect(dispatchGameFinishedNotification).toHaveBeenCalledWith(
      'player-1',
      'Alice',
      false,
      'INVITE',
      'https://example.com',
    )
    expect(dispatchTurnNotification).not.toHaveBeenCalled()
  })

  it('skips dispatch when take returns null (concurrent worker took it first)', async () => {
    vi.mocked(redis.scan).mockResolvedValue({
      cursor: '0',
      keys: [PENDING_KEY('game-1', 'player-1')],
    })
    vi.mocked(isPlayerActive).mockResolvedValue(false)
    vi.mocked(takePendingNotification).mockResolvedValue(null)

    await runOnce()

    expect(dispatchTurnNotification).not.toHaveBeenCalled()
    expect(dispatchGameFinishedNotification).not.toHaveBeenCalled()
  })

  it('processes multiple keys independently', async () => {
    vi.mocked(redis.scan).mockResolvedValue({
      cursor: '0',
      keys: [PENDING_KEY('game-1', 'player-a'), PENDING_KEY('game-1', 'player-b')],
    })
    vi.mocked(isPlayerActive).mockImplementation(async (_, playerId) => playerId === 'player-a')
    vi.mocked(takePendingNotification).mockResolvedValue({
      type: 'turn',
      inviteCode: 'CODE',
      baseUrl: 'https://example.com',
    })

    await runOnce()

    expect(takePendingNotification).toHaveBeenCalledWith('game-1', 'player-b')
    expect(takePendingNotification).not.toHaveBeenCalledWith('game-1', 'player-a')
    expect(dispatchTurnNotification).toHaveBeenCalledOnce()
    expect(dispatchTurnNotification).toHaveBeenCalledWith('player-b', 'CODE', 'https://example.com')
  })

  it('silently skips malformed keys that cannot be parsed', async () => {
    vi.mocked(redis.scan).mockResolvedValue({
      cursor: '0',
      keys: ['pending-notification:no-player-id-missing'],
    })

    await runOnce()

    expect(dispatchTurnNotification).not.toHaveBeenCalled()
    expect(dispatchGameFinishedNotification).not.toHaveBeenCalled()
  })

  it('pages through a multi-cursor scan', async () => {
    vi.mocked(redis.scan)
      .mockResolvedValueOnce({
        cursor: '42',
        keys: [PENDING_KEY('game-1', 'player-1')],
      })
      .mockResolvedValueOnce({
        cursor: '0',
        keys: [PENDING_KEY('game-2', 'player-2')],
      })
    vi.mocked(takePendingNotification).mockResolvedValue({
      type: 'turn',
      inviteCode: 'X',
      baseUrl: 'https://example.com',
    })

    await runOnce()

    expect(redis.scan).toHaveBeenCalledTimes(2)
    expect(dispatchTurnNotification).toHaveBeenCalledTimes(2)
  })
})

describe('startDeferredWorker / stopDeferredWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    stopDeferredWorker()
  })

  afterEach(() => {
    stopDeferredWorker()
    vi.useRealTimers()
  })

  it('starts polling and calls runOnce after each interval', async () => {
    vi.mocked(redis.scan).mockResolvedValue({ cursor: '0', keys: [] })

    startDeferredWorker()
    await vi.advanceTimersByTimeAsync(30_000)

    expect(redis.scan).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(30_000)

    expect(redis.scan).toHaveBeenCalledTimes(2)
  })

  it('is idempotent — calling start twice does not create a second interval', async () => {
    vi.mocked(redis.scan).mockResolvedValue({ cursor: '0', keys: [] })

    startDeferredWorker()
    startDeferredWorker()
    await vi.advanceTimersByTimeAsync(30_000)

    expect(redis.scan).toHaveBeenCalledOnce()
  })

  it('stops polling after stopDeferredWorker', async () => {
    vi.mocked(redis.scan).mockResolvedValue({ cursor: '0', keys: [] })

    startDeferredWorker()
    stopDeferredWorker()
    await vi.advanceTimersByTimeAsync(30_000)

    expect(redis.scan).not.toHaveBeenCalled()
  })
})
