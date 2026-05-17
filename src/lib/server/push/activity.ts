import { env } from '$env/dynamic/private'
import { redis } from '$lib/server/redis'

const INACTIVITY_SECONDS = parseInt(env.PUSH_INACTIVITY_SECONDS ?? '300', 10)
const key = (gameId: string, playerId: string) => `player-activity:${gameId}:${playerId}`

export const markPlayerActive = (gameId: string, playerId: string): void => {
  void redis.set(key(gameId, playerId), '1', { EX: INACTIVITY_SECONDS })
}

export const markPlayerInactive = (gameId: string, playerId: string): void => {
  void redis.del(key(gameId, playerId))
}

export const isPlayerActive = async (gameId: string, playerId: string): Promise<boolean> =>
  (await redis.exists(key(gameId, playerId))) === 1
