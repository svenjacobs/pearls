import type { Cookies } from '@sveltejs/kit'

import { handlePlayerLeave } from '$lib/server/game/turn-flow'
import type { Game, GameSession } from '$lib/server/repository/types'
import { removeSession } from '$lib/server/session/session'

export const leaveGameSession = async (
  cookies: Cookies,
  session: GameSession,
  game: Game | null,
): Promise<void> => {
  if (game?.status === 'playing') {
    await handlePlayerLeave(game.id, session.playerId)
  }
  removeSession(cookies, session.id)
}
