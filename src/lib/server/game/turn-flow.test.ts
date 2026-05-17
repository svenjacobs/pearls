import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MAX_PLAYERS, MIN_PLAYERS } from '$lib/server/game/constants'
import type { Game, Turn } from '$lib/server/repository/types'

vi.mock('$lib/server/repository', () => ({
  gameRepository: {
    nextPlayerId: vi.fn(),
    setCurrentPlayer: vi.fn(),
    setStatus: vi.fn(),
    setBoard: vi.fn(),
    setStaged: vi.fn(),
    setWinner: vi.fn(),
    setCurrentTurn: vi.fn(),
    appendGameEvent: vi.fn(),
    removePlayer: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    addPlayers: vi.fn(),
    delete: vi.fn(),
    addRestartVote: vi.fn(),
  },
  playerRepository: {
    findById: vi.fn(),
    findManyByIds: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
  },
  turnRepository: {
    end: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    findCurrentForGame: vi.fn(),
  },
}))

vi.mock('$lib/server/pubsub', () => ({
  publishGameEvent: vi.fn(),
}))

vi.mock('$lib/server/ai/runner', () => ({
  triggerAiIfNeeded: vi.fn().mockResolvedValue(undefined),
}))

import { publishGameEvent } from '$lib/server/pubsub'
import { gameRepository, playerRepository, turnRepository } from '$lib/server/repository'

import {
  commitAndAdvanceTurn,
  continueWithFreshTurn,
  endTurnAndAdvance,
  handlePlayerLeave,
  restartGame,
  startGameIfReady,
  startGameNow,
} from './turn-flow'

const gr = vi.mocked(gameRepository)
const tr = vi.mocked(turnRepository)
const pr = vi.mocked(playerRepository)

const makePlayer = (id: string, isAI = false) => ({
  id,
  name: id,
  isAI: isAI || undefined,
  createdAt: 0,
  updatedAt: 0,
})
const pub = vi.mocked(publishGameEvent)

const makeTurn = (overrides?: Partial<Turn>): Turn => ({
  id: 'turn-1',
  gameId: 'game-1',
  playerId: 'player-1',
  index: 0,
  target: null,
  dice: [],
  rolls: [],
  pearlsRemoved: 0,
  status: 'choosing',
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
})

const makeGame = (overrides?: Partial<Game>): Game => ({
  id: 'game-1',
  inviteCode: 'ABC123',
  status: 'waiting',
  playerIds: ['player-1', 'player-2'],
  boards: {},
  staged: {},
  currentPlayerId: null,
  winnerId: null,
  createdAt: 0,
  updatedAt: 0,
  startedAt: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── startGameIfReady ─────────────────────────────────────────────────────────

describe('startGameIfReady', () => {
  it('does nothing when game status is not waiting', async () => {
    const game = makeGame({ status: 'playing' })
    await startGameIfReady(game)
    expect(gr.setStatus).not.toHaveBeenCalled()
    expect(gr.setCurrentPlayer).not.toHaveBeenCalled()
    expect(tr.create).not.toHaveBeenCalled()
  })

  it(`does nothing when fewer than MAX_PLAYERS (${MAX_PLAYERS}) players are seated`, async () => {
    const game = makeGame({ playerIds: Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => `p${i}`) })
    await startGameIfReady(game)
    expect(gr.setStatus).not.toHaveBeenCalled()
    expect(gr.setCurrentPlayer).not.toHaveBeenCalled()
    expect(tr.create).not.toHaveBeenCalled()
  })

  it(`starts the game when exactly MAX_PLAYERS (${MAX_PLAYERS}) players are seated`, async () => {
    const game = makeGame({ playerIds: Array.from({ length: MAX_PLAYERS }, (_, i) => `p${i}`) })
    await startGameIfReady(game)
    expect(gr.setStatus).toHaveBeenCalledWith('game-1', 'playing')
    expect(gr.setCurrentPlayer).toHaveBeenCalledWith('game-1', 'p0')
    expect(tr.create).toHaveBeenCalledWith('game-1', 'p0', 0)
  })

  it('starts the game when more than MAX_PLAYERS players are seated', async () => {
    const game = makeGame({ playerIds: Array.from({ length: MAX_PLAYERS + 1 }, (_, i) => `p${i}`) })
    await startGameIfReady(game)
    expect(gr.setStatus).toHaveBeenCalledWith('game-1', 'playing')
  })
})

// ─── startGameNow ─────────────────────────────────────────────────────────────

describe('startGameNow', () => {
  it('returns false and does nothing when game is not waiting', async () => {
    const game = makeGame({ status: 'playing' })
    const result = await startGameNow(game)
    expect(result).toBe(false)
    expect(gr.setStatus).not.toHaveBeenCalled()
  })

  it(`returns false and does nothing when fewer than MIN_PLAYERS (${MIN_PLAYERS}) players are seated`, async () => {
    const game = makeGame({ playerIds: Array.from({ length: MIN_PLAYERS - 1 }, (_, i) => `p${i}`) })
    const result = await startGameNow(game)
    expect(result).toBe(false)
    expect(gr.setStatus).not.toHaveBeenCalled()
  })

  it(`returns true and starts the game with exactly MIN_PLAYERS (${MIN_PLAYERS}) players`, async () => {
    const game = makeGame({ playerIds: Array.from({ length: MIN_PLAYERS }, (_, i) => `p${i}`) })
    const result = await startGameNow(game)
    expect(result).toBe(true)
    expect(gr.setStatus).toHaveBeenCalledWith('game-1', 'playing')
    expect(gr.setCurrentPlayer).toHaveBeenCalledWith('game-1', 'p0')
    expect(tr.create).toHaveBeenCalledWith('game-1', 'p0', 0)
  })

  it('returns true and starts the game with more than MIN_PLAYERS but fewer than MAX_PLAYERS', async () => {
    const count = Math.ceil((MIN_PLAYERS + MAX_PLAYERS) / 2)
    const game = makeGame({ playerIds: Array.from({ length: count }, (_, i) => `p${i}`) })
    const result = await startGameNow(game)
    expect(result).toBe(true)
    expect(gr.setStatus).toHaveBeenCalledWith('game-1', 'playing')
  })
})

// ─── endTurnAndAdvance ────────────────────────────────────────────────────────

describe('endTurnAndAdvance', () => {
  it('ends the turn with the provided status', async () => {
    const turn = makeTurn()
    gr.nextPlayerId.mockResolvedValue('player-2')
    await endTurnAndAdvance(turn, 'bust')
    expect(tr.end).toHaveBeenCalledWith(turn, 'bust')
  })

  it('ends the turn with completed status', async () => {
    const turn = makeTurn()
    gr.nextPlayerId.mockResolvedValue('player-2')
    await endTurnAndAdvance(turn, 'completed')
    expect(tr.end).toHaveBeenCalledWith(turn, 'completed')
  })

  it('publishes turn-ended event with correct turnId', async () => {
    const turn = makeTurn({ id: 'turn-42' })
    gr.nextPlayerId.mockResolvedValue('player-2')
    await endTurnAndAdvance(turn, 'bust')
    expect(pub).toHaveBeenCalledWith('game-1', { event: 'turn-ended', turnId: 'turn-42' })
  })

  it('sets current player and creates new turn with index+1 when next player exists', async () => {
    const turn = makeTurn({ index: 3 })
    gr.nextPlayerId.mockResolvedValue('player-2')
    await endTurnAndAdvance(turn, 'completed')
    expect(gr.setCurrentPlayer).toHaveBeenCalledWith('game-1', 'player-2')
    expect(tr.create).toHaveBeenCalledWith('game-1', 'player-2', 4)
  })

  it('does nothing further when nextPlayerId returns null', async () => {
    const turn = makeTurn()
    gr.nextPlayerId.mockResolvedValue(null)
    await endTurnAndAdvance(turn, 'completed')
    expect(gr.setCurrentPlayer).not.toHaveBeenCalled()
    expect(tr.create).not.toHaveBeenCalled()
  })
})

// ─── continueWithFreshTurn ────────────────────────────────────────────────────

describe('continueWithFreshTurn', () => {
  it('ends the turn as completed', async () => {
    const turn = makeTurn()
    await continueWithFreshTurn(turn)
    expect(tr.end).toHaveBeenCalledWith(turn, 'completed')
  })

  it('publishes turn-ended event', async () => {
    const turn = makeTurn({ id: 'turn-7', gameId: 'game-2' })
    await continueWithFreshTurn(turn)
    expect(pub).toHaveBeenCalledWith('game-2', { event: 'turn-ended', turnId: 'turn-7' })
  })

  it('creates a new turn for the same player with index+1', async () => {
    const turn = makeTurn({ playerId: 'player-1', index: 5 })
    await continueWithFreshTurn(turn)
    expect(tr.create).toHaveBeenCalledWith('game-1', 'player-1', 6)
  })
})

// ─── commitAndAdvanceTurn ─────────────────────────────────────────────────────

describe('commitAndAdvanceTurn', () => {
  it('calculates newBoard correctly (board minus staged, clamped to 0)', async () => {
    const turn = makeTurn({ target: 1 })
    const board = [3, 5, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0]
    const staged = [2, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0] // slot 3: 2-5 should clamp to 0
    gr.nextPlayerId.mockResolvedValue('player-2')
    await commitAndAdvanceTurn(turn, board, staged, 0)
    expect(gr.setBoard).toHaveBeenCalledWith(
      'game-1',
      'player-1',
      [1, 5, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    )
  })

  it('calls setBoard and setStaged with zeros array', async () => {
    const turn = makeTurn({ target: 2 })
    const board = [0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const staged = [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    gr.nextPlayerId.mockResolvedValue('player-2')
    await commitAndAdvanceTurn(turn, board, staged, 0)
    expect(gr.setStaged).toHaveBeenCalledWith('game-1', 'player-1', Array(12).fill(0))
  })

  it('returns "won" and calls setWinner when board is fully cleared', async () => {
    const turn = makeTurn({ target: 1 })
    const board = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const staged = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const result = await commitAndAdvanceTurn(turn, board, staged, 0)
    expect(result).toBe('won')
    expect(tr.save).toHaveBeenCalled()
    expect(gr.setWinner).toHaveBeenCalledWith('game-1', 'player-1')
  })

  it('returns "cleared-row" when target row reaches 0 but board is not cleared', async () => {
    // target = 3 (1-based), board[2] = 2, staged[2] = 2 → slot 3 reaches 0, but slot 1 still has pearls
    const turn = makeTurn({ target: 3 })
    const board = [5, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const staged = [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const result = await commitAndAdvanceTurn(turn, board, staged, 0)
    expect(result).toBe('cleared-row')
    expect(tr.end).toHaveBeenCalledWith(turn, 'completed')
    expect(tr.create).toHaveBeenCalledWith('game-1', 'player-1', 1)
  })

  it('returns "completed" and calls endTurnAndAdvance for a normal end', async () => {
    // target = 2, board[1] still has pearls after staged removal
    const turn = makeTurn({ target: 2 })
    const board = [5, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const staged = [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    gr.nextPlayerId.mockResolvedValue('player-2')
    const result = await commitAndAdvanceTurn(turn, board, staged, 0)
    expect(result).toBe('completed')
    expect(tr.end).toHaveBeenCalledWith(turn, 'completed')
    expect(gr.setCurrentPlayer).toHaveBeenCalledWith('game-1', 'player-2')
  })
})

// ─── handlePlayerLeave ────────────────────────────────────────────────────────

describe('handlePlayerLeave', () => {
  it('always appends player-left event and publishes it', async () => {
    tr.findCurrentForGame.mockResolvedValue(null)
    gr.findById.mockResolvedValue(makeGame({ playerIds: ['player-2'] }))
    pr.findManyByIds.mockResolvedValue([makePlayer('player-2')])
    await handlePlayerLeave('game-1', 'player-1')
    expect(gr.appendGameEvent).toHaveBeenCalledWith('game-1', {
      event: 'player-left',
      playerId: 'player-1',
    })
    expect(pub).toHaveBeenCalledWith('game-1', { event: 'player-left', playerId: 'player-1' })
  })

  it('removes player and does not forfeit turn when it is not their turn', async () => {
    const otherPlayerTurn = makeTurn({ playerId: 'player-2' })
    tr.findCurrentForGame.mockResolvedValue(otherPlayerTurn)
    gr.findById.mockResolvedValue(makeGame({ playerIds: ['player-2'] }))
    pr.findManyByIds.mockResolvedValue([makePlayer('player-2')])
    await handlePlayerLeave('game-1', 'player-1')
    expect(gr.removePlayer).toHaveBeenCalledWith('game-1', 'player-1')
    expect(tr.end).not.toHaveBeenCalled()
    expect(gr.setCurrentPlayer).not.toHaveBeenCalled()
    expect(tr.create).not.toHaveBeenCalled()
  })

  it('forfeits turn and sets winner when it is their turn and one human player remains', async () => {
    const currentTurn = makeTurn({ playerId: 'player-1' })
    tr.findCurrentForGame.mockResolvedValue(currentTurn)
    gr.nextPlayerId.mockResolvedValue('player-2')
    gr.findById.mockResolvedValue(makeGame({ playerIds: ['player-2'] }))
    pr.findManyByIds.mockResolvedValue([makePlayer('player-2')])
    await handlePlayerLeave('game-1', 'player-1')
    expect(tr.end).toHaveBeenCalledWith(currentTurn, 'forfeited')
    expect(gr.setCurrentTurn).toHaveBeenCalledWith('game-1', null)
    expect(gr.setWinner).toHaveBeenCalledWith('game-1', 'player-2')
    expect(gr.setStatus).not.toHaveBeenCalled()
  })

  it('deletes game when zero players remain after last human leaves', async () => {
    const currentTurn = makeTurn({ playerId: 'player-1' })
    tr.findCurrentForGame.mockResolvedValue(currentTurn)
    gr.nextPlayerId.mockResolvedValue(null)
    const game = makeGame({ playerIds: [] })
    gr.findById.mockResolvedValue(game)
    pr.findManyByIds.mockResolvedValue([])
    await handlePlayerLeave('game-1', 'player-1')
    expect(tr.end).toHaveBeenCalledWith(currentTurn, 'forfeited')
    expect(gr.delete).toHaveBeenCalledWith(game)
    expect(gr.setStatus).not.toHaveBeenCalled()
    expect(gr.setWinner).not.toHaveBeenCalled()
  })

  it('aborts game and deletes AI players when last human leaves with AI remaining', async () => {
    const currentTurn = makeTurn({ playerId: 'player-1' })
    tr.findCurrentForGame.mockResolvedValue(currentTurn)
    gr.nextPlayerId.mockResolvedValue('ai-1')
    const game = makeGame({ playerIds: ['ai-1', 'ai-2'] })
    gr.findById.mockResolvedValue(game)
    pr.findManyByIds.mockResolvedValue([makePlayer('ai-1', true), makePlayer('ai-2', true)])
    await handlePlayerLeave('game-1', 'player-1')
    expect(tr.end).toHaveBeenCalledWith(currentTurn, 'forfeited')
    expect(pr.delete).toHaveBeenCalledWith('ai-1')
    expect(pr.delete).toHaveBeenCalledWith('ai-2')
    expect(gr.delete).toHaveBeenCalledWith(game)
    expect(gr.setWinner).not.toHaveBeenCalled()
  })

  it('forfeits turn and advances to next player when multiple humans remain', async () => {
    const currentTurn = makeTurn({ playerId: 'player-1', index: 2 })
    tr.findCurrentForGame.mockResolvedValue(currentTurn)
    gr.nextPlayerId.mockResolvedValue('player-2')
    gr.findById.mockResolvedValue(makeGame({ playerIds: ['player-2', 'player-3'] }))
    pr.findManyByIds.mockResolvedValue([makePlayer('player-2'), makePlayer('player-3')])
    await handlePlayerLeave('game-1', 'player-1')
    expect(tr.end).toHaveBeenCalledWith(currentTurn, 'forfeited')
    expect(gr.setCurrentPlayer).toHaveBeenCalledWith('game-1', 'player-2')
    expect(tr.create).toHaveBeenCalledWith('game-1', 'player-2', 3)
  })
})

// ─── restartGame ──────────────────────────────────────────────────────────────

// Helper boards for score-based ordering tests.
// computeScore = Σ (slot_number × cleared_pearls). Higher score = better performance.
// lowestBoard: slots 1–2 fully cleared → 1×7 + 2×7 = 21   → worst performer → goes first
// midBoard:    slots 1–5 fully cleared → 7×(1+2+3+4+5) = 105 → middle performer
// winnerBoard: all slots cleared       → 7×78 = 546          → winner
const lowestBoard = [...Array(12).fill(7).fill(0, 0, 2)] // score 21
const midBoard = [...Array(12).fill(7).fill(0, 0, 5)] // score 105
const winnerBoard = Array(12).fill(0) // score 546 (winner — all cleared)

describe('restartGame', () => {
  // ── 2-player ──────────────────────────────────────────────────────────────

  const finishedGame2P = makeGame({
    id: 'old-game',
    inviteCode: 'ABCDEF',
    status: 'finished',
    playerIds: ['player-1', 'player-2'],
    winnerId: 'player-1',
    boards: { 'player-1': winnerBoard, 'player-2': lowestBoard },
  })
  const newGame2P = makeGame({
    id: 'new-game',
    inviteCode: 'ABCDEF',
    status: 'waiting',
    playerIds: ['player-2', 'player-1'],
  })

  describe('2-player game', () => {
    beforeEach(() => {
      gr.create.mockResolvedValue(newGame2P)
      gr.addPlayers.mockResolvedValue(undefined)
      gr.findById.mockResolvedValue(newGame2P)
    })

    it('creates a new game with the same invite code', async () => {
      await restartGame(finishedGame2P)
      expect(gr.create).toHaveBeenCalledWith('ABCDEF')
    })

    it('places the sole loser first, winner last', async () => {
      await restartGame(finishedGame2P)
      expect(gr.addPlayers).toHaveBeenCalledWith('new-game', ['player-2', 'player-1'])
    })

    it('leaves the new game in waiting state (initiative determines turn order)', async () => {
      await restartGame(finishedGame2P)
      expect(gr.setStatus).not.toHaveBeenCalled()
      expect(gr.setCurrentPlayer).not.toHaveBeenCalled()
      expect(tr.create).not.toHaveBeenCalled()
    })

    it('does not publish refresh (caller handles it after initiative is saved)', async () => {
      await restartGame(finishedGame2P)
      expect(pub).not.toHaveBeenCalledWith('old-game', { event: 'refresh' })
    })

    it('deletes the old game (freeing Redis memory)', async () => {
      await restartGame(finishedGame2P)
      expect(gr.delete).toHaveBeenCalledWith(finishedGame2P, { skipInvite: true })
    })

    it('returns the new game', async () => {
      const result = await restartGame(finishedGame2P)
      expect(result.id).toBe('new-game')
    })
  })

  // ── 3-player: score-based ordering ────────────────────────────────────────

  // player-1 wins (score 546), player-3 has score 21 (worst → goes first),
  // player-2 has score 105 (middle → goes second), player-1 goes last.
  const finishedGame3P = makeGame({
    id: 'old-game-3p',
    inviteCode: 'XYZABC',
    status: 'finished',
    playerIds: ['player-1', 'player-2', 'player-3'],
    winnerId: 'player-1',
    boards: {
      'player-1': winnerBoard, // score 546 (winner)
      'player-2': midBoard, // score 105
      'player-3': lowestBoard, // score 21 — worst performer
    },
  })
  const newGame3P = makeGame({
    id: 'new-game-3p',
    inviteCode: 'XYZABC',
    status: 'waiting',
    playerIds: ['player-3', 'player-2', 'player-1'],
  })

  describe('3-player game — score-based loser ordering', () => {
    beforeEach(() => {
      gr.create.mockResolvedValue(newGame3P)
      gr.addPlayers.mockResolvedValue(undefined)
      gr.findById.mockResolvedValue(newGame3P)
    })

    it('places losers in ascending score order (worst performer first), winner last', async () => {
      await restartGame(finishedGame3P)
      // player-3 (score 21) → player-2 (score 105) → player-1 (winner, score 546)
      expect(gr.addPlayers).toHaveBeenCalledWith('new-game-3p', [
        'player-3',
        'player-2',
        'player-1',
      ])
    })

    it('leaves new game in waiting state (initiative determines turn order)', async () => {
      await restartGame(finishedGame3P)
      expect(gr.setCurrentPlayer).not.toHaveBeenCalled()
      expect(tr.create).not.toHaveBeenCalled()
    })

    it('does not publish refresh (caller handles it after initiative is saved)', async () => {
      await restartGame(finishedGame3P)
      expect(pub).not.toHaveBeenCalledWith('old-game-3p', { event: 'refresh' })
    })
  })
})
