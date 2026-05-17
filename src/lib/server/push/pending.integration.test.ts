/**
 * Integration tests for pending notification helpers.
 *
 * Runs against a real Redis instance started by the testcontainers globalSetup.
 * Each test starts with a clean database (redis-flush.ts runs FLUSHALL beforeEach).
 */
import { describe, expect, it } from 'vitest'

import {
  clearPendingNotification,
  setPendingNotification,
  takePendingNotification,
} from '$lib/server/push/pending'

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 20))

const turn = { type: 'turn' as const, inviteCode: 'CODE', baseUrl: 'https://example.com' }
const gameFinished = {
  type: 'game-finished' as const,
  winnerName: 'Alice',
  isWinner: false,
  inviteCode: 'CODE',
  baseUrl: 'https://example.com',
}

describe('pending notification', () => {
  it('returns null when no notification is pending', async () => {
    expect(await takePendingNotification('game-1', 'player-1')).toBeNull()
  })

  it('stores and retrieves a turn notification', async () => {
    setPendingNotification('game-1', 'player-1', turn)
    await settle()

    expect(await takePendingNotification('game-1', 'player-1')).toEqual(turn)
  })

  it('stores and retrieves a game-finished notification', async () => {
    setPendingNotification('game-1', 'player-1', gameFinished)
    await settle()

    expect(await takePendingNotification('game-1', 'player-1')).toEqual(gameFinished)
  })

  it('take is destructive — second take returns null', async () => {
    setPendingNotification('game-1', 'player-1', turn)
    await settle()

    await takePendingNotification('game-1', 'player-1')

    expect(await takePendingNotification('game-1', 'player-1')).toBeNull()
  })

  it('last set wins — game-finished overwrites a queued turn notification', async () => {
    setPendingNotification('game-1', 'player-1', turn)
    setPendingNotification('game-1', 'player-1', gameFinished)
    await settle()

    expect(await takePendingNotification('game-1', 'player-1')).toEqual(gameFinished)
  })

  it('clear removes the notification so take returns null', async () => {
    setPendingNotification('game-1', 'player-1', turn)
    await settle()
    clearPendingNotification('game-1', 'player-1')
    await settle()

    expect(await takePendingNotification('game-1', 'player-1')).toBeNull()
  })

  it('clear is a no-op when nothing is pending', async () => {
    clearPendingNotification('game-1', 'player-1')
    await settle()

    expect(await takePendingNotification('game-1', 'player-1')).toBeNull()
  })

  it('isolates notifications between players in the same game', async () => {
    setPendingNotification('game-1', 'player-a', { ...turn, inviteCode: 'CODE-A' })
    setPendingNotification('game-1', 'player-b', { ...turn, inviteCode: 'CODE-B' })
    await settle()

    expect(await takePendingNotification('game-1', 'player-a')).toMatchObject({
      inviteCode: 'CODE-A',
    })
    expect(await takePendingNotification('game-1', 'player-b')).toMatchObject({
      inviteCode: 'CODE-B',
    })
  })
})
