import { error } from '@sveltejs/kit'

import { REACTION_TYPES } from '$lib/reactions'
import { publishGameEvent } from '$lib/server/pubsub'
import { gameRepository, reactionRepository } from '$lib/server/repository'
import { requireSession } from '$lib/server/request-guards'

import type { RequestHandler } from './$types'

/**
 * POST /api/game/reaction
 *
 * Sends an emoji reaction from a spectator to the game session they are in.
 * The reaction is broadcast to all connected clients via SSE.
 *
 * Guards:
 * - 401  No session cookie or session not found
 * - 400  Reaction type is not one of the 6 allowed values
 * - 409  Game not found for the session
 * - 429  Player has sent a reaction within the throttle window (≈2 s)
 *
 * On success: 204 No Content
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
  const session = await requireSession(cookies)

  const body = await request.json().catch(() => ({}))
  const type = (body as Record<string, unknown>).type

  if (!REACTION_TYPES.includes(type as never)) error(400, 'Invalid reaction type')

  const game = await gameRepository.findById(session.gameId)
  if (!game) error(409, 'Game not found')

  const acquired = await reactionRepository.setThrottle(session.gameId, session.playerId)
  if (!acquired) error(429, 'Too many reactions')

  const reaction = await reactionRepository.add(session.gameId, session.playerId, type as never)

  await publishGameEvent(session.gameId, {
    event: 'reaction',
    playerId: reaction.playerId,
    type: reaction.type,
    emoji: reaction.emoji,
  })

  return new Response(null, { status: 204 })
}
