/**
 * Higher-level orchestration of turn lifecycle transitions that span multiple
 * repositories: ending a turn, advancing to the next player's turn, starting
 * the next turn for the same player after a cleared-row bonus, and restarting
 * a finished game.
 */

import { delay } from 'es-toolkit'

import { triggerAiIfNeeded } from '$lib/server/ai/runner'
import { MAX_PLAYERS, MIN_PLAYERS } from '$lib/server/game/constants'
import { computeScore, isBoardCleared } from '$lib/server/game/state'
import { publishGameEvent } from '$lib/server/pubsub'
import { gameRepository, playerRepository, turnRepository } from '$lib/server/repository'
import type { Game, Turn, TurnStatus } from '$lib/server/repository/types'

const autoVoteAiPlayers = async (gameId: string): Promise<void> => {
  const game = await gameRepository.findById(gameId)
  if (!game) return
  const players = await playerRepository.findManyByIds(game.playerIds)
  await Promise.all(
    players
      .filter((p): p is NonNullable<typeof p> => p !== null && (p.isAI ?? false))
      .map((p) => gameRepository.addRestartVote(gameId, p.id)),
  )
}

/**
 * Ends the current turn with `bust` or `completed`, advances to the next
 * player, and creates a fresh `rolling` turn for them. The next turn's index
 * is one greater than the ended turn's.
 */
export const endTurnAndAdvance = async (
  turn: Turn,
  status: Extract<TurnStatus, 'bust' | 'completed'>,
): Promise<void> => {
  await turnRepository.end(turn, status)
  await publishGameEvent(turn.gameId, { event: 'turn-ended', turnId: turn.id })

  const nextPlayerId = await gameRepository.nextPlayerId(turn.gameId, turn.playerId)
  if (!nextPlayerId) return

  await gameRepository.setCurrentPlayer(turn.gameId, nextPlayerId)
  await turnRepository.create(turn.gameId, nextPlayerId, turn.index + 1)
  void triggerAiIfNeeded(turn.gameId, nextPlayerId)
}

/**
 * Closes the current turn as completed and immediately starts a new turn for
 * the same player. Used after a cleared-row bonus: the player gets all 6 dice
 * back and may pick any new target.
 */
export const continueWithFreshTurn = async (turn: Turn): Promise<void> => {
  await turnRepository.end(turn, 'completed')
  await publishGameEvent(turn.gameId, { event: 'turn-ended', turnId: turn.id })
  await turnRepository.create(turn.gameId, turn.playerId, turn.index + 1)
  void triggerAiIfNeeded(turn.gameId, turn.playerId)
}

/**
 * Commits staged pearl removals to the board, then resolves the outcome:
 *
 *   - `'won'`         — board fully cleared, player wins.
 *   - `'cleared-row'` — target row hit 0, player gets a fresh turn.
 *   - `'completed'`   — normal end, advance to the next player.
 *
 * `setBoard` publishes a `board` SSE event internally, so callers do not
 * need to fire an extra event after this call.
 *
 * Pass `delayMs > 0` to insert a pause after the board update so players can
 * observe the committed state before the view transitions (e.g. cleared-row
 * bonus).
 */
export const commitAndAdvanceTurn = async (
  turn: Turn,
  board: number[],
  staged: number[],
  delayMs = 0,
): Promise<'won' | 'cleared-row' | 'completed'> => {
  const newBoard = board.map((count, i) => Math.max(0, count - (staged[i] ?? 0)))
  await Promise.all([
    gameRepository.setBoard(turn.gameId, turn.playerId, newBoard),
    gameRepository.setStaged(turn.gameId, turn.playerId, Array<number>(12).fill(0)),
  ])

  if (delayMs > 0) await delay(delayMs)

  if (isBoardCleared(newBoard)) {
    turn.status = 'completed'
    await turnRepository.save(turn)
    await gameRepository.setWinner(turn.gameId, turn.playerId)
    void autoVoteAiPlayers(turn.gameId)
    return 'won'
  }

  if (turn.target !== null && newBoard[turn.target - 1] === 0) {
    await continueWithFreshTurn(turn)
    return 'cleared-row'
  }

  await endTurnAndAdvance(turn, 'completed')
  return 'completed'
}

/**
 * Performs the actual game-start state transitions: sets status → playing,
 * assigns the first player, and creates the first Turn. No validation —
 * callers must ensure the game is in the `waiting` state with enough players.
 */
const beginGame = async (game: Game): Promise<void> => {
  const firstPlayerId = game.playerIds[0]
  await gameRepository.setStatus(game.id, 'playing')
  await gameRepository.setCurrentPlayer(game.id, firstPlayerId)
  await turnRepository.create(game.id, firstPlayerId, 0)
  void triggerAiIfNeeded(game.id, firstPlayerId)
}

/**
 * Starts the game if it has the required number of players and is still
 * `waiting`. Transitions status → playing, sets currentPlayerId to the first
 * player in turn order, and creates the first Turn.
 *
 * Called automatically when a player joins and fills the last available slot
 * (i.e. `playerIds.length === MAX_PLAYERS`).
 */
export const startGameIfReady = async (game: Game): Promise<void> => {
  if (game.status !== 'waiting') return
  if (game.playerIds.length < MAX_PLAYERS) return
  await beginGame(game)
}

/**
 * Manually starts a waiting game when triggered by a lobby player. Requires
 * at least `MIN_PLAYERS` — the game does not have to be full. Returns `false`
 * if the preconditions are not met (wrong status or too few players).
 */
export const startGameNow = async (game: Game): Promise<boolean> => {
  if (game.status !== 'waiting') return false
  if (game.playerIds.length < MIN_PLAYERS) return false
  await beginGame(game)
  return true
}

/**
 * Handles a player leaving an in-progress game.
 *
 * - Records a persistent `player-left` event and publishes it via pub/sub.
 * - If the leaving player held the active turn, that turn is forfeited and
 *   the next player in order takes over immediately.
 * - If only one player remains after the departure they win automatically.
 * - Works for any number of players ≥ 2.
 *
 * Must only be called when the game status is `'playing'`.
 */
export const handlePlayerLeave = async (gameId: string, leavingPlayerId: string): Promise<void> => {
  // Persist the event for replay before mutating state.
  await gameRepository.appendGameEvent(gameId, { event: 'player-left', playerId: leavingPlayerId })
  await publishGameEvent(gameId, { event: 'player-left', playerId: leavingPlayerId })

  // Determine the current turn and whether it belongs to the leaving player,
  // while the turn-order list still includes them (needed for nextPlayerId).
  const currentTurn = await turnRepository.findCurrentForGame(gameId)
  const isTheirTurn = currentTurn?.playerId === leavingPlayerId

  let nextPlayerId: string | null = null
  if (isTheirTurn) {
    nextPlayerId = await gameRepository.nextPlayerId(gameId, leavingPlayerId)
    // If wrap-around resolves back to the same player, there's only one
    // player — handled by the remaining-count check below.
    if (nextPlayerId === leavingPlayerId) nextPlayerId = null
  }

  // Remove from turn order. Their board/staged data stays for replay.
  await gameRepository.removePlayer(gameId, leavingPlayerId)

  // Reload to get accurate remaining count and player list.
  const game = await gameRepository.findById(gameId)
  const remainingIds = game?.playerIds ?? []
  const remainingPlayers = await playerRepository.findManyByIds(remainingIds)
  const humanCount = remainingPlayers.filter((p) => p !== null && !(p.isAI ?? false)).length

  // No humans left — abort the game entirely and clean up all Redis data.
  // AI-only games cannot progress (no one to vote for restart, no active session).
  if (humanCount === 0) {
    if (isTheirTurn && currentTurn) {
      await turnRepository.end(currentTurn, 'forfeited')
      await gameRepository.setCurrentTurn(gameId, null)
    }
    await Promise.all(
      remainingPlayers
        .filter((p): p is NonNullable<typeof p> => p !== null && (p.isAI ?? false))
        .map((p) => playerRepository.delete(p.id)),
    )
    if (game) await gameRepository.delete(game)
    return
  }

  const remainingCount = remainingIds.length

  if (remainingCount <= 1) {
    // Forfeit active turn if needed, then award the win to the sole survivor.
    if (isTheirTurn && currentTurn) {
      await turnRepository.end(currentTurn, 'forfeited')
      await gameRepository.setCurrentTurn(gameId, null)
    }
    const winnerId = game?.playerIds[0]
    if (winnerId) {
      await gameRepository.setWinner(gameId, winnerId)
      void autoVoteAiPlayers(gameId)
    } else {
      // No players left (shouldn't happen in practice).
      await gameRepository.setStatus(gameId, 'finished')
    }
    return
  }

  // Multiple players remain. Advance the turn only if it was the leaving
  // player's — otherwise the active turn continues uninterrupted.
  if (isTheirTurn && currentTurn) {
    await turnRepository.end(currentTurn, 'forfeited')
    if (nextPlayerId) {
      await gameRepository.setCurrentPlayer(gameId, nextPlayerId)
      await turnRepository.create(gameId, nextPlayerId, currentTurn.index + 1)
      void triggerAiIfNeeded(gameId, nextPlayerId)
    }
  }
}

/**
 * Starts a fresh game under the same invite code for all players from the
 * previous game. The new game is left in `waiting` status so the initiative
 * dice-off can determine the playing order before the game begins.
 *
 * Players are registered in score-ascending order (worst performer first,
 * winner last) as the initial roster; the actual turn order is overwritten
 * once initiative completes and the start button is pressed.
 *
 * - A new game ID is created, so old game data (`game:{oldId}`, turns, event
 *   log) survives intact for replay purposes.
 * - A `refresh` event is published on the **old** game's pub/sub channel so
 *   clients still subscribed there call `invalidateAll()` and load the new
 *   game via the same invite code.
 *
 * Must only be called when `oldGame.status === 'finished'` and
 * `oldGame.winnerId` is set.
 */
export const restartGame = async (oldGame: Game): Promise<Game> => {
  const winnerId = oldGame.winnerId!

  // Register players worst-to-best so natural join order is reasonable even
  // before initiative overrides it. Winner goes last.
  const losers = oldGame.playerIds
    .filter((id) => id !== winnerId)
    .sort((a, b) => computeScore(oldGame.boards[a] ?? []) - computeScore(oldGame.boards[b] ?? []))
  const newTurnOrder = [...losers, winnerId]

  // Create a new game — this overwrites the invite:{code} pointer atomically.
  const newGame = await gameRepository.create(oldGame.inviteCode)

  // Add players in computed order — single pipeline round-trip.
  await gameRepository.addPlayers(newGame.id, newTurnOrder)

  // Free Redis memory — old game data is no longer needed once clients reload.
  // skipInvite: invite:{code} already points to newGame; deleting it would break lookup.
  // NOTE: caller is responsible for publishing the refresh event AFTER all setup
  // (e.g. initiative) is complete, so clients never load a partially-initialised game.
  await gameRepository.delete(oldGame, { skipInvite: true })

  return (await gameRepository.findById(newGame.id))!
}
