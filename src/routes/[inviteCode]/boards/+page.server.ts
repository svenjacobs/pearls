import { error } from '@sveltejs/kit'

import { computeScore } from '$lib/server/game/state'
import {
  gameRepository,
  playerRepository,
  sessionRepository,
  turnRepository,
} from '$lib/server/repository'
import { getAllSessionIds } from '$lib/server/session/session'

import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params, cookies }) => {
  const inviteCode = params.inviteCode.toUpperCase()

  const game = await gameRepository.findByInviteCode(inviteCode)
  if (!game) error(404)

  const allSessionIds = getAllSessionIds(cookies)
  const allSessions = await Promise.all(allSessionIds.map((id) => sessionRepository.findById(id)))
  const session = allSessions.find((s) => s?.gameId === game.id)
  if (!session) error(404)

  const playerResults = await playerRepository.findManyByIds(game.playerIds)
  const playerBoards = playerResults
    .map((player, i) => {
      if (!player) return null
      const id = game.playerIds[i]
      return {
        player,
        board: game.boards[id] ?? [],
        score: computeScore(game.boards[id] ?? []),
      }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => a.player.createdAt - b.player.createdAt)

  const currentTurn = await turnRepository.findCurrentForGame(game.id)

  return {
    inviteCode,
    playerBoards,
    currentPlayerId: session.playerId,
    activeTurnPlayerId: currentTurn?.playerId ?? null,
    lockedTarget: currentTurn?.target ?? null,
    gameStartedAt: game.startedAt ?? game.createdAt,
  }
}
