import { error, json } from '@sveltejs/kit'

import { SLOTS } from '$lib/server/game/constants'
import { gameRepository } from '$lib/server/repository'
import { requireSession } from '$lib/server/request-guards'

import type { RequestHandler } from './$types'

type Body = {
  target?: unknown
}

const CLEARED_BOARD = Array<number>(SLOTS).fill(0)

/**
 * POST /api/game/debug/force-win
 *
 * Instantly ends the game by zeroing a player's board and declaring them the
 * winner. Only available in development mode — returns 403 in production.
 *
 * Body: { target: 'me' | 'opponent' }
 *   'me'       — caller wins immediately
 *   'opponent' — opponent wins (caller loses)
 */
export const POST: RequestHandler = async ({ cookies, request }) => {
  if (!import.meta.env.DEV) error(403, 'Not available in production')

  const session = await requireSession(cookies)

  const body = (await request.json().catch(() => ({}))) as Body
  if (body.target !== 'me' && body.target !== 'opponent') {
    error(400, 'target must be "me" or "opponent"')
  }

  const game = await gameRepository.findById(session.gameId)
  if (!game) error(404, 'Game not found')
  if (game.status !== 'playing') error(409, 'Game is not in progress')

  const winnerId =
    body.target === 'me'
      ? session.playerId
      : (game.playerIds.find((id) => id !== session.playerId) ?? null)

  if (!winnerId) error(409, 'No opponent found')

  await Promise.all([
    gameRepository.setBoard(game.id, winnerId, CLEARED_BOARD),
    gameRepository.setStaged(game.id, winnerId, CLEARED_BOARD),
  ])
  await gameRepository.setWinner(game.id, winnerId)

  return json({ ok: true })
}
