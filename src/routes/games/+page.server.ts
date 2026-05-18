import { error, redirect } from '@sveltejs/kit'

import { resolve } from '$app/paths'
import { leaveGameSession } from '$lib/server/game/leave'
import { computeScore } from '$lib/server/game/state'
import { gameRepository, playerRepository, sessionRepository } from '$lib/server/repository'
import type { Game, GameSession, Player } from '$lib/server/repository/types'
import { getAllSessionIds } from '$lib/server/session/session'

import type { Actions, PageServerLoad } from './$types'

export type ActiveGameEntry = {
  sessionId: string
  inviteCode: string
  status: Game['status']
  player: Player
  playerNames: string[]
  board: number[]
  score: number
  startedAt: number | null
  updatedAt: number
}

export const load: PageServerLoad = async ({ cookies }) => {
  const sessionIds = getAllSessionIds(cookies)

  if (sessionIds.length === 0) return { games: [] as ActiveGameEntry[] }

  const sessions = await Promise.all(sessionIds.map((id) => sessionRepository.findById(id)))
  const validSessions = sessions.filter((s): s is GameSession => s !== null)

  const games = await Promise.all(validSessions.map((s) => gameRepository.findById(s.gameId)))

  const activeEntries = validSessions
    .map((session, i) => ({ session, game: games[i] }))
    .filter(
      (e): e is { session: GameSession; game: Game } =>
        e.game !== null && e.game.status !== 'finished',
    )

  const enriched: ActiveGameEntry[] = await Promise.all(
    activeEntries.map(async ({ session, game }) => {
      const [player, allPlayers] = await Promise.all([
        playerRepository.findById(session.playerId),
        playerRepository.findManyByIds(game.playerIds),
      ])
      if (!player) throw new Error(`Player ${session.playerId} not found`)
      const playerNames = allPlayers.filter(Boolean).map((p) => p!.name)
      const score = computeScore(game.boards[session.playerId] ?? [])
      return {
        sessionId: session.id,
        inviteCode: game.inviteCode,
        status: game.status,
        player,
        playerNames,
        board: game.boards[session.playerId] ?? new Array<number>(12).fill(7),
        score,
        startedAt: game.startedAt,
        updatedAt: game.updatedAt,
      }
    }),
  )

  // Sort by most recent game activity first.
  enriched.sort((a, b) => b.updatedAt - a.updatedAt)

  return { games: enriched }
}

export const actions: Actions = {
  leave: async ({ cookies, request }) => {
    const form = await request.formData()
    const sessionId = form.get('sessionId')
    if (typeof sessionId !== 'string') error(400)

    const session = await sessionRepository.findById(sessionId)
    if (session) {
      const game = await gameRepository.findById(session.gameId)
      await leaveGameSession(cookies, session, game)
    }
    redirect(302, resolve('/games'))
  },
}
