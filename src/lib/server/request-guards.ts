import type { Cookies } from '@sveltejs/kit'
import { error } from '@sveltejs/kit'

import { sessionRepository, turnRepository } from '$lib/server/repository'
import type { GameSession, Turn } from '$lib/server/repository/types'
import { getSessionId } from '$lib/server/session/session'

/**
 * Resolves the session from the request cookies.
 *
 * Throws:
 *   - 401  No session cookie present
 *   - 401  Session cookie does not match a known session in Redis
 */
export const requireSession = async (cookies: Cookies): Promise<GameSession> => {
  const sessionId = getSessionId(cookies)
  if (!sessionId) error(401, 'No session')

  const session = await sessionRepository.findById(sessionId)
  if (!session) error(401, 'Invalid session')

  return session
}

/**
 * Resolves the active turn for the session's game and verifies ownership.
 *
 * Throws:
 *   - 409  No turn is currently active for the game
 *   - 403  The active turn belongs to a different player
 *
 * Does NOT check turn status — callers are responsible for their own
 * status guard (e.g. `turn.status !== 'choosing'`).
 */
export const requireTurnForSession = async (session: GameSession): Promise<Turn> => {
  const turn = await turnRepository.findCurrentForGame(session.gameId)
  if (!turn) error(409, 'No active turn')
  if (turn.playerId !== session.playerId) error(403, 'Not your turn')

  return turn
}
