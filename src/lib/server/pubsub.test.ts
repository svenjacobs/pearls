/**
 * Unit tests for the shared subscriber fan-out in pubsub.ts.
 *
 * Mocks redis.duplicate() to return a fake subscriber with spied methods.
 * Tests guard the fan-out logic: correct dispatch, single Redis subscription
 * per channel, and lifecycle (subscribe/unsubscribe timing).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('$lib/server/redis', () => ({
  redis: {
    publish: vi.fn(),
    duplicate: vi.fn(),
  },
}))

import type { GameEvent } from '$lib/server/pubsub'
import { addGameListener, initSharedSubscriber, teardownSharedSubscriber } from '$lib/server/pubsub'
import { redis } from '$lib/server/redis'

// Per-channel subscribe callbacks captured from the fake subscriber.
const subscribeHandlers = new Map<string, (msg: string) => void>()

const simulateMessage = (gameId: string, event: GameEvent) => {
  subscribeHandlers.get(`game:${gameId}`)?.(JSON.stringify(event))
}

describe('pubsub shared subscriber', () => {
  let fakeSubscriber: {
    connect: ReturnType<typeof vi.fn>
    subscribe: ReturnType<typeof vi.fn>
    unsubscribe: ReturnType<typeof vi.fn>
    quit: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    subscribeHandlers.clear()
    fakeSubscriber = {
      connect: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockImplementation(async (channel: string, cb: (msg: string) => void) => {
        subscribeHandlers.set(channel, cb)
      }),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(redis.duplicate).mockReturnValue(fakeSubscriber as any)
    await teardownSharedSubscriber()
    await initSharedSubscriber()
  })

  afterEach(async () => {
    await teardownSharedSubscriber()
  })

  it('dispatches events to all listeners registered for the same gameId', async () => {
    const listener1 = vi.fn()
    const listener2 = vi.fn()
    await addGameListener('game-1', listener1)
    await addGameListener('game-1', listener2)

    simulateMessage('game-1', { event: 'refresh' })

    expect(listener1).toHaveBeenCalledOnce()
    expect(listener1).toHaveBeenCalledWith({ event: 'refresh' })
    expect(listener2).toHaveBeenCalledOnce()
    expect(listener2).toHaveBeenCalledWith({ event: 'refresh' })
  })

  it('only subscribes Redis channel once for multiple listeners on same game', async () => {
    await addGameListener('game-1', vi.fn())
    await addGameListener('game-1', vi.fn())
    await addGameListener('game-1', vi.fn())

    expect(fakeSubscriber.subscribe).toHaveBeenCalledOnce()
    expect(fakeSubscriber.subscribe).toHaveBeenCalledWith('game:game-1', expect.any(Function))
  })

  it('unsubscribes Redis channel only when last listener is removed', async () => {
    const { remove: remove1 } = await addGameListener('game-1', vi.fn())
    const { remove: remove2 } = await addGameListener('game-1', vi.fn())

    await remove1()
    expect(fakeSubscriber.unsubscribe).not.toHaveBeenCalled()

    await remove2()
    expect(fakeSubscriber.unsubscribe).toHaveBeenCalledWith('game:game-1')
  })

  it('does not call removed listener after removal', async () => {
    const listener = vi.fn()
    const { remove } = await addGameListener('game-1', listener)
    await remove()

    simulateMessage('game-1', { event: 'refresh' })

    expect(listener).not.toHaveBeenCalled()
  })

  it('isolates listeners on different game channels', async () => {
    const listener1 = vi.fn()
    const listener2 = vi.fn()
    await addGameListener('game-1', listener1)
    await addGameListener('game-2', listener2)

    simulateMessage('game-1', { event: 'refresh' })

    expect(listener1).toHaveBeenCalledOnce()
    expect(listener2).not.toHaveBeenCalled()
  })

  it('subscribes a separate Redis channel for each distinct game', async () => {
    await addGameListener('game-1', vi.fn())
    await addGameListener('game-2', vi.fn())

    expect(fakeSubscriber.subscribe).toHaveBeenCalledTimes(2)
    expect(fakeSubscriber.subscribe).toHaveBeenCalledWith('game:game-1', expect.any(Function))
    expect(fakeSubscriber.subscribe).toHaveBeenCalledWith('game:game-2', expect.any(Function))
  })
})
