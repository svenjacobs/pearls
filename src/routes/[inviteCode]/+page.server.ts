import type { Cookies } from '@sveltejs/kit'
import { error, redirect } from '@sveltejs/kit'

import { resolve } from '$app/paths'
import { MAX_PLAYERS, MIN_PLAYERS } from '$lib/server/game/constants'
import { createInitiative } from '$lib/server/game/initiative'
import { leaveGameSession } from '$lib/server/game/leave'
import { computeScore } from '$lib/server/game/state'
import { restartGame, startGameNow } from '$lib/server/game/turn-flow'
import { inviteUrl } from '$lib/server/invite'
import { publishGameEvent } from '$lib/server/pubsub'
import {
  gameRepository,
  initiativeRepository,
  playerRepository,
  sessionRepository,
  turnRepository,
} from '$lib/server/repository'
import {
  addSession,
  getAllSessionIds,
  getSessionId,
  promoteSession,
  removeSession,
} from '$lib/server/session/session'

import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params, url, cookies }) => {
  const inviteCode = params.inviteCode.toUpperCase()
  const name = url.searchParams.get('name')?.trim()

  if (name) {
    const game =
      (await gameRepository.findByInviteCode(inviteCode)) ??
      (await gameRepository.create(inviteCode))

    // Reject join if game is full or no longer in the waiting state.
    if (game.status !== 'waiting' || game.playerIds.length >= MAX_PLAYERS) {
      redirect(302, resolve('/join/[inviteCode]', { inviteCode }))
    }

    const pearlTheme = url.searchParams.get('pearlTheme')?.trim() || undefined
    const player = await playerRepository.create(name, pearlTheme)
    await gameRepository.addPlayer(game.id, player.id)

    const session = await sessionRepository.create(game.id, player.id)
    addSession(cookies, session.id)

    // (Re-)create initiative for all current players. A late join resets
    // any rolling that has already happened so every player gets a fair roll.
    const updatedGame = await gameRepository.findById(game.id)
    if (updatedGame) {
      const newInitiative = createInitiative(updatedGame.playerIds)
      await initiativeRepository.save(game.id, newInitiative)
    }

    redirect(302, resolve('/[inviteCode]', { inviteCode }))
  }

  const game = await gameRepository.findByInviteCode(inviteCode)
  if (!game) error(404)

  // Find whichever session belongs to this game across all tracked sessions.
  const allSessionIds = getAllSessionIds(cookies)
  const allSessions = await Promise.all(allSessionIds.map((id) => sessionRepository.findById(id)))
  let session = allSessions.find((s) => s?.gameId === game.id) ?? null

  // Restart case: session still points to the previous finished game but the
  // player is in the new game — silently update the session so the load
  // function resolves correctly for both players on restart.
  if (!session) {
    const restartSession =
      allSessions.find((s) => s !== null && game.playerIds.includes(s.playerId)) ?? null
    if (restartSession) {
      restartSession.gameId = game.id
      await sessionRepository.save(restartSession)
      session = restartSession
    }
  }

  // Promote this game's session to primary so API routes see the right game.
  if (session && getSessionId(cookies) !== session.id) {
    promoteSession(cookies, session.id)
  }

  const player =
    session && session.gameId === game.id ? await playerRepository.findById(session.playerId) : null

  if (!player) error(404)

  const currentTurn = await turnRepository.findCurrentForGame(game.id)
  const winner = game.winnerId ? await playerRepository.findById(game.winnerId) : null

  // Resolve the player whose board the viewer should see. While the game is
  // playing this is the active player; otherwise the viewer sees themselves.
  const viewedPlayerId = currentTurn?.playerId ?? game.winnerId ?? player.id
  const viewedPlayer =
    viewedPlayerId === player.id
      ? player
      : ((await playerRepository.findById(viewedPlayerId)) ?? player)
  const isSpectator = viewedPlayer.id !== player.id

  // Fetch all opponents (every other player in the game).
  const opponentIds = game.playerIds.filter((id) => id !== player.id)
  const opponentResults = await playerRepository.findManyByIds(opponentIds)
  const opponents = opponentResults.filter((p): p is NonNullable<typeof p> => p !== null)

  // Scores per player: useful for the end-of-game banner. Lower is better.
  const scores: Record<string, number> = {}
  for (const pid of game.playerIds) {
    scores[pid] = computeScore(game.boards[pid] ?? [])
  }

  const [restartVoteCount, playerHasVotedRestart, initiative] =
    game.status === 'finished'
      ? await Promise.all([
          gameRepository.getRestartVoteCount(game.id),
          player ? gameRepository.hasRestartVote(game.id, player.id) : Promise.resolve(false),
          Promise.resolve(null),
        ])
      : await Promise.all([
          Promise.resolve(0),
          Promise.resolve(false),
          game.status === 'waiting'
            ? initiativeRepository.findByGameId(game.id)
            : Promise.resolve(null),
        ])

  return {
    dev: import.meta.env.DEV,
    inviteUrl: inviteUrl(inviteCode),
    inviteCode,
    status: game.status,
    player,
    opponents,
    isSpectator,
    playerCount: game.playerIds.length,
    maxPlayers: MAX_PLAYERS,
    minPlayers: MIN_PLAYERS,
    viewedPlayer,
    board: game.boards[viewedPlayer.id] ?? null,
    staged: game.staged[viewedPlayer.id] ?? null,
    currentTurn,
    scores,
    winner,
    restartVoteCount,
    playerHasVotedRestart,
    initiative,
  }
}

/** Finds the session in the player's cookie that corresponds to the given game. */
const findSessionForGame = async (cookies: Cookies, gameId: string) => {
  const sessionIds = getAllSessionIds(cookies)
  const sessions = await Promise.all(sessionIds.map((id) => sessionRepository.findById(id)))
  return sessions.find((s) => s?.gameId === gameId) ?? null
}

export const actions: Actions = {
  leave: async ({ cookies, params }) => {
    const inviteCode = params.inviteCode.toUpperCase()
    const game = await gameRepository.findByInviteCode(inviteCode)
    if (game) {
      const session = await findSessionForGame(cookies, game.id)
      if (session) {
        await leaveGameSession(cookies, session, game)
      }
    }
    redirect(302, resolve('/'))
  },

  abort: async ({ cookies, params }) => {
    const inviteCode = params.inviteCode.toUpperCase()
    const game = await gameRepository.findByInviteCode(inviteCode)
    if (game) {
      const session = await findSessionForGame(cookies, game.id)
      if (session && game.status === 'waiting') {
        if (game.playerIds.length <= 1) {
          await initiativeRepository.delete(game.id)
          await gameRepository.delete(game)
          await publishGameEvent(game.id, { event: 'refresh' })
        } else {
          await gameRepository.removePlayer(game.id, session.playerId)
          const remainingIds = game.playerIds.filter((id) => id !== session.playerId)
          await initiativeRepository.save(game.id, createInitiative(remainingIds))
          await publishGameEvent(game.id, { event: 'refresh' })
        }
        removeSession(cookies, session.id)
      }
    }
    redirect(302, resolve('/'))
  },

  startGame: async ({ cookies, params }) => {
    const inviteCode = params.inviteCode.toUpperCase()
    const game = await gameRepository.findByInviteCode(inviteCode)
    if (!game || game.status !== 'waiting')
      redirect(302, resolve('/[inviteCode]', { inviteCode: params.inviteCode }))

    const session = await findSessionForGame(cookies, game.id)
    if (!session) error(401)

    // Any player in the lobby may start the game once MIN_PLAYERS are present.
    if (!game.playerIds.includes(session.playerId)) error(403)

    // Initiative must be complete before the game can start.
    const initiative = await initiativeRepository.findByGameId(game.id)
    if (!initiative?.playerOrder) error(400, 'Initiative not complete')

    // Apply the determined playing order before handing off to the game engine.
    game.playerIds = initiative.playerOrder
    await gameRepository.save(game)

    await startGameNow(game)
    await publishGameEvent(game.id, { event: 'refresh' })
    // Redirect (POST/Redirect/GET) to strip ?/startGame from the URL.
    redirect(302, resolve('/[inviteCode]', { inviteCode: params.inviteCode }))
  },

  restart: async ({ cookies, params }) => {
    const inviteCode = params.inviteCode.toUpperCase()
    const game = await gameRepository.findByInviteCode(inviteCode)
    if (!game) error(404)

    const session = await findSessionForGame(cookies, game.id)
    if (!session) error(401)

    const oldGame = await gameRepository.findById(session.gameId)
    if (!oldGame || oldGame.status !== 'finished' || !oldGame.winnerId) error(400)

    const voteCount = await gameRepository.addRestartVote(oldGame.id, session.playerId)
    const allPlayers = await playerRepository.findManyByIds(oldGame.playerIds)
    const totalPlayers = allPlayers.filter((p) => p && !p.isAI).length

    if (voteCount >= totalPlayers) {
      // All players confirmed — start a fresh game with a new initiative phase.
      const newGame = await restartGame(oldGame)
      session.gameId = newGame.id
      await sessionRepository.save(session)
      // Save initiative BEFORE notifying clients so they never load a game
      // without a dice board.
      await initiativeRepository.save(newGame.id, createInitiative(newGame.playerIds))
      await publishGameEvent(oldGame.id, { event: 'refresh' })
    } else {
      // Not everyone has confirmed yet — let the other players know via SSE.
      await publishGameEvent(oldGame.id, { event: 'refresh' })
    }

    redirect(302, resolve('/[inviteCode]', { inviteCode: params.inviteCode }))
  },

  addAi: async ({ cookies, params }) => {
    const inviteCode = params.inviteCode.toUpperCase()
    const game = await gameRepository.findByInviteCode(inviteCode)
    if (!game || game.status !== 'waiting') error(409, 'Game not in waiting state')

    const session = await findSessionForGame(cookies, game.id)
    if (!session) error(401)
    if (!game.playerIds.includes(session.playerId)) error(403)
    if (game.playerIds.length >= MAX_PLAYERS) error(409, 'Game is full')

    const existingPlayers = await playerRepository.findManyByIds(game.playerIds)
    const existing = existingPlayers.filter((p): p is NonNullable<typeof p> => p !== null)
    const existingNames = existing.map((p) => p.name)
    const existingThemes = existing.flatMap((p) => (p.pearlTheme ? [p.pearlTheme] : []))

    const aiPlayer = await playerRepository.createAiPlayer(existingNames, existingThemes)
    await gameRepository.addPlayer(game.id, aiPlayer.id)

    const updatedGame = await gameRepository.findById(game.id)
    if (updatedGame) {
      await initiativeRepository.save(game.id, createInitiative(updatedGame.playerIds))
    }

    await publishGameEvent(game.id, { event: 'player-joined', playerId: aiPlayer.id })
    await publishGameEvent(game.id, { event: 'refresh' })

    redirect(302, resolve('/[inviteCode]', { inviteCode: params.inviteCode }))
  },

  removeAi: async ({ cookies, request, params }) => {
    const inviteCode = params.inviteCode.toUpperCase()
    const game = await gameRepository.findByInviteCode(inviteCode)
    if (!game || game.status !== 'waiting') error(409)

    const session = await findSessionForGame(cookies, game.id)
    if (!session) error(401)

    const formData = await request.formData()
    const aiPlayerId = formData.get('aiPlayerId')
    if (typeof aiPlayerId !== 'string') error(400)

    if (!game.playerIds.includes(session.playerId)) error(403)
    if (!game.playerIds.includes(aiPlayerId)) error(400, 'AI player not in game')

    const aiPlayer = await playerRepository.findById(aiPlayerId)
    if (!aiPlayer?.isAI) error(400, 'Not an AI player')

    await gameRepository.removePlayer(game.id, aiPlayerId)
    await playerRepository.delete(aiPlayerId)

    const remainingIds = game.playerIds.filter((id) => id !== aiPlayerId)
    if (remainingIds.length > 0) {
      await initiativeRepository.save(game.id, createInitiative(remainingIds))
    }

    await publishGameEvent(game.id, { event: 'refresh' })
    redirect(302, resolve('/[inviteCode]', { inviteCode: params.inviteCode }))
  },
}
