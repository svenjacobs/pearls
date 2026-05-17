import { redis } from '$lib/server/redis'

export type PendingNotification =
  | { type: 'turn'; inviteCode: string; baseUrl: string }
  | {
      type: 'game-finished'
      winnerName: string
      isWinner: boolean
      inviteCode: string
      baseUrl: string
    }

const key = (gameId: string, playerId: string) => `pending-notification:${gameId}:${playerId}`

export const setPendingNotification = (
  gameId: string,
  playerId: string,
  notification: PendingNotification,
): void => {
  void redis.set(key(gameId, playerId), JSON.stringify(notification))
}

export const clearPendingNotification = (gameId: string, playerId: string): void => {
  void redis.del(key(gameId, playerId))
}

export const takePendingNotification = async (
  gameId: string,
  playerId: string,
): Promise<PendingNotification | null> => {
  const raw = await redis.getDel(key(gameId, playerId))
  if (!raw) return null
  return JSON.parse(raw) as PendingNotification
}
