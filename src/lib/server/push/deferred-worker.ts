import { logger } from '$lib/server/logger'
import { redis } from '$lib/server/redis'

import { isPlayerActive } from './activity'
import { dispatchGameFinishedNotification, dispatchTurnNotification } from './notify'
import { takePendingNotification } from './pending'

const POLL_INTERVAL_MS = 30_000
const KEY_PREFIX = 'pending-notification:'

const parseKey = (redisKey: string): { gameId: string; playerId: string } | null => {
  const withoutPrefix = redisKey.slice(KEY_PREFIX.length)
  const colonIdx = withoutPrefix.indexOf(':')
  if (colonIdx === -1) return null
  return {
    gameId: withoutPrefix.slice(0, colonIdx),
    playerId: withoutPrefix.slice(colonIdx + 1),
  }
}

export const runOnce = async (): Promise<void> => {
  let cursor = '0'
  do {
    const result = await redis.scan(cursor, { MATCH: `${KEY_PREFIX}*`, COUNT: 100 })
    cursor = result.cursor
    for (const redisKey of result.keys) {
      const parsed = parseKey(redisKey)
      if (!parsed) continue
      const { gameId, playerId } = parsed
      if (await isPlayerActive(gameId, playerId)) continue
      const pending = await takePendingNotification(gameId, playerId)
      if (!pending) continue
      if (pending.type === 'turn') {
        await dispatchTurnNotification(playerId, pending.inviteCode, pending.baseUrl)
      } else {
        await dispatchGameFinishedNotification(
          playerId,
          pending.winnerName,
          pending.isWinner,
          pending.inviteCode,
          pending.baseUrl,
        )
      }
      logger.info({ gameId, playerId, type: pending.type }, 'Dispatched deferred notification')
    }
  } while (cursor !== '0')
}

let timer: ReturnType<typeof setInterval> | undefined

export const startDeferredWorker = (): void => {
  if (timer !== undefined) return
  timer = setInterval(() => {
    void runOnce()
  }, POLL_INTERVAL_MS)
  logger.info('Deferred push worker started')
}

export const stopDeferredWorker = (): void => {
  clearInterval(timer)
  timer = undefined
  logger.info('Deferred push worker stopped')
}
