import { createId } from '@paralleldrive/cuid2'

import { redis } from '$lib/server/redis'

import type { GameSession } from './types'

const key = (id: string) => `session:${id}`

export const sessionRepository = {
  /** Creates a new session for the given game and player, persists it, and returns it. */
  async create(gameId: string, playerId: string): Promise<GameSession> {
    const now = Date.now()
    const session: GameSession = {
      id: createId(),
      gameId,
      playerId,
      createdAt: now,
      updatedAt: now,
    }
    await this.save(session)
    return session
  },

  async save(session: GameSession): Promise<void> {
    await redis.hSet(key(session.id), {
      id: session.id,
      gameId: session.gameId,
      playerId: session.playerId,
      createdAt: String(session.createdAt),
      updatedAt: String(session.updatedAt),
    })
  },

  async findById(id: string): Promise<GameSession | null> {
    const data = await redis.hGetAll(key(id))
    if (!data.id) return null
    return {
      id: data.id,
      gameId: data.gameId,
      playerId: data.playerId,
      createdAt: Number(data.createdAt) || 0,
      updatedAt: Number(data.updatedAt) || 0,
    }
  },

  async delete(id: string): Promise<void> {
    await redis.del(key(id))
  },
}
