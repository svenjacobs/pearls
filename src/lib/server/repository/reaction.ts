import { createId } from '@paralleldrive/cuid2'

import { REACTIONS, type ReactionType } from '$lib/reactions'
import { REACTION_THROTTLE_MS } from '$lib/server/game/constants'
import { redis } from '$lib/server/redis'

import type { Reaction } from './types'

// ── Key helpers ───────────────────────────────────────────────────────────────

const keys = {
  reactions: (gameId: string) => `game:${gameId}:reactions`,
  throttle: (gameId: string, playerId: string) => `reaction-throttle:${gameId}:${playerId}`,
}

// ── Repository ────────────────────────────────────────────────────────────────

export const reactionRepository = {
  /**
   * Persists a new reaction for the given game/player and returns the stored entity.
   * The reaction is appended to the game's sorted set with its timestamp as score,
   * enabling chronological replay queries via `listSince`.
   */
  async add(gameId: string, playerId: string, type: ReactionType): Promise<Reaction> {
    const reaction: Reaction = {
      id: createId(),
      gameId,
      playerId,
      type,
      emoji: REACTIONS[type],
      at: Date.now(),
    }
    await redis.zAdd(keys.reactions(gameId), {
      score: reaction.at,
      value: JSON.stringify(reaction),
    })
    return reaction
  },

  /**
   * Returns all reactions for a game that occurred at or after `since` (epoch ms).
   * Results are in chronological order, suitable for replay.
   */
  async listSince(gameId: string, since: number): Promise<Reaction[]> {
    const members = await redis.zRangeByScore(keys.reactions(gameId), since, '+inf')
    return members.map((m) => JSON.parse(m) as Reaction)
  },

  /**
   * Returns true if the player has sent a reaction within the throttle window.
   * The throttle key is set by `setThrottle` with a TTL of `REACTION_THROTTLE_MS`.
   */
  async isThrottled(gameId: string, playerId: string): Promise<boolean> {
    return Boolean(await redis.exists(keys.throttle(gameId, playerId)))
  },

  /**
   * Atomically claims the throttle slot for the given player.
   * Returns true if the slot was acquired (player may now send a reaction),
   * false if the player is already within the throttle window.
   * Uses Redis SET NX so the check-and-set is a single atomic operation,
   * preventing the race condition where two concurrent callers both pass an
   * isThrottled check before either has written the key.
   */
  async setThrottle(gameId: string, playerId: string): Promise<boolean> {
    const ttlSeconds = Math.ceil(REACTION_THROTTLE_MS / 1_000)
    const result = await redis.set(keys.throttle(gameId, playerId), '1', {
      EX: ttlSeconds,
      NX: true,
    })
    return result !== null
  },
}
