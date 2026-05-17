import { redis } from '$lib/server/redis'

import type { GameInitiative } from './types'

const key = (gameId: string) => `game:${gameId}:initiative`

export const initiativeRepository = {
  async findByGameId(gameId: string): Promise<GameInitiative | null> {
    const raw = await redis.get(key(gameId))
    if (!raw) return null
    return JSON.parse(raw) as GameInitiative
  },

  async save(gameId: string, initiative: GameInitiative): Promise<void> {
    await redis.set(key(gameId), JSON.stringify(initiative))
  },

  async delete(gameId: string): Promise<void> {
    await redis.del(key(gameId))
  },
}
