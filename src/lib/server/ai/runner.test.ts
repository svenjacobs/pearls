import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('$lib/server/ai/strategy', () => ({
  chooseDiceForTarget: vi.fn(),
  chooseTarget: vi.fn(),
  randomDelay: vi.fn().mockReturnValue(0),
}))

vi.mock('$lib/server/game/service', () => ({
  performEndTurn: vi.fn(),
  performInitiativeRoll: vi.fn(),
  performRoll: vi.fn(),
  performSelect: vi.fn(),
}))

vi.mock('$lib/server/game/state', () => ({
  reachableTargets: vi.fn(),
}))

vi.mock('$lib/server/repository', () => ({
  gameRepository: {
    getBoardAndStaged: vi.fn(),
  },
  playerRepository: {
    findById: vi.fn(),
    findManyByIds: vi.fn(),
  },
  turnRepository: {
    findCurrentForGame: vi.fn(),
  },
}))

import { chooseDiceForTarget, chooseTarget } from '$lib/server/ai/strategy'
import {
  performEndTurn,
  performInitiativeRoll,
  performRoll,
  performSelect,
} from '$lib/server/game/service'
import { reachableTargets } from '$lib/server/game/state'
import { gameRepository, playerRepository, turnRepository } from '$lib/server/repository'
import type { GameInitiative, Turn } from '$lib/server/repository/types'

import { scheduleAiTurn, triggerAiIfNeeded, triggerAiInitiativeIfNeeded } from './runner'

const gr = vi.mocked(gameRepository)
const pr = vi.mocked(playerRepository)
const tr = vi.mocked(turnRepository)
const svcRoll = vi.mocked(performRoll)
const svcSelect = vi.mocked(performSelect)
const svcEnd = vi.mocked(performEndTurn)
const svcInitiative = vi.mocked(performInitiativeRoll)
const makePlayer = (id: string, isAI = false) => ({
  id,
  name: id,
  isAI: isAI || undefined,
  createdAt: 0,
  updatedAt: 0,
})

const makeTurn = (overrides?: Partial<Turn>): Turn => ({
  id: 'turn-1',
  gameId: 'game-1',
  playerId: 'ai-1',
  index: 0,
  target: null,
  dice: [],
  rolls: [],
  pearlsRemoved: 0,
  status: 'rolling',
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
})

const makeInitiative = (overrides?: Partial<GameInitiative>): GameInitiative => ({
  round: 1,
  rolls: {},
  activePlayerIds: [],
  playerOrder: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// ── triggerAiIfNeeded ─────────────────────────────────────────────────────────

describe('triggerAiIfNeeded', () => {
  it('does nothing when player is null', async () => {
    pr.findById.mockResolvedValue(null)
    await triggerAiIfNeeded('game-1', 'player-1')
    await vi.runAllTimersAsync()
    expect(tr.findCurrentForGame).not.toHaveBeenCalled()
  })

  it('does nothing when player is human', async () => {
    pr.findById.mockResolvedValue(makePlayer('player-1', false))
    await triggerAiIfNeeded('game-1', 'player-1')
    await vi.runAllTimersAsync()
    expect(tr.findCurrentForGame).not.toHaveBeenCalled()
  })

  it('starts turn runner when player.isAI is true', async () => {
    pr.findById.mockResolvedValue(makePlayer('ai-1', true))
    tr.findCurrentForGame.mockResolvedValue(null) // runner exits immediately
    await triggerAiIfNeeded('game-1', 'ai-1')
    await vi.runAllTimersAsync()
    expect(tr.findCurrentForGame).toHaveBeenCalledWith('game-1')
  })
})

// ── triggerAiInitiativeIfNeeded ───────────────────────────────────────────────

describe('triggerAiInitiativeIfNeeded', () => {
  it('does nothing when activePlayerIds is empty', async () => {
    await triggerAiInitiativeIfNeeded('game-1', makeInitiative({ activePlayerIds: [] }))
    await vi.runAllTimersAsync()
    expect(pr.findManyByIds).not.toHaveBeenCalled()
  })

  it('skips human players', async () => {
    pr.findManyByIds.mockResolvedValue([makePlayer('human-1', false)])
    await triggerAiInitiativeIfNeeded('game-1', makeInitiative({ activePlayerIds: ['human-1'] }))
    await vi.runAllTimersAsync()
    expect(svcInitiative).not.toHaveBeenCalled()
  })

  it('skips AI players who already rolled this round', async () => {
    pr.findManyByIds.mockResolvedValue([makePlayer('ai-1', true)])
    const initiative = makeInitiative({
      activePlayerIds: ['ai-1'],
      rolls: { 'ai-1': { value: 4, round: 1, locked: false } },
    })
    await triggerAiInitiativeIfNeeded('game-1', initiative)
    await vi.runAllTimersAsync()
    expect(svcInitiative).not.toHaveBeenCalled()
  })

  it('calls performInitiativeRoll for eligible AI player', async () => {
    pr.findManyByIds.mockResolvedValue([makePlayer('ai-1', true)])
    svcInitiative.mockResolvedValue(makeInitiative({ activePlayerIds: [] }))
    await triggerAiInitiativeIfNeeded('game-1', makeInitiative({ activePlayerIds: ['ai-1'] }))
    await vi.runAllTimersAsync()
    expect(svcInitiative).toHaveBeenCalledWith('game-1', 'ai-1')
  })

  it('triggers initiative rolls for multiple eligible AI players', async () => {
    pr.findManyByIds.mockResolvedValue([makePlayer('ai-1', true), makePlayer('ai-2', true)])
    svcInitiative.mockResolvedValue(makeInitiative({ activePlayerIds: [] }))
    await triggerAiInitiativeIfNeeded(
      'game-1',
      makeInitiative({ activePlayerIds: ['ai-1', 'ai-2'] }),
    )
    await vi.runAllTimersAsync()
    expect(svcInitiative).toHaveBeenCalledWith('game-1', 'ai-1')
    expect(svcInitiative).toHaveBeenCalledWith('game-1', 'ai-2')
  })
})

// ── scheduleAiTurn / runAiTurn ────────────────────────────────────────────────

describe('scheduleAiTurn / runAiTurn', () => {
  it('exits immediately when no current turn exists', async () => {
    tr.findCurrentForGame.mockResolvedValue(null)
    scheduleAiTurn('game-1', 'ai-1')
    await vi.runAllTimersAsync()
    expect(svcRoll).not.toHaveBeenCalled()
  })

  it('exits when current turn belongs to a different player', async () => {
    tr.findCurrentForGame.mockResolvedValue(makeTurn({ playerId: 'other' }))
    scheduleAiTurn('game-1', 'ai-1')
    await vi.runAllTimersAsync()
    expect(svcRoll).not.toHaveBeenCalled()
  })

  it.each(['completed', 'bust', 'forfeited'] as const)(
    'exits on terminal status: %s',
    async (status) => {
      tr.findCurrentForGame.mockResolvedValue(makeTurn({ status }))
      scheduleAiTurn('game-1', 'ai-1')
      await vi.runAllTimersAsync()
      expect(svcRoll).not.toHaveBeenCalled()
    },
  )

  it('calls performRoll when turn status is rolling', async () => {
    tr.findCurrentForGame.mockResolvedValue(makeTurn({ status: 'rolling' }))
    svcRoll.mockResolvedValue({ status: 'completed' })
    scheduleAiTurn('game-1', 'ai-1')
    await vi.runAllTimersAsync()
    expect(svcRoll).toHaveBeenCalledWith('game-1', 'ai-1')
  })

  it('calls performRoll when turn status is locked', async () => {
    tr.findCurrentForGame.mockResolvedValue(makeTurn({ status: 'locked' }))
    svcRoll.mockResolvedValue({ status: 'completed' })
    scheduleAiTurn('game-1', 'ai-1')
    await vi.runAllTimersAsync()
    expect(svcRoll).toHaveBeenCalledWith('game-1', 'ai-1')
  })

  it('calls performEndTurn after roll returns pending-end', async () => {
    tr.findCurrentForGame.mockResolvedValue(makeTurn({ status: 'rolling' }))
    svcRoll.mockResolvedValue({ status: 'pending-end' })
    svcEnd.mockResolvedValue('completed')
    scheduleAiTurn('game-1', 'ai-1')
    await vi.runAllTimersAsync()
    expect(svcEnd).toHaveBeenCalledWith('game-1', 'ai-1')
  })

  it.each(['won', 'cleared-row', 'completed'] as const)(
    'returns after roll result %s without further actions',
    async (status) => {
      tr.findCurrentForGame.mockResolvedValue(makeTurn({ status: 'rolling' }))
      svcRoll.mockResolvedValue({ status })
      scheduleAiTurn('game-1', 'ai-1')
      await vi.runAllTimersAsync()
      expect(svcRoll).toHaveBeenCalledOnce()
      expect(svcSelect).not.toHaveBeenCalled()
      expect(svcEnd).not.toHaveBeenCalled()
    },
  )

  it('calls performSelect when turn status is choosing', async () => {
    const board = Array<number>(12).fill(3)
    const staged = Array<number>(12).fill(0)
    tr.findCurrentForGame.mockResolvedValue(makeTurn({ status: 'choosing', dice: [] }))
    gr.getBoardAndStaged.mockResolvedValue([board, staged])
    vi.mocked(reachableTargets).mockReturnValue(new Set([4]))
    vi.mocked(chooseTarget).mockReturnValue(4)
    vi.mocked(chooseDiceForTarget).mockReturnValue([0, 1])
    svcSelect.mockResolvedValue({ status: 'completed' })
    scheduleAiTurn('game-1', 'ai-1')
    await vi.runAllTimersAsync()
    expect(svcSelect).toHaveBeenCalledWith('game-1', 'ai-1', 4, [0, 1])
  })

  it('uses locked turn.target directly without calling chooseTarget', async () => {
    const board = Array<number>(12).fill(3)
    const staged = Array<number>(12).fill(0)
    // target is already locked to 1 — chooseTarget must NOT be called
    tr.findCurrentForGame.mockResolvedValue(makeTurn({ status: 'choosing', dice: [], target: 1 }))
    gr.getBoardAndStaged.mockResolvedValue([board, staged])
    vi.mocked(chooseDiceForTarget).mockReturnValue([2])
    svcSelect.mockResolvedValue({ status: 'completed' })
    scheduleAiTurn('game-1', 'ai-1')
    await vi.runAllTimersAsync()
    expect(vi.mocked(chooseTarget)).not.toHaveBeenCalled()
    expect(vi.mocked(reachableTargets)).not.toHaveBeenCalled()
    expect(svcSelect).toHaveBeenCalledWith('game-1', 'ai-1', 1, [2])
  })

  it('exits on choosing when no targets are reachable', async () => {
    tr.findCurrentForGame.mockResolvedValue(makeTurn({ status: 'choosing', dice: [] }))
    gr.getBoardAndStaged.mockResolvedValue([Array<number>(12).fill(0), Array<number>(12).fill(0)])
    vi.mocked(reachableTargets).mockReturnValue(new Set())
    scheduleAiTurn('game-1', 'ai-1')
    await vi.runAllTimersAsync()
    expect(svcSelect).not.toHaveBeenCalled()
  })

  it('calls performEndTurn when turn status is pending-end', async () => {
    tr.findCurrentForGame.mockResolvedValue(makeTurn({ status: 'pending-end' }))
    svcEnd.mockResolvedValue('completed')
    scheduleAiTurn('game-1', 'ai-1')
    await vi.runAllTimersAsync()
    expect(svcEnd).toHaveBeenCalledWith('game-1', 'ai-1')
  })

  it('prevents concurrent runs for the same game+player', async () => {
    let resolveFirst!: (value: null) => void
    tr.findCurrentForGame.mockReturnValueOnce(
      new Promise<null>((res) => {
        resolveFirst = res
      }),
    )

    scheduleAiTurn('game-1', 'ai-1') // starts runner, awaits findCurrentForGame
    scheduleAiTurn('game-1', 'ai-1') // guard: active[key] is true → no-op

    resolveFirst(null) // first runner gets null → exits
    await vi.runAllTimersAsync()

    expect(tr.findCurrentForGame).toHaveBeenCalledOnce()
  })

  it('allows a new run after the previous one completes', async () => {
    tr.findCurrentForGame.mockResolvedValue(null)

    scheduleAiTurn('game-1', 'ai-1')
    await vi.runAllTimersAsync() // first run completes, active[key] deleted

    scheduleAiTurn('game-1', 'ai-1')
    await vi.runAllTimersAsync() // second run starts fresh

    expect(tr.findCurrentForGame).toHaveBeenCalledTimes(2)
  })
})
