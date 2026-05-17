/**
 * Typed pub/sub events for real-time game state synchronisation.
 *
 * Publishing: use the shared `redis` client (regular commands are fine).
 * Subscribing: a single shared Redis client in subscribe mode fans out events
 * to all registered in-process listeners via `addGameListener`. This keeps
 * Redis connection count at O(1) regardless of how many SSE streams are open.
 *
 * Channel per game: `game:{gameId}`
 */

import type { ReactionType } from '$lib/reactions'
import { logger } from '$lib/server/logger'
import { redis } from '$lib/server/redis'

import type { GameStatus } from './repository/types'

// ── Event definitions ─────────────────────────────────────────────────────────

export type GameEvent =
  | { event: 'board'; playerId: string; board: number[] }
  | { event: 'staged'; playerId: string; staged: number[] }
  | { event: 'status'; status: GameStatus }
  | { event: 'turn'; currentPlayerId: string | null }
  | { event: 'player-joined'; playerId: string }
  | { event: 'player-left'; playerId: string }
  | { event: 'turn-rolled'; turnId: string }
  | { event: 'turn-selected'; turnId: string }
  | { event: 'turn-pending-end'; turnId: string }
  | { event: 'turn-ended'; turnId: string }
  | { event: 'game-finished'; winnerId: string }
  | { event: 'reaction'; playerId: string; type: ReactionType; emoji: string }
  | { event: 'refresh' }

// ── Channel helper ────────────────────────────────────────────────────────────

export const gameChannel = (gameId: string) => `game:${gameId}`

// ── Global hooks (fire on every published event, before Redis round-trip) ─────

type GlobalHook = (gameId: string, event: GameEvent) => void
const globalHooks = new Set<GlobalHook>()

export const addGlobalGameHook = (hook: GlobalHook): (() => void) => {
  globalHooks.add(hook)
  return () => globalHooks.delete(hook)
}

// ── Publisher ─────────────────────────────────────────────────────────────────

export const publishGameEvent = async (gameId: string, payload: GameEvent): Promise<void> => {
  await redis.publish(gameChannel(gameId), JSON.stringify(payload))
  globalHooks.forEach((h) => h(gameId, payload))
}

// ── Shared subscriber ─────────────────────────────────────────────────────────

// In-process fan-out: one Set of callbacks per subscribed channel.
const listeners = new Map<string, Set<(event: GameEvent) => void>>()
let sharedSubscriber: ReturnType<typeof redis.duplicate> | null = null

/** Call once at server startup (after connectRedis). */
export const initSharedSubscriber = async (): Promise<void> => {
  sharedSubscriber = redis.duplicate()
  await sharedSubscriber.connect()
  logger.info('Shared subscriber initialized')
}

/** Call at server shutdown (before disconnectRedis). */
export const teardownSharedSubscriber = async (): Promise<void> => {
  listeners.clear()
  if (sharedSubscriber) {
    await sharedSubscriber.quit()
    sharedSubscriber = null
  }
  logger.info('Shared subscriber torn down')
}

/**
 * Registers a listener for events on the given game's pub/sub channel.
 * Multiple listeners on the same channel share a single Redis subscription.
 * The Redis channel is unsubscribed when the last listener is removed.
 *
 * Returns a handle with a `remove()` method to deregister the listener.
 */
export const addGameListener = async (
  gameId: string,
  onEvent: (event: GameEvent) => void,
): Promise<{ remove: () => Promise<void> }> => {
  const channel = gameChannel(gameId)

  if (!listeners.has(channel)) {
    listeners.set(channel, new Set())
    await sharedSubscriber!.subscribe(channel, (msg: string) => {
      try {
        const event = JSON.parse(msg) as GameEvent
        listeners.get(channel)?.forEach((fn) => fn(event))
      } catch {
        logger.error({ msg }, 'Failed to parse game event')
      }
    })
  }

  listeners.get(channel)!.add(onEvent)

  return {
    remove: async () => {
      const set = listeners.get(channel)
      if (!set) return
      set.delete(onEvent)
      if (set.size === 0) {
        listeners.delete(channel)
        await sharedSubscriber!.unsubscribe(channel)
      }
    },
  }
}
