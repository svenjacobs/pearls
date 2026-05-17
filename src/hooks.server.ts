import type { Handle, ServerInit } from '@sveltejs/kit'

import { building } from '$app/environment'
import { env } from '$env/dynamic/private'
import { getTextDirection } from '$lib/paraglide/runtime'
import { paraglideMiddleware } from '$lib/paraglide/server'
import { logger } from '$lib/server/logger'
import {
  addGlobalGameHook,
  initSharedSubscriber,
  teardownSharedSubscriber,
} from '$lib/server/pubsub'
import { startDeferredWorker, stopDeferredWorker } from '$lib/server/push/deferred-worker'
import { notifyGameFinished, notifyPlayerTurn } from '$lib/server/push/notify'
import { connectRedis, disconnectRedis } from '$lib/server/redis'
import { gameRepository } from '$lib/server/repository'

const paraglideHandle: Handle = ({ event, resolve }) =>
  paraglideMiddleware(event.request, ({ request: localizedRequest, locale }) => {
    event.request = localizedRequest
    return resolve(event, {
      transformPageChunk: ({ html }) =>
        html.replace('%lang%', locale).replace('%dir%', getTextDirection(locale)),
    })
  })

export const init: ServerInit = async () => {
  if (building) return

  const REQUIRED_ENV = ['ORIGIN', 'REDIS_URL'] as const
  const missing = REQUIRED_ENV.filter((key) => !env[key])
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }

  await connectRedis()
  await initSharedSubscriber()
  logger.info('Server initialized')

  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT) {
    startDeferredWorker()
    addGlobalGameHook((gameId, event) => {
      if (event.event === 'turn' && event.currentPlayerId) {
        const playerId = event.currentPlayerId
        void (async () => {
          const game = await gameRepository.findById(gameId)
          if (!game) return
          await notifyPlayerTurn(gameId, playerId, game.inviteCode, env.ORIGIN)
        })()
      }
      if (event.event === 'game-finished') {
        const winnerId = event.winnerId
        void (async () => {
          const game = await gameRepository.findById(gameId)
          if (!game) return
          await notifyGameFinished(gameId, game.playerIds, winnerId, game.inviteCode, env.ORIGIN)
        })()
      }
    })
  }

  process.on('SIGTERM', async () => {
    stopDeferredWorker()
    await teardownSharedSubscriber()
    await disconnectRedis()
  })
}

export const handle: Handle = paraglideHandle
