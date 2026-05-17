/**
 * Integration tests for gameRepository.
 *
 * Runs against a real Redis instance started by the testcontainers globalSetup.
 * Each test starts with a clean database (redis-flush.ts runs FLUSHALL beforeEach).
 */
import { describe, expect, it } from 'vitest'

import { MAX_PLAYERS } from '$lib/server/game/constants'
import { restartGame, startGameIfReady } from '$lib/server/game/turn-flow'
import { gameRepository } from '$lib/server/repository/game'

const TEST_INVITE_CODE = 'TESTCODE'
const PLAYER_A = 'player-a'
const PLAYER_B = 'player-b'

describe('gameRepository', () => {
  // ── create / findById ──────────────────────────────────────────────────────

  it('creates a game and retrieves it by id', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)

    expect(game.id).toBeTruthy()
    expect(game.inviteCode).toBe(TEST_INVITE_CODE)
    expect(game.status).toBe('waiting')
    expect(game.playerIds).toEqual([])
    expect(game.currentPlayerId).toBeNull()
    expect(game.winnerId).toBeNull()
    expect(game.startedAt).toBeNull()

    const found = await gameRepository.findById(game.id)
    expect(found).toMatchObject({ id: game.id, inviteCode: TEST_INVITE_CODE, status: 'waiting' })
    expect(found?.startedAt).toBeNull()
  })

  it('returns null for an unknown id', async () => {
    expect(await gameRepository.findById('nonexistent')).toBeNull()
  })

  it('finds a game by invite code', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    const found = await gameRepository.findByInviteCode(TEST_INVITE_CODE)
    expect(found?.id).toBe(game.id)
  })

  // ── addPlayer ─────────────────────────────────────────────────────────────

  it('adds players and reflects them in turn order', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(game.id, PLAYER_A)
    await gameRepository.addPlayer(game.id, PLAYER_B)

    const found = await gameRepository.findById(game.id)
    expect(found?.playerIds).toEqual([PLAYER_A, PLAYER_B])
  })

  it('initialises boards with 7 pearls per slot after addPlayer', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(game.id, PLAYER_A)

    const found = await gameRepository.findById(game.id)
    expect(found?.boards[PLAYER_A]).toEqual(Array(12).fill(7))
    expect(found?.staged[PLAYER_A]).toEqual(Array(12).fill(0))
  })

  // ── removePlayer ──────────────────────────────────────────────────────────

  it('removes a player from turn order', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(game.id, PLAYER_A)
    await gameRepository.addPlayer(game.id, PLAYER_B)
    await gameRepository.removePlayer(game.id, PLAYER_A)

    const found = await gameRepository.findById(game.id)
    expect(found?.playerIds).toEqual([PLAYER_B])
  })

  it('keeps board data after removal (for replay)', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(game.id, PLAYER_A)
    await gameRepository.removePlayer(game.id, PLAYER_A)

    const board = await gameRepository.getBoard(game.id, PLAYER_A)
    expect(board).toEqual(Array(12).fill(7))
  })

  // ── nextPlayerId ──────────────────────────────────────────────────────────

  it('returns next player in turn order, wrapping around', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(game.id, PLAYER_A)
    await gameRepository.addPlayer(game.id, PLAYER_B)

    expect(await gameRepository.nextPlayerId(game.id, PLAYER_A)).toBe(PLAYER_B)
    expect(await gameRepository.nextPlayerId(game.id, PLAYER_B)).toBe(PLAYER_A)
  })

  // ── setBoard / getBoard ───────────────────────────────────────────────────

  it('reads back an updated board', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(game.id, PLAYER_A)

    const board = Array(12).fill(7)
    board[0] = 5
    await gameRepository.setBoard(game.id, PLAYER_A, board)

    expect(await gameRepository.getBoard(game.id, PLAYER_A)).toEqual(board)
  })

  it('updates updatedAt when setBoard is called', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(game.id, PLAYER_A)
    const before = (await gameRepository.findById(game.id))!.updatedAt

    await new Promise<void>((r) => setTimeout(r, 5))
    await gameRepository.setBoard(game.id, PLAYER_A, Array<number>(12).fill(3))

    const after = (await gameRepository.findById(game.id))!.updatedAt
    expect(after).toBeGreaterThan(before)
  })

  it('updates updatedAt when setStaged is called', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(game.id, PLAYER_A)
    const before = (await gameRepository.findById(game.id))!.updatedAt

    await new Promise<void>((r) => setTimeout(r, 5))
    await gameRepository.setStaged(game.id, PLAYER_A, Array<number>(12).fill(1))

    const after = (await gameRepository.findById(game.id))!.updatedAt
    expect(after).toBeGreaterThan(before)
  })

  // ── setStatus / setCurrentPlayer / setWinner ──────────────────────────────

  it('transitions game through status changes', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(game.id, PLAYER_A)

    await gameRepository.setStatus(game.id, 'playing')
    await gameRepository.setCurrentPlayer(game.id, PLAYER_A)

    const playing = await gameRepository.findById(game.id)
    expect(playing?.status).toBe('playing')
    expect(playing?.currentPlayerId).toBe(PLAYER_A)
  })

  it('sets startedAt when transitioning to playing, leaves it unchanged on subsequent status changes', async () => {
    const before = Date.now()
    const game = await gameRepository.create(TEST_INVITE_CODE)
    expect(game.startedAt).toBeNull()

    await gameRepository.setStatus(game.id, 'playing')
    const after = Date.now()

    const playing = await gameRepository.findById(game.id)
    expect(playing?.startedAt).toBeGreaterThanOrEqual(before)
    expect(playing?.startedAt).toBeLessThanOrEqual(after)

    await gameRepository.setStatus(game.id, 'finished')
    const finished = await gameRepository.findById(game.id)
    expect(finished?.startedAt).toBe(playing?.startedAt)
  })

  it('updates updatedAt when setStatus is called', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    const before = game.updatedAt

    await new Promise<void>((r) => setTimeout(r, 5))
    await gameRepository.setStatus(game.id, 'playing')

    const after = (await gameRepository.findById(game.id))!.updatedAt
    expect(after).toBeGreaterThan(before)
  })

  it('updates updatedAt when setCurrentPlayer is called', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(game.id, PLAYER_A)
    const before = game.updatedAt

    await new Promise<void>((r) => setTimeout(r, 5))
    await gameRepository.setCurrentPlayer(game.id, PLAYER_A)

    const after = (await gameRepository.findById(game.id))!.updatedAt
    expect(after).toBeGreaterThan(before)
  })

  it('records winner and marks game finished', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(game.id, PLAYER_A)
    await gameRepository.setWinner(game.id, PLAYER_A)

    const finished = await gameRepository.findById(game.id)
    expect(finished?.status).toBe('finished')
    expect(finished?.winnerId).toBe(PLAYER_A)
    expect(finished?.currentPlayerId).toBeNull()
  })

  // ── appendGameEvent ───────────────────────────────────────────────────────

  it('persists game events to the event log', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)

    await gameRepository.appendGameEvent(game.id, { event: 'player-joined', playerId: PLAYER_A })
    await gameRepository.appendGameEvent(game.id, { event: 'player-left', playerId: PLAYER_A })

    // Read back via Redis directly to verify persistence
    const { redis } = await import('$lib/server/redis')
    const raw = await redis.lRange(`game:${game.id}:event-log`, 0, -1)
    expect(raw).toHaveLength(2)
    const first = JSON.parse(raw[0])
    expect(first.event).toBe('player-joined')
    expect(first.playerId).toBe(PLAYER_A)
    expect(typeof first.at).toBe('number')
  })

  // ── delete ────────────────────────────────────────────────────────────────

  it('removes all game keys on delete', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(game.id, PLAYER_A)
    await gameRepository.appendGameEvent(game.id, { event: 'player-joined', playerId: PLAYER_A })

    await gameRepository.delete(game)

    expect(await gameRepository.findById(game.id)).toBeNull()
    expect(await gameRepository.findByInviteCode(TEST_INVITE_CODE)).toBeNull()

    const { redis } = await import('$lib/server/redis')
    const logLen = await redis.lLen(`game:${game.id}:event-log`)
    expect(logLen).toBe(0)
  })

  it('delete removes the reactions key', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    const { redis } = await import('$lib/server/redis')
    await redis.zAdd(`game:${game.id}:reactions`, { score: Date.now(), value: 'test' })

    await gameRepository.delete(game)

    expect(await redis.zCard(`game:${game.id}:reactions`)).toBe(0)
  })

  it('delete also removes the initiative key', async () => {
    const game = await gameRepository.create('INITCODE')
    const { redis } = await import('$lib/server/redis')
    await redis.set(`game:${game.id}:initiative`, '{}')

    await gameRepository.delete(game)

    expect(await redis.exists(`game:${game.id}:initiative`)).toBe(0)
  })

  // ── addPlayers ────────────────────────────────────────────────────────────

  it('addPlayers inserts all players into turn order preserving input order', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayers(game.id, [PLAYER_A, PLAYER_B])

    const found = await gameRepository.findById(game.id)
    expect(found?.playerIds).toEqual([PLAYER_A, PLAYER_B])
  })

  it('addPlayers initialises boards for each player with 7 pearls per slot', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayers(game.id, [PLAYER_A, PLAYER_B])

    const found = await gameRepository.findById(game.id)
    expect(found?.boards[PLAYER_A]).toEqual(Array(12).fill(7))
    expect(found?.staged[PLAYER_A]).toEqual(Array(12).fill(0))
    expect(found?.boards[PLAYER_B]).toEqual(Array(12).fill(7))
  })

  it('addPlayers produces same result as sequential addPlayer calls', async () => {
    const game1 = await gameRepository.create('BATCH1')
    await gameRepository.addPlayers(game1.id, [PLAYER_A, PLAYER_B])

    const game2 = await gameRepository.create('BATCH2')
    await gameRepository.addPlayer(game2.id, PLAYER_A)
    await gameRepository.addPlayer(game2.id, PLAYER_B)

    const found1 = await gameRepository.findById(game1.id)
    const found2 = await gameRepository.findById(game2.id)
    expect(found1?.playerIds).toEqual(found2?.playerIds)
  })

  // ── getBoardAndStaged ─────────────────────────────────────────────────────

  it('getBoardAndStaged returns initial board and empty staged after addPlayer', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(game.id, PLAYER_A)

    const [board, staged] = await gameRepository.getBoardAndStaged(game.id, PLAYER_A)
    expect(board).toEqual(Array(12).fill(7))
    expect(staged).toEqual(Array(12).fill(0))
  })

  it('getBoardAndStaged reflects updates after setBoard and setStaged', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(game.id, PLAYER_A)

    const customBoard = Array<number>(12).fill(3)
    const customStaged = Array<number>(12).fill(1)
    await gameRepository.setBoard(game.id, PLAYER_A, customBoard)
    await gameRepository.setStaged(game.id, PLAYER_A, customStaged)

    const [board, staged] = await gameRepository.getBoardAndStaged(game.id, PLAYER_A)
    expect(board).toEqual(customBoard)
    expect(staged).toEqual(customStaged)
  })
})

// ─── restart flow ─────────────────────────────────────────────────────────────

const PLAYER_C = 'player-c'

describe('restart flow', () => {
  it('invite code pointer is reassigned to the new game after restart', async () => {
    const oldGame = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(oldGame.id, PLAYER_A)
    await gameRepository.addPlayer(oldGame.id, PLAYER_B)
    await gameRepository.setWinner(oldGame.id, PLAYER_A)

    const finishedGame = await gameRepository.findById(oldGame.id)
    const newGame = await restartGame(finishedGame!)

    const found = await gameRepository.findByInviteCode(TEST_INVITE_CODE)
    expect(found?.id).toBe(newGame.id)
    expect(found?.id).not.toBe(oldGame.id)
  })

  it('old game is deleted from Redis after restart to free memory', async () => {
    const oldGame = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(oldGame.id, PLAYER_A)
    await gameRepository.addPlayer(oldGame.id, PLAYER_B)
    await gameRepository.setWinner(oldGame.id, PLAYER_A)

    const finishedGame = await gameRepository.findById(oldGame.id)
    await restartGame(finishedGame!)

    expect(await gameRepository.findById(oldGame.id)).toBeNull()
  })

  it('2-player: sole loser goes first, winner goes last', async () => {
    const oldGame = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(oldGame.id, PLAYER_A)
    await gameRepository.addPlayer(oldGame.id, PLAYER_B)
    // Give PLAYER_B a lower score (more pearls remaining) — still the only loser.
    await gameRepository.setBoard(oldGame.id, PLAYER_B, Array(12).fill(6)) // score 78 (1 cleared per slot: Σ n for n=1..12)
    await gameRepository.setWinner(oldGame.id, PLAYER_A) // PLAYER_A wins

    const finishedGame = await gameRepository.findById(oldGame.id)
    const newGame = await restartGame(finishedGame!)

    expect(newGame.playerIds[0]).toBe(PLAYER_B) // loser goes first
    expect(newGame.playerIds[1]).toBe(PLAYER_A) // winner goes last
  })

  it('3-player: loser with lowest score goes first, winner goes last', async () => {
    const oldGame = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(oldGame.id, PLAYER_A) // winner
    await gameRepository.addPlayer(oldGame.id, PLAYER_B) // loser, better score
    await gameRepository.addPlayer(oldGame.id, PLAYER_C) // loser, worse score → goes first

    // PLAYER_A clears board (score 546, winner).
    await gameRepository.setBoard(oldGame.id, PLAYER_A, Array(12).fill(0))
    // PLAYER_B clears 5 slots (score 105: 7×(1+2+3+4+5)).
    await gameRepository.setBoard(oldGame.id, PLAYER_B, [...Array(12).fill(7).fill(0, 0, 5)])
    // PLAYER_C clears 2 slots (score 21: 7×(1+2), worst loser → starts next game).
    await gameRepository.setBoard(oldGame.id, PLAYER_C, [...Array(12).fill(7).fill(0, 0, 2)])
    await gameRepository.setWinner(oldGame.id, PLAYER_A)

    const finishedGame = await gameRepository.findById(oldGame.id)
    const newGame = await restartGame(finishedGame!)

    expect(newGame.playerIds[0]).toBe(PLAYER_C) // worst loser (score 21) goes first
    expect(newGame.playerIds[1]).toBe(PLAYER_B) // better loser (score 105) goes second
    expect(newGame.playerIds[2]).toBe(PLAYER_A) // winner goes last
  })

  it('new game has fresh boards initialised to 7 pearls per slot', async () => {
    const oldGame = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(oldGame.id, PLAYER_A)
    await gameRepository.addPlayer(oldGame.id, PLAYER_B)
    // Modify PLAYER_A's board to simulate a played game.
    await gameRepository.setBoard(oldGame.id, PLAYER_A, Array(12).fill(0))
    await gameRepository.setWinner(oldGame.id, PLAYER_A)

    const finishedGame = await gameRepository.findById(oldGame.id)
    const newGame = await restartGame(finishedGame!)

    expect(newGame.boards[PLAYER_A]).toEqual(Array(12).fill(7))
    expect(newGame.boards[PLAYER_B]).toEqual(Array(12).fill(7))
  })

  it('new game starts in waiting status for initiative dice-off', async () => {
    const oldGame = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(oldGame.id, PLAYER_A)
    await gameRepository.addPlayer(oldGame.id, PLAYER_B)
    await gameRepository.setWinner(oldGame.id, PLAYER_A)

    const finishedGame = await gameRepository.findById(oldGame.id)
    const newGame = await restartGame(finishedGame!)

    expect(newGame.status).toBe('waiting')
  })
})

// ─── restart vote tracking ────────────────────────────────────────────────────

describe('restart vote tracking', () => {
  it('addRestartVote returns 1 for the first voter', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    const count = await gameRepository.addRestartVote(game.id, PLAYER_A)
    expect(count).toBe(1)
  })

  it('addRestartVote is idempotent — the same player voting again still counts as 1', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addRestartVote(game.id, PLAYER_A)
    const count = await gameRepository.addRestartVote(game.id, PLAYER_A)
    expect(count).toBe(1)
  })

  it('getRestartVoteCount increments as distinct players vote', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    expect(await gameRepository.getRestartVoteCount(game.id)).toBe(0)
    await gameRepository.addRestartVote(game.id, PLAYER_A)
    expect(await gameRepository.getRestartVoteCount(game.id)).toBe(1)
    await gameRepository.addRestartVote(game.id, PLAYER_B)
    expect(await gameRepository.getRestartVoteCount(game.id)).toBe(2)
  })

  it('hasRestartVote returns false before voting, true after', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    expect(await gameRepository.hasRestartVote(game.id, PLAYER_A)).toBe(false)
    await gameRepository.addRestartVote(game.id, PLAYER_A)
    expect(await gameRepository.hasRestartVote(game.id, PLAYER_A)).toBe(true)
    expect(await gameRepository.hasRestartVote(game.id, PLAYER_B)).toBe(false)
  })

  it('clearRestartVotes resets the count to zero', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addRestartVote(game.id, PLAYER_A)
    await gameRepository.addRestartVote(game.id, PLAYER_B)
    await gameRepository.clearRestartVotes(game.id)
    expect(await gameRepository.getRestartVoteCount(game.id)).toBe(0)
    expect(await gameRepository.hasRestartVote(game.id, PLAYER_A)).toBe(false)
  })

  it('restartGame clears the restart votes of the old game', async () => {
    const oldGame = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(oldGame.id, PLAYER_A)
    await gameRepository.addPlayer(oldGame.id, PLAYER_B)
    await gameRepository.setWinner(oldGame.id, PLAYER_A)
    // Both players voted before restart is triggered.
    await gameRepository.addRestartVote(oldGame.id, PLAYER_A)
    await gameRepository.addRestartVote(oldGame.id, PLAYER_B)

    const finishedGame = await gameRepository.findById(oldGame.id)
    await restartGame(finishedGame!)

    expect(await gameRepository.getRestartVoteCount(oldGame.id)).toBe(0)
  })

  it('delete removes the restart votes key', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(game.id, PLAYER_A)
    await gameRepository.addRestartVote(game.id, PLAYER_A)

    await gameRepository.delete(game)

    expect(await gameRepository.getRestartVoteCount(game.id)).toBe(0)
  })

  it('consensus flow: game restarts only once all players have voted', async () => {
    const oldGame = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(oldGame.id, PLAYER_A)
    await gameRepository.addPlayer(oldGame.id, PLAYER_B)
    await gameRepository.setWinner(oldGame.id, PLAYER_A)
    const totalPlayers = 2

    // First vote — not enough yet.
    const count1 = await gameRepository.addRestartVote(oldGame.id, PLAYER_A)
    expect(count1).toBe(1)
    expect(count1).toBeLessThan(totalPlayers)

    // Second vote — all confirmed, trigger restart.
    const count2 = await gameRepository.addRestartVote(oldGame.id, PLAYER_B)
    expect(count2).toBe(totalPlayers)

    const finishedGame = await gameRepository.findById(oldGame.id)
    const newGame = await restartGame(finishedGame!)

    // New game is live, old votes are gone.
    expect(newGame.status).toBe('waiting')
    expect(await gameRepository.getRestartVoteCount(oldGame.id)).toBe(0)
    // The invite code now resolves to the new game.
    const found = await gameRepository.findByInviteCode(TEST_INVITE_CODE)
    expect(found?.id).toBe(newGame.id)
  })
})

// ── MAX_PLAYERS / game-full logic ─────────────────────────────────────────

describe('MAX_PLAYERS and game-full logic', () => {
  it(`startGameIfReady leaves game waiting when fewer than MAX_PLAYERS (${MAX_PLAYERS}) players`, async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    // Add one fewer than the maximum.
    for (let i = 0; i < MAX_PLAYERS - 1; i++) {
      await gameRepository.addPlayer(game.id, `player-${i}`)
    }
    const fresh = (await gameRepository.findById(game.id))!
    await startGameIfReady(fresh)

    const after = await gameRepository.findById(game.id)
    expect(after?.status).toBe('waiting')
  })

  it(`startGameIfReady starts the game when exactly MAX_PLAYERS (${MAX_PLAYERS}) players have joined`, async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    for (let i = 0; i < MAX_PLAYERS; i++) {
      await gameRepository.addPlayer(game.id, `player-${i}`)
    }
    const fresh = (await gameRepository.findById(game.id))!
    await startGameIfReady(fresh)

    const after = await gameRepository.findById(game.id)
    expect(after?.status).toBe('playing')
    expect(after?.currentPlayerId).toBe('player-0')
  })

  it('a waiting game with MAX_PLAYERS players satisfies the isFull condition', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    for (let i = 0; i < MAX_PLAYERS; i++) {
      await gameRepository.addPlayer(game.id, `player-${i}`)
    }
    const fresh = (await gameRepository.findById(game.id))!
    const isFull =
      fresh.status === 'playing' ||
      (fresh.status === 'waiting' && fresh.playerIds.length >= MAX_PLAYERS)
    expect(isFull).toBe(true)
  })

  it('a waiting game with fewer than MAX_PLAYERS players does not satisfy isFull', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(game.id, PLAYER_A)

    const fresh = (await gameRepository.findById(game.id))!
    const isFull =
      fresh.status === 'playing' ||
      (fresh.status === 'waiting' && fresh.playerIds.length >= MAX_PLAYERS)
    expect(isFull).toBe(false)
  })

  it('a playing game satisfies isFull regardless of player count', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(game.id, PLAYER_A)
    await gameRepository.setStatus(game.id, 'playing')

    const fresh = (await gameRepository.findById(game.id))!
    const isFull =
      fresh.status === 'playing' ||
      (fresh.status === 'waiting' && fresh.playerIds.length >= MAX_PLAYERS)
    expect(isFull).toBe(true)
  })

  it('restarted game starts in waiting status for initiative dice-off', async () => {
    const game = await gameRepository.create(TEST_INVITE_CODE)
    await gameRepository.addPlayer(game.id, PLAYER_A)
    await gameRepository.addPlayer(game.id, PLAYER_B)
    await gameRepository.setStatus(game.id, 'playing')
    await gameRepository.setWinner(game.id, PLAYER_A)

    const finishedGame = (await gameRepository.findById(game.id))!
    const newGame = await restartGame(finishedGame)

    // Restart always requires initiative dice-off before starting.
    expect(newGame.status).toBe('waiting')
  })
})
