import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('$lib/server/ai/reactions', () => ({
  hasTripleRoll: vi.fn().mockReturnValue(false),
  triggerAiReactions: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('$lib/server/repository', () => ({
  gameRepository: {
    getBoardAndStaged: vi.fn(),
    setStaged: vi.fn(),
  },
  turnRepository: {
    findCurrentForGame: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('$lib/server/pubsub', () => ({
  publishGameEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('$lib/server/game/turn-flow', () => ({
  commitAndAdvanceTurn: vi.fn(),
}))

import { hasTripleRoll, triggerAiReactions } from '$lib/server/ai/reactions'
import { commitAndAdvanceTurn } from '$lib/server/game/turn-flow'
import { gameRepository, turnRepository } from '$lib/server/repository'
import type { Turn } from '$lib/server/repository/types'

import { performRoll, performSelect } from './service'

const gr = vi.mocked(gameRepository)
const tr = vi.mocked(turnRepository)
const ctf = vi.mocked(commitAndAdvanceTurn)
const aiReact = vi.mocked(triggerAiReactions)
const hrMock = vi.mocked(hasTripleRoll)

const makeTurn = (overrides?: Partial<Turn>): Turn => ({
  id: 'turn-1',
  gameId: 'game-1',
  playerId: 'player-1',
  index: 0,
  target: null,
  dice: Array(6)
    .fill(null)
    .map(() => ({ value: 0, status: 'in_cup' as const })),
  rolls: [],
  pearlsRemoved: 0,
  status: 'rolling' as const,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  tr.save.mockResolvedValue(undefined)
})

// ── performRoll — AI reactions ─────────────────────────────────────────────────

describe('performRoll — AI reactions', () => {
  it('fires perfect-roll and triple-roll when all 6 dice show the same value', async () => {
    const turn = makeTurn()
    tr.findCurrentForGame.mockResolvedValue(turn)
    gr.getBoardAndStaged.mockResolvedValue([Array<number>(12).fill(7), Array<number>(12).fill(0)])
    hrMock.mockReturnValue(true)
    // bytes fill(2) → (2 % 6) + 1 = 3 for all 6 dice; hasPerfectRoll([3×6]) = true
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
      ;(arr as Uint8Array).fill(2)
      return arr
    })

    await performRoll('game-1', 'player-1')

    expect(aiReact).toHaveBeenCalledWith('game-1', 'player-1', 'perfect-roll')
    expect(aiReact).toHaveBeenCalledWith('game-1', 'player-1', 'triple-roll')
  })

  it('fires triple-roll but not perfect-roll when 3 dice share a value but not a perfect roll', async () => {
    const turn = makeTurn()
    tr.findCurrentForGame.mockResolvedValue(turn)
    gr.getBoardAndStaged.mockResolvedValue([Array<number>(12).fill(7), Array<number>(12).fill(0)])
    hrMock.mockReturnValue(true)
    // bytes [2,2,2,0,1,3] → values [3,3,3,1,2,4]; hasPerfectRoll = false (no balanced pairs)
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
      ;(arr as Uint8Array).set([2, 2, 2, 0, 1, 3])
      return arr
    })

    await performRoll('game-1', 'player-1')

    expect(aiReact).toHaveBeenCalledWith('game-1', 'player-1', 'triple-roll')
    expect(aiReact).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), 'perfect-roll')
  })

  it('fires no reaction when dice have no triple and are not a perfect roll', async () => {
    const turn = makeTurn()
    tr.findCurrentForGame.mockResolvedValue(turn)
    gr.getBoardAndStaged.mockResolvedValue([Array<number>(12).fill(7), Array<number>(12).fill(0)])
    hrMock.mockReturnValue(false)
    // bytes [0,0,1,2,3,4] → values [1,1,2,3,4,5]; hasPerfectRoll = false
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
      ;(arr as Uint8Array).set([0, 0, 1, 2, 3, 4])
      return arr
    })

    await performRoll('game-1', 'player-1')

    expect(aiReact).not.toHaveBeenCalled()
  })

  it('fires cleared-row when locked target row is fully staged after roll', async () => {
    const turn = makeTurn({ target: 3, status: 'locked' })
    tr.findCurrentForGame.mockResolvedValue(turn)
    const board = Array<number>(12).fill(7)
    board[2] = 2
    const staged = Array<number>(12).fill(0)
    staged[2] = 2 // effectiveRemaining = 2 - 2 = 0
    gr.getBoardAndStaged.mockResolvedValue([board, staged])
    ctf.mockResolvedValue('cleared-row')
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
      ;(arr as Uint8Array).fill(0)
      return arr
    })

    await performRoll('game-1', 'player-1')

    expect(aiReact).toHaveBeenCalledWith('game-1', 'player-1', 'cleared-row')
  })

  it('does not fire cleared-row when commitAndAdvanceTurn returns won', async () => {
    const turn = makeTurn({ target: 3, status: 'locked' })
    tr.findCurrentForGame.mockResolvedValue(turn)
    const board = Array<number>(12).fill(7)
    board[2] = 2
    const staged = Array<number>(12).fill(0)
    staged[2] = 2
    gr.getBoardAndStaged.mockResolvedValue([board, staged])
    ctf.mockResolvedValue('won')
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
      ;(arr as Uint8Array).fill(0)
      return arr
    })

    await performRoll('game-1', 'player-1')

    expect(aiReact).not.toHaveBeenCalled()
  })

  it('fires no reaction when roll results in pending-end', async () => {
    const turn = makeTurn()
    tr.findCurrentForGame.mockResolvedValue(turn)
    // All board rows cleared → canFormAnyTarget = false → pending-end
    gr.getBoardAndStaged.mockResolvedValue([Array<number>(12).fill(0), Array<number>(12).fill(0)])
    hrMock.mockReturnValue(false)
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
      ;(arr as Uint8Array).fill(0)
      return arr
    })

    await performRoll('game-1', 'player-1')

    expect(aiReact).not.toHaveBeenCalled()
  })
})

// ── performSelect — AI reactions ───────────────────────────────────────────────

describe('performSelect — AI reactions', () => {
  it('fires high-value when target >= 7 and outcome is locked', async () => {
    const turn = makeTurn({
      status: 'choosing',
      dice: [
        { value: 3, status: 'active' },
        { value: 5, status: 'active' },
        { value: 0, status: 'in_cup' },
        { value: 0, status: 'in_cup' },
        { value: 0, status: 'in_cup' },
        { value: 0, status: 'in_cup' },
      ],
    })
    tr.findCurrentForGame.mockResolvedValue(turn)
    gr.getBoardAndStaged.mockResolvedValue([Array<number>(12).fill(7), Array<number>(12).fill(0)])
    gr.setStaged.mockResolvedValue(undefined)

    await performSelect('game-1', 'player-1', 8, [0, 1])

    expect(aiReact).toHaveBeenCalledWith('game-1', 'player-1', 'high-value')
  })

  it('does not fire high-value when target < 7', async () => {
    const turn = makeTurn({
      status: 'choosing',
      dice: [
        { value: 3, status: 'active' },
        { value: 0, status: 'in_cup' },
        { value: 0, status: 'in_cup' },
        { value: 0, status: 'in_cup' },
        { value: 0, status: 'in_cup' },
        { value: 0, status: 'in_cup' },
      ],
    })
    tr.findCurrentForGame.mockResolvedValue(turn)
    gr.getBoardAndStaged.mockResolvedValue([Array<number>(12).fill(7), Array<number>(12).fill(0)])
    gr.setStaged.mockResolvedValue(undefined)

    await performSelect('game-1', 'player-1', 3, [0])

    expect(aiReact).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), 'high-value')
  })

  it('fires cleared-row and not high-value when target >= 7 clears the row', async () => {
    const turn = makeTurn({
      status: 'choosing',
      dice: [
        { value: 3, status: 'active' },
        { value: 5, status: 'active' },
        { value: 0, status: 'in_cup' },
        { value: 0, status: 'in_cup' },
        { value: 0, status: 'in_cup' },
        { value: 0, status: 'in_cup' },
      ],
    })
    tr.findCurrentForGame.mockResolvedValue(turn)
    const board = Array<number>(12).fill(7)
    board[7] = 1 // slot 8 has exactly 1 pearl
    gr.getBoardAndStaged.mockResolvedValue([board, Array<number>(12).fill(0)])
    gr.setStaged.mockResolvedValue(undefined)
    ctf.mockResolvedValue('cleared-row')

    await performSelect('game-1', 'player-1', 8, [0, 1])

    expect(aiReact).toHaveBeenCalledWith('game-1', 'player-1', 'cleared-row')
    expect(aiReact).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), 'high-value')
  })

  it('does not fire cleared-row when commitAndAdvanceTurn returns won', async () => {
    const turn = makeTurn({
      status: 'choosing',
      dice: [
        { value: 3, status: 'active' },
        { value: 5, status: 'active' },
        { value: 0, status: 'in_cup' },
        { value: 0, status: 'in_cup' },
        { value: 0, status: 'in_cup' },
        { value: 0, status: 'in_cup' },
      ],
    })
    tr.findCurrentForGame.mockResolvedValue(turn)
    const board = Array<number>(12).fill(7)
    board[7] = 1
    gr.getBoardAndStaged.mockResolvedValue([board, Array<number>(12).fill(0)])
    gr.setStaged.mockResolvedValue(undefined)
    ctf.mockResolvedValue('won')

    await performSelect('game-1', 'player-1', 8, [0, 1])

    expect(aiReact).not.toHaveBeenCalled()
  })
})
