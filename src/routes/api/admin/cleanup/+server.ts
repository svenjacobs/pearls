import { json } from '@sveltejs/kit'

import { env } from '$env/dynamic/private'
import { logger } from '$lib/server/logger'
import { cleanupRepository } from '$lib/server/repository/cleanup'

import type { RequestHandler } from './$types'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000

export const POST: RequestHandler = async ({ request }) => {
  logger.info('Cleanup requested')

  if (!env.CLEANUP_SECRET) {
    return new Response('Cleanup not configured', { status: 503 })
  }

  const auth = request.headers.get('Authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token || token !== env.CLEANUP_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const staleAfterMs = env.CLEANUP_STALE_GAME_DAYS
    ? Number(env.CLEANUP_STALE_GAME_DAYS) * 24 * 60 * 60 * 1_000
    : SEVEN_DAYS_MS

  const start = Date.now()
  const [games, sessions] = await Promise.all([
    cleanupRepository.deleteStaleGames(staleAfterMs),
    cleanupRepository.deleteOrphanedSessions(),
  ])

  const durationMs = Date.now() - start
  logger.info({ games, sessions, durationMs }, 'Cleanup completed')
  return json({ games, sessions, durationMs })
}
