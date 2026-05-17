import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('$env/dynamic/private', () => ({
  env: {
    VAPID_SUBJECT: 'mailto:test@example.com',
    VAPID_PUBLIC_KEY: 'test-pub-key',
    VAPID_PRIVATE_KEY: 'test-priv-key',
  },
}))

vi.mock('$lib/server/repository', () => ({
  playerRepository: { findById: vi.fn() },
  pushSubscriptionRepository: {
    findAll: vi.fn().mockResolvedValue([]),
    removeByEndpoint: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('./activity', () => ({
  isPlayerActive: vi.fn().mockResolvedValue(false),
}))

vi.mock('./pending', () => ({
  setPendingNotification: vi.fn(),
  clearPendingNotification: vi.fn(),
}))

vi.mock('$lib/server/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}))

import webpush from 'web-push'

import { logger } from '$lib/server/logger'
import { isPlayerActive } from '$lib/server/push/activity'
import {
  dispatchGameFinishedNotification,
  dispatchTurnNotification,
  notifyGameFinished,
  notifyPlayerTurn,
} from '$lib/server/push/notify'
import { clearPendingNotification, setPendingNotification } from '$lib/server/push/pending'
import { playerRepository, pushSubscriptionRepository } from '$lib/server/repository'

const makeSub = (endpoint = 'https://push.example.com/sub', locale = 'en') => ({
  endpoint,
  expirationTime: null,
  keys: { p256dh: 'p256', auth: 'auth' },
  locale,
})

describe('notifyPlayerTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as never)
  })
  afterEach(() => vi.clearAllMocks())

  it('queues a pending notification and skips send when player is active', async () => {
    vi.mocked(isPlayerActive).mockResolvedValue(true)

    await notifyPlayerTurn('game-1', 'player-1', 'INVITE', 'https://example.com')

    expect(setPendingNotification).toHaveBeenCalledWith('game-1', 'player-1', {
      type: 'turn',
      inviteCode: 'INVITE',
      baseUrl: 'https://example.com',
    })
    expect(pushSubscriptionRepository.findAll).not.toHaveBeenCalled()
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('clears any pending notification and sends when player is inactive', async () => {
    vi.mocked(isPlayerActive).mockResolvedValue(false)
    vi.mocked(pushSubscriptionRepository.findAll).mockResolvedValue([])

    await notifyPlayerTurn('game-1', 'player-1', 'INVITE', 'https://example.com')

    expect(clearPendingNotification).toHaveBeenCalledWith('game-1', 'player-1')
  })

  it('does nothing when player has no subscriptions', async () => {
    vi.mocked(isPlayerActive).mockResolvedValue(false)
    vi.mocked(pushSubscriptionRepository.findAll).mockResolvedValue([])

    await notifyPlayerTurn('game-1', 'player-1', 'INVITE', 'https://example.com')

    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('sends notification to every subscription the player has', async () => {
    const subs = [
      makeSub('https://push.example.com/sub1'),
      makeSub('https://push.example.com/sub2'),
    ]
    vi.mocked(isPlayerActive).mockResolvedValue(false)
    vi.mocked(pushSubscriptionRepository.findAll).mockResolvedValue(subs)
    vi.mocked(playerRepository.findById).mockResolvedValue({
      id: 'player-1',
      name: 'Alice',
      createdAt: 0,
      updatedAt: 0,
    })

    await notifyPlayerTurn('game-1', 'player-1', 'INVITE', 'https://example.com')

    expect(webpush.sendNotification).toHaveBeenCalledTimes(2)
  })

  it('sends correct turn payload including player name and game URL', async () => {
    const sub = makeSub()
    vi.mocked(isPlayerActive).mockResolvedValue(false)
    vi.mocked(pushSubscriptionRepository.findAll).mockResolvedValue([sub])
    vi.mocked(playerRepository.findById).mockResolvedValue({
      id: 'player-1',
      name: 'Alice',
      createdAt: 0,
      updatedAt: 0,
    })

    await notifyPlayerTurn('game-1', 'player-1', 'INVITE', 'https://example.com')

    expect(webpush.sendNotification).toHaveBeenCalledWith(
      sub,
      JSON.stringify({
        title: 'Pearls — Your turn!',
        body: "Alice, it's your turn to play.",
        url: 'https://example.com/INVITE',
      }),
    )
  })

  it('falls back to "?" in body when player record not found', async () => {
    vi.mocked(isPlayerActive).mockResolvedValue(false)
    vi.mocked(pushSubscriptionRepository.findAll).mockResolvedValue([makeSub()])
    vi.mocked(playerRepository.findById).mockResolvedValue(null)

    await notifyPlayerTurn('game-1', 'player-1', 'INVITE', 'https://example.com')

    const payload = JSON.parse(vi.mocked(webpush.sendNotification).mock.calls[0][1] as string)
    expect(payload.body).toBe("?, it's your turn to play.")
  })

  it('sends German turn payload when subscription locale is de-DE', async () => {
    vi.mocked(isPlayerActive).mockResolvedValue(false)
    vi.mocked(pushSubscriptionRepository.findAll).mockResolvedValue([
      makeSub('https://push.example.com/sub', 'de-DE'),
    ])
    vi.mocked(playerRepository.findById).mockResolvedValue({
      id: 'player-1',
      name: 'Alice',
      createdAt: 0,
      updatedAt: 0,
    })

    await notifyPlayerTurn('game-1', 'player-1', 'INVITE', 'https://example.com')

    const payload = JSON.parse(vi.mocked(webpush.sendNotification).mock.calls[0][1] as string)
    expect(payload.title).toBe('Pearls — Du bist dran!')
    expect(payload.body).toBe('Alice, du bist an der Reihe.')
  })

  it('falls back to English when subscription has no locale', async () => {
    vi.mocked(isPlayerActive).mockResolvedValue(false)
    vi.mocked(pushSubscriptionRepository.findAll).mockResolvedValue([
      {
        endpoint: 'https://push.example.com/sub',
        expirationTime: null,
        keys: { p256dh: 'p256', auth: 'auth' },
      },
    ])
    vi.mocked(playerRepository.findById).mockResolvedValue({
      id: 'player-1',
      name: 'Alice',
      createdAt: 0,
      updatedAt: 0,
    })

    await notifyPlayerTurn('game-1', 'player-1', 'INVITE', 'https://example.com')

    const payload = JSON.parse(vi.mocked(webpush.sendNotification).mock.calls[0][1] as string)
    expect(payload.title).toBe('Pearls — Your turn!')
  })

  it('removes subscription when push service returns 410', async () => {
    const sub = makeSub('https://push.example.com/gone')
    vi.mocked(isPlayerActive).mockResolvedValue(false)
    vi.mocked(pushSubscriptionRepository.findAll).mockResolvedValue([sub])
    vi.mocked(playerRepository.findById).mockResolvedValue(null)
    vi.mocked(webpush.sendNotification).mockRejectedValue(
      Object.assign(new Error('Gone'), { statusCode: 410 }),
    )

    await notifyPlayerTurn('game-1', 'player-1', 'INVITE', 'https://example.com')

    expect(pushSubscriptionRepository.removeByEndpoint).toHaveBeenCalledWith(
      'player-1',
      'https://push.example.com/gone',
    )
  })

  it('removes subscription when push service returns 404', async () => {
    const sub = makeSub()
    vi.mocked(isPlayerActive).mockResolvedValue(false)
    vi.mocked(pushSubscriptionRepository.findAll).mockResolvedValue([sub])
    vi.mocked(playerRepository.findById).mockResolvedValue(null)
    vi.mocked(webpush.sendNotification).mockRejectedValue(
      Object.assign(new Error('Not Found'), { statusCode: 404 }),
    )

    await notifyPlayerTurn('game-1', 'player-1', 'INVITE', 'https://example.com')

    expect(pushSubscriptionRepository.removeByEndpoint).toHaveBeenCalledOnce()
  })

  it('does not remove subscription or rethrow on other push errors', async () => {
    vi.mocked(isPlayerActive).mockResolvedValue(false)
    vi.mocked(pushSubscriptionRepository.findAll).mockResolvedValue([makeSub()])
    vi.mocked(playerRepository.findById).mockResolvedValue(null)
    vi.mocked(webpush.sendNotification).mockRejectedValue(
      Object.assign(new Error('Server error'), { statusCode: 500 }),
    )

    await expect(
      notifyPlayerTurn('game-1', 'player-1', 'INVITE', 'https://example.com'),
    ).resolves.toBeUndefined()

    expect(pushSubscriptionRepository.removeByEndpoint).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledOnce()
  })
})

describe('notifyGameFinished', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as never)
  })
  afterEach(() => vi.clearAllMocks())

  it('queues a pending game-finished notification for active players', async () => {
    vi.mocked(isPlayerActive).mockResolvedValue(true)
    vi.mocked(playerRepository.findById).mockResolvedValue({
      id: 'winner-id',
      name: 'Alice',
      createdAt: 0,
      updatedAt: 0,
    })

    await notifyGameFinished(
      'game-1',
      ['winner-id', 'loser-id'],
      'winner-id',
      'INVITE',
      'https://example.com',
    )

    expect(setPendingNotification).toHaveBeenCalledWith('game-1', 'winner-id', {
      type: 'game-finished',
      winnerName: 'Alice',
      isWinner: true,
      inviteCode: 'INVITE',
      baseUrl: 'https://example.com',
    })
    expect(setPendingNotification).toHaveBeenCalledWith('game-1', 'loser-id', {
      type: 'game-finished',
      winnerName: 'Alice',
      isWinner: false,
      inviteCode: 'INVITE',
      baseUrl: 'https://example.com',
    })
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('clears pending and sends immediately for inactive players', async () => {
    vi.mocked(isPlayerActive).mockResolvedValue(false)
    vi.mocked(pushSubscriptionRepository.findAll).mockResolvedValue([makeSub()])
    vi.mocked(playerRepository.findById).mockResolvedValue(null)

    await notifyGameFinished('game-1', ['player-1'], 'player-1', 'INVITE', 'https://example.com')

    expect(clearPendingNotification).toHaveBeenCalledWith('game-1', 'player-1')
    expect(webpush.sendNotification).toHaveBeenCalledOnce()
  })

  it('does not send to players with no subscriptions', async () => {
    vi.mocked(isPlayerActive).mockResolvedValue(false)
    vi.mocked(pushSubscriptionRepository.findAll).mockResolvedValue([])
    vi.mocked(playerRepository.findById).mockResolvedValue(null)

    await notifyGameFinished(
      'game-1',
      ['player-1', 'player-2'],
      'player-1',
      'INVITE',
      'https://example.com',
    )

    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('sends winner payload to winner, loser payload to others', async () => {
    vi.mocked(isPlayerActive).mockResolvedValue(false)
    vi.mocked(pushSubscriptionRepository.findAll).mockResolvedValue([makeSub()])
    vi.mocked(playerRepository.findById).mockImplementation(async (id) =>
      id === 'winner-id'
        ? { id: 'winner-id', name: 'Alice', createdAt: 0, updatedAt: 0 }
        : { id: 'loser-id', name: 'Bob', createdAt: 0, updatedAt: 0 },
    )

    await notifyGameFinished(
      'game-1',
      ['winner-id', 'loser-id'],
      'winner-id',
      'INVITE',
      'https://example.com',
    )

    const calls = vi.mocked(webpush.sendNotification).mock.calls
    const payloads = calls.map((c) => JSON.parse(c[1] as string))

    const winnerPayload = payloads.find(
      (p: { title: string }) => p.title === 'Pearls — You won! 🎉',
    )
    const loserPayload = payloads.find((p: { title: string }) => p.title === 'Pearls — Game over')

    expect(winnerPayload).toBeDefined()
    expect(winnerPayload.body).toBe('Congratulations!')

    expect(loserPayload).toBeDefined()
    expect(loserPayload.body).toBe('Alice won the game.')
  })

  it('falls back to "?" in loser body when winner record not found', async () => {
    vi.mocked(isPlayerActive).mockResolvedValue(false)
    vi.mocked(pushSubscriptionRepository.findAll).mockResolvedValue([makeSub()])
    vi.mocked(playerRepository.findById).mockResolvedValue(null)

    await notifyGameFinished('game-1', ['loser-id'], 'winner-id', 'INVITE', 'https://example.com')

    const payload = JSON.parse(vi.mocked(webpush.sendNotification).mock.calls[0][1] as string)
    expect(payload.body).toBe('? won the game.')
  })

  it('sends German game-over payloads when subscription locale is de', async () => {
    vi.mocked(isPlayerActive).mockResolvedValue(false)
    vi.mocked(pushSubscriptionRepository.findAll).mockResolvedValue([
      makeSub('https://push.example.com/sub', 'de'),
    ])
    vi.mocked(playerRepository.findById).mockImplementation(async (id) =>
      id === 'winner-id'
        ? { id: 'winner-id', name: 'Alice', createdAt: 0, updatedAt: 0 }
        : { id: 'loser-id', name: 'Bob', createdAt: 0, updatedAt: 0 },
    )

    await notifyGameFinished(
      'game-1',
      ['winner-id', 'loser-id'],
      'winner-id',
      'INVITE',
      'https://example.com',
    )

    const payloads = vi
      .mocked(webpush.sendNotification)
      .mock.calls.map((c) => JSON.parse(c[1] as string))
    const winnerPayload = payloads.find(
      (p: { title: string }) => p.title === 'Pearls — Du hast gewonnen! 🎉',
    )
    const loserPayload = payloads.find(
      (p: { title: string }) => p.title === 'Pearls — Spiel vorbei',
    )

    expect(winnerPayload?.body).toBe('Glückwunsch!')
    expect(loserPayload?.body).toBe('Alice hat gewonnen.')
  })

  it('skips inactive-only players and still notifies active-absent players', async () => {
    vi.mocked(isPlayerActive).mockImplementation(
      async (_, playerId) => playerId === 'active-player',
    )
    vi.mocked(pushSubscriptionRepository.findAll).mockResolvedValue([makeSub()])
    vi.mocked(playerRepository.findById).mockResolvedValue(null)

    await notifyGameFinished(
      'game-1',
      ['active-player', 'inactive-player'],
      'active-player',
      'INVITE',
      'https://example.com',
    )

    expect(webpush.sendNotification).toHaveBeenCalledOnce()
  })

  it('removes expired subscriptions (410) encountered during game-finished send', async () => {
    const sub = makeSub('https://push.example.com/expired')
    vi.mocked(isPlayerActive).mockResolvedValue(false)
    vi.mocked(pushSubscriptionRepository.findAll).mockResolvedValue([sub])
    vi.mocked(playerRepository.findById).mockResolvedValue(null)
    vi.mocked(webpush.sendNotification).mockRejectedValue(
      Object.assign(new Error('Gone'), { statusCode: 410 }),
    )

    await notifyGameFinished('game-1', ['player-1'], 'player-1', 'INVITE', 'https://example.com')

    expect(pushSubscriptionRepository.removeByEndpoint).toHaveBeenCalledWith(
      'player-1',
      'https://push.example.com/expired',
    )
  })

  it('includes the game URL in every payload', async () => {
    vi.mocked(isPlayerActive).mockResolvedValue(false)
    vi.mocked(pushSubscriptionRepository.findAll).mockResolvedValue([makeSub()])
    vi.mocked(playerRepository.findById).mockResolvedValue(null)

    await notifyGameFinished(
      'game-1',
      ['player-1'],
      'player-1',
      'CODE42',
      'https://pearls.example.com',
    )

    const payload = JSON.parse(vi.mocked(webpush.sendNotification).mock.calls[0][1] as string)
    expect(payload.url).toBe('https://pearls.example.com/CODE42')
  })
})

describe('dispatchTurnNotification', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.clearAllMocks())

  it('sends the turn notification directly without an activity check', async () => {
    const sub = makeSub()
    vi.mocked(pushSubscriptionRepository.findAll).mockResolvedValue([sub])
    vi.mocked(playerRepository.findById).mockResolvedValue({
      id: 'player-1',
      name: 'Alice',
      createdAt: 0,
      updatedAt: 0,
    })

    await dispatchTurnNotification('player-1', 'INVITE', 'https://example.com')

    expect(isPlayerActive).not.toHaveBeenCalled()
    expect(webpush.sendNotification).toHaveBeenCalledOnce()
    const payload = JSON.parse(vi.mocked(webpush.sendNotification).mock.calls[0][1] as string)
    expect(payload.url).toBe('https://example.com/INVITE')
  })

  it('does nothing when the player has no subscriptions', async () => {
    vi.mocked(pushSubscriptionRepository.findAll).mockResolvedValue([])

    await dispatchTurnNotification('player-1', 'INVITE', 'https://example.com')

    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })
})

describe('dispatchGameFinishedNotification', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.clearAllMocks())

  it('sends winner payload directly without an activity check', async () => {
    vi.mocked(pushSubscriptionRepository.findAll).mockResolvedValue([makeSub()])

    await dispatchGameFinishedNotification(
      'player-1',
      'Alice',
      true,
      'INVITE',
      'https://example.com',
    )

    expect(isPlayerActive).not.toHaveBeenCalled()
    const payload = JSON.parse(vi.mocked(webpush.sendNotification).mock.calls[0][1] as string)
    expect(payload.title).toBe('Pearls — You won! 🎉')
    expect(payload.body).toBe('Congratulations!')
  })

  it('sends loser payload with winner name', async () => {
    vi.mocked(pushSubscriptionRepository.findAll).mockResolvedValue([makeSub()])

    await dispatchGameFinishedNotification(
      'player-1',
      'Alice',
      false,
      'INVITE',
      'https://example.com',
    )

    const payload = JSON.parse(vi.mocked(webpush.sendNotification).mock.calls[0][1] as string)
    expect(payload.title).toBe('Pearls — Game over')
    expect(payload.body).toBe('Alice won the game.')
  })

  it('does nothing when the player has no subscriptions', async () => {
    vi.mocked(pushSubscriptionRepository.findAll).mockResolvedValue([])

    await dispatchGameFinishedNotification(
      'player-1',
      'Alice',
      false,
      'INVITE',
      'https://example.com',
    )

    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })
})
