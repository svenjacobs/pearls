import { redis } from '$lib/server/redis'

import { gameRepository } from './game'

export type CleanupResult = {
  deleted: number
  errors: number
}

export const cleanupRepository = {
  async deleteStaleGames(staleAfterMs: number): Promise<CleanupResult> {
    const threshold = Date.now() - staleAfterMs
    let deleted = 0
    let errors = 0

    for await (const keys of redis.scanIterator({ MATCH: 'game:*', TYPE: 'hash' })) {
      for (const key of keys) {
        try {
          const updatedAt = await redis.hGet(key, 'updatedAt')
          if (updatedAt === null || updatedAt === undefined) continue
          if (Number(updatedAt) > threshold) continue

          const id = key.slice('game:'.length)
          const game = await gameRepository.findById(id)
          if (!game) continue

          await gameRepository.delete(game)
          deleted++
        } catch {
          errors++
        }
      }
    }

    return { deleted, errors }
  },

  async deleteOrphanedSessions(): Promise<CleanupResult> {
    let deleted = 0
    let errors = 0

    for await (const keys of redis.scanIterator({ MATCH: 'session:*', TYPE: 'hash' })) {
      for (const key of keys) {
        try {
          const gameId = await redis.hGet(key, 'gameId')
          if (!gameId) {
            await redis.del(key)
            deleted++
            continue
          }
          const gameExists = await redis.exists(`game:${gameId}`)
          if (!gameExists) {
            await redis.del(key)
            deleted++
          }
        } catch {
          errors++
        }
      }
    }

    return { deleted, errors }
  },
}
