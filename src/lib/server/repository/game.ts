import { createId } from '@paralleldrive/cuid2'

import { MAX_PEARLS, SLOTS } from '$lib/server/game/constants'
import { type GameEvent, publishGameEvent } from '$lib/server/pubsub'
import { redis } from '$lib/server/redis'

import type { Game, GameStatus } from './types'
const INITIAL_BOARD = Array<number>(SLOTS).fill(MAX_PEARLS)
const INITIAL_STAGED = Array<number>(SLOTS).fill(0)

// ── Key helpers ───────────────────────────────────────────────────────────────

const keys = {
  game: (id: string) => `game:${id}`,
  turnOrder: (id: string) => `game:${id}:turn-order`,
  board: (gameId: string, playerId: string) => `game:${gameId}:board:${playerId}`,
  staged: (gameId: string, playerId: string) => `game:${gameId}:staged:${playerId}`,
  invite: (code: string) => `invite:${code}`,
  turns: (gameId: string) => `game:${gameId}:turns`,
  currentTurn: (gameId: string) => `game:${gameId}:current-turn`,
  eventLog: (gameId: string) => `game:${gameId}:event-log`,
  restartVotes: (gameId: string) => `game:${gameId}:restart-votes`,
  reactions: (gameId: string) => `game:${gameId}:reactions`,
  initiative: (id: string) => `game:${id}:initiative`,
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const encodeBoard = (board: number[]): string => JSON.stringify(board)
const decodeBoard = (raw: string | null): number[] =>
  raw ? (JSON.parse(raw) as number[]) : [...INITIAL_BOARD]

// ── Repository ────────────────────────────────────────────────────────────────

export const gameRepository = {
  /** Creates a new game with the given invite code, persists it, and returns it. */
  async create(inviteCode: string): Promise<Game> {
    const now = Date.now()
    const game: Game = {
      id: createId(),
      inviteCode,
      status: 'waiting',
      playerIds: [],
      boards: {},
      staged: {},
      currentPlayerId: null,
      winnerId: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
    }
    await this.save(game)
    return game
  },

  /**
   * Persists a new game to Redis. Creates the hash, invite-code reverse-lookup,
   * and initialises each player's board and staged state.
   */
  async save(game: Game): Promise<void> {
    const pipeline = redis.multi()

    pipeline.hSet(keys.game(game.id), {
      id: game.id,
      inviteCode: game.inviteCode,
      status: game.status,
      currentPlayerId: game.currentPlayerId ?? '',
      winnerId: game.winnerId ?? '',
      createdAt: String(game.createdAt),
      updatedAt: String(game.updatedAt),
      startedAt: game.startedAt != null ? String(game.startedAt) : '',
    })

    // Invite code → game ID reverse lookup
    pipeline.set(keys.invite(game.inviteCode), game.id)

    // Turn order
    if (game.playerIds.length > 0) {
      pipeline.del(keys.turnOrder(game.id))
      pipeline.rPush(keys.turnOrder(game.id), game.playerIds)
    }

    // Per-player boards and staged counts
    for (const playerId of game.playerIds) {
      const board = game.boards[playerId] ?? INITIAL_BOARD
      const staged = game.staged[playerId] ?? INITIAL_STAGED
      pipeline.set(keys.board(game.id, playerId), encodeBoard(board))
      pipeline.set(keys.staged(game.id, playerId), encodeBoard(staged))
    }

    await pipeline.exec()
  },

  /**
   * Retrieves the full game state, including all player boards and staged counts.
   * Returns null if the game does not exist.
   *
   * Uses two round-trips regardless of player count:
   *   1. Pipeline: hGetAll(game) + lRange(turnOrder)
   *   2. mGet: all board keys + all staged keys in one call
   */
  async findById(id: string): Promise<Game | null> {
    const pipeline = redis.multi()
    pipeline.hGetAll(keys.game(id))
    pipeline.lRange(keys.turnOrder(id), 0, -1)
    const [data, playerIds] = (await pipeline.exec()) as unknown as [
      Record<string, string>,
      string[],
    ]

    if (!data.id) return null

    const boards: Record<string, number[]> = {}
    const staged: Record<string, number[]> = {}

    if (playerIds.length > 0) {
      const allKeys = [
        ...playerIds.map((pid) => keys.board(id, pid)),
        ...playerIds.map((pid) => keys.staged(id, pid)),
      ]
      const allValues = await redis.mGet(allKeys)
      const boardValues = allValues.slice(0, playerIds.length)
      const stagedValues = allValues.slice(playerIds.length)
      for (let i = 0; i < playerIds.length; i++) {
        boards[playerIds[i]] = decodeBoard(boardValues[i])
        staged[playerIds[i]] = decodeBoard(stagedValues[i])
      }
    }

    return {
      id: data.id,
      inviteCode: data.inviteCode,
      status: data.status as GameStatus,
      currentPlayerId: data.currentPlayerId || null,
      winnerId: data.winnerId || null,
      playerIds,
      boards,
      staged,
      createdAt: Number(data.createdAt) || 0,
      updatedAt: Number(data.updatedAt) || 0,
      startedAt: data.startedAt ? Number(data.startedAt) : null,
    }
  },

  /** Looks up a game by invite code. Returns null if not found. */
  async findByInviteCode(code: string): Promise<Game | null> {
    const gameId = await redis.get(keys.invite(code.toUpperCase()))
    if (!gameId) return null
    return this.findById(gameId)
  },

  /** Updates the game status. Sets startedAt when transitioning to 'playing'. */
  async setStatus(id: string, status: GameStatus): Promise<void> {
    const now = Date.now()
    const fields: Record<string, string> = { status, updatedAt: String(now) }
    if (status === 'playing') fields.startedAt = String(now)
    await redis.hSet(keys.game(id), fields)
    await publishGameEvent(id, { event: 'status', status })
  },

  /** Sets the player whose turn it currently is. */
  async setCurrentPlayer(id: string, playerId: string | null): Promise<void> {
    await redis.hSet(keys.game(id), {
      currentPlayerId: playerId ?? '',
      updatedAt: String(Date.now()),
    })
    await publishGameEvent(id, { event: 'turn', currentPlayerId: playerId })
  },

  /** Records the winner and marks the game finished. */
  async setWinner(id: string, playerId: string): Promise<void> {
    await redis.hSet(keys.game(id), {
      status: 'finished',
      winnerId: playerId,
      currentPlayerId: '',
      updatedAt: String(Date.now()),
    })
    await redis.del(keys.currentTurn(id))
    await publishGameEvent(id, { event: 'game-finished', winnerId: playerId })
  },

  /** Adds a player to the game turn order and initialises their board. */
  async addPlayer(gameId: string, playerId: string): Promise<void> {
    const pipeline = redis.multi()
    pipeline.rPush(keys.turnOrder(gameId), playerId)
    pipeline.set(keys.board(gameId, playerId), encodeBoard(INITIAL_BOARD))
    pipeline.set(keys.staged(gameId, playerId), encodeBoard(INITIAL_STAGED))
    pipeline.hSet(keys.game(gameId), 'updatedAt', String(Date.now()))
    await pipeline.exec()
    await publishGameEvent(gameId, { event: 'player-joined', playerId })
  },

  /** Writes a player's board state. */
  async setBoard(gameId: string, playerId: string, board: number[]): Promise<void> {
    await Promise.all([
      redis.set(keys.board(gameId, playerId), encodeBoard(board)),
      redis.hSet(keys.game(gameId), 'updatedAt', String(Date.now())),
    ])
    await publishGameEvent(gameId, { event: 'board', playerId, board })
  },

  /** Reads a player's board state. */
  async getBoard(gameId: string, playerId: string): Promise<number[]> {
    return decodeBoard(await redis.get(keys.board(gameId, playerId)))
  },

  /** Writes a player's staged pearl counts. */
  async setStaged(gameId: string, playerId: string, staged: number[]): Promise<void> {
    await Promise.all([
      redis.set(keys.staged(gameId, playerId), encodeBoard(staged)),
      redis.hSet(keys.game(gameId), 'updatedAt', String(Date.now())),
    ])
    await publishGameEvent(gameId, { event: 'staged', playerId, staged })
  },

  /** Reads a player's staged pearl counts. */
  async getStaged(gameId: string, playerId: string): Promise<number[]> {
    return decodeBoard(await redis.get(keys.staged(gameId, playerId)))
  },

  /** Returns the next player in turn order, wrapping around. */
  async nextPlayerId(gameId: string, currentPlayerId: string): Promise<string | null> {
    const playerIds = await redis.lRange(keys.turnOrder(gameId), 0, -1)
    if (playerIds.length === 0) return null
    const idx = playerIds.indexOf(currentPlayerId)
    if (idx < 0) return playerIds[0]
    return playerIds[(idx + 1) % playerIds.length]
  },

  // ── Turn pointer / history ──────────────────────────────────────────────────

  /** Appends a turn ID to the game's turn history. */
  async appendTurn(gameId: string, turnId: string): Promise<void> {
    await Promise.all([
      redis.rPush(keys.turns(gameId), turnId),
      redis.hSet(keys.game(gameId), 'updatedAt', String(Date.now())),
    ])
  },

  /** Lists all turn IDs for a game in chronological order. */
  async listTurnIds(gameId: string): Promise<string[]> {
    return redis.lRange(keys.turns(gameId), 0, -1)
  },

  /** Sets the active turn pointer. */
  async setCurrentTurn(gameId: string, turnId: string | null): Promise<void> {
    await Promise.all([
      turnId ? redis.set(keys.currentTurn(gameId), turnId) : redis.del(keys.currentTurn(gameId)),
      redis.hSet(keys.game(gameId), 'updatedAt', String(Date.now())),
    ])
  },

  /** Reads the active turn pointer. */
  async getCurrentTurnId(gameId: string): Promise<string | null> {
    return redis.get(keys.currentTurn(gameId))
  },

  /**
   * Removes a player from the game's turn order. Their board and staged data
   * are intentionally kept for replay purposes.
   */
  async removePlayer(gameId: string, playerId: string): Promise<void> {
    await Promise.all([
      redis.lRem(keys.turnOrder(gameId), 0, playerId),
      redis.hSet(keys.game(gameId), 'updatedAt', String(Date.now())),
    ])
  },

  /**
   * Records a player's vote to restart the game.
   * Returns the total number of votes cast so far (including this one).
   */
  async addRestartVote(gameId: string, playerId: string): Promise<number> {
    await redis.sAdd(keys.restartVotes(gameId), playerId)
    return redis.sCard(keys.restartVotes(gameId))
  },

  /** Returns the number of players who have confirmed a restart. */
  async getRestartVoteCount(gameId: string): Promise<number> {
    return redis.sCard(keys.restartVotes(gameId))
  },

  /** Returns true if the given player has already voted to restart. */
  async hasRestartVote(gameId: string, playerId: string): Promise<boolean> {
    return Boolean(await redis.sIsMember(keys.restartVotes(gameId), playerId))
  },

  /** Removes the restart-vote set for a game. */
  async clearRestartVotes(gameId: string): Promise<void> {
    await redis.del(keys.restartVotes(gameId))
  },

  /**
   * Appends a timestamped game-level event to the persistent event log.
   * Unlike pub/sub events (which are ephemeral), the event log survives
   * server restarts and can drive replay functionality.
   */
  async appendGameEvent(gameId: string, event: GameEvent): Promise<void> {
    const entry = JSON.stringify({ ...event, at: Date.now() })
    await redis.rPush(keys.eventLog(gameId), entry)
  },

  /**
   * Adds multiple players to a game in a single pipeline, preserving the given
   * order in the turn-order list. Equivalent to sequential `addPlayer` calls
   * but uses one round-trip instead of N.
   */
  async addPlayers(gameId: string, playerIds: string[]): Promise<void> {
    if (playerIds.length === 0) return
    const pipeline = redis.multi()
    for (const playerId of playerIds) {
      pipeline.rPush(keys.turnOrder(gameId), playerId)
      pipeline.set(keys.board(gameId, playerId), encodeBoard(INITIAL_BOARD))
      pipeline.set(keys.staged(gameId, playerId), encodeBoard(INITIAL_STAGED))
    }
    pipeline.hSet(keys.game(gameId), 'updatedAt', String(Date.now()))
    await pipeline.exec()
    await Promise.all(
      playerIds.map((playerId) => publishGameEvent(gameId, { event: 'player-joined', playerId })),
    )
  },

  /** Reads a player's board and staged counts in a single mGet round-trip. */
  async getBoardAndStaged(gameId: string, playerId: string): Promise<[number[], number[]]> {
    const [boardRaw, stagedRaw] = await redis.mGet([
      keys.board(gameId, playerId),
      keys.staged(gameId, playerId),
    ])
    return [decodeBoard(boardRaw), decodeBoard(stagedRaw)]
  },

  /**
   * Deletes all Redis keys associated with a game.
   * Call this when a game ends to free memory.
   */
  async delete(game: Game, { skipInvite = false }: { skipInvite?: boolean } = {}): Promise<void> {
    const turnIds = await this.listTurnIds(game.id)
    const pipeline = redis.multi()
    pipeline.del(keys.game(game.id))
    if (!skipInvite) pipeline.del(keys.invite(game.inviteCode))
    pipeline.del(keys.turnOrder(game.id))
    pipeline.del(keys.turns(game.id))
    pipeline.del(keys.currentTurn(game.id))
    pipeline.del(keys.eventLog(game.id))
    pipeline.del(keys.restartVotes(game.id))
    pipeline.del(keys.reactions(game.id))
    pipeline.del(keys.initiative(game.id))
    for (const playerId of game.playerIds) {
      pipeline.del(keys.board(game.id, playerId))
      pipeline.del(keys.staged(game.id, playerId))
    }
    for (const turnId of turnIds) {
      pipeline.del(`turn:${turnId}`)
    }
    await pipeline.exec()
  },
}
