import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('$lib/server/repository', () => ({
  sessionRepository: { findById: vi.fn() },
  gameRepository: { getBoardAndStaged: vi.fn() },
  turnRepository: { findCurrentForGame: vi.fn(), save: vi.fn() },
}))

vi.mock('$lib/server/pubsub', () => ({
  publishGameEvent: vi.fn(),
}))

vi.mock('$lib/server/session/session', () => ({
  getSessionId: vi.fn(),
}))

vi.mock('$lib/server/game/turn-flow', () => ({
  commitAndAdvanceTurn: vi.fn(),
  endTurnAndAdvance: vi.fn(),
}))

// Suppress fire-and-forget reactions triggered inside performRoll (service.ts).
vi.mock('$lib/server/ai/reactions', () => ({
  triggerAiReactions: vi.fn().mockResolvedValue(undefined),
  hasTripleRoll: vi.fn().mockReturnValue(false),
}))

import { commitAndAdvanceTurn } from '$lib/server/game/turn-flow'
import { publishGameEvent } from '$lib/server/pubsub'
import { gameRepository, sessionRepository, turnRepository } from '$lib/server/repository'
import type { Turn } from '$lib/server/repository/types'
import { getSessionId } from '$lib/server/session/session'

import { POST } from './+server'

const sr = vi.mocked(sessionRepository)
const gr = vi.mocked(gameRepository)
const tr = vi.mocked(turnRepository)
const pub = vi.mocked(publishGameEvent)
const gsi = vi.mocked(getSessionId)
const ctf = vi.mocked(commitAndAdvanceTurn)

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
  status: 'rolling',
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
})

const makeEvent = () =>
  ({
    cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), getAll: vi.fn() },
  }) as unknown as Parameters<typeof POST>[0]

beforeEach(() => {
  vi.clearAllMocks()
  gsi.mockReturnValue('session-1')
  sr.findById.mockResolvedValue({
    id: 'session-1',
    gameId: 'game-1',
    playerId: 'player-1',
    createdAt: 0,
    updatedAt: 0,
  })
  tr.save.mockResolvedValue(undefined)
  pub.mockResolvedValue(undefined)
})

// ─── guards ──────────────────────────────────────────────────────────────────

describe('POST /api/game/turn/roll — guards', () => {
  it('returns 401 when no session cookie', async () => {
    gsi.mockReturnValue(null)
    await expect(POST(makeEvent())).rejects.toMatchObject({ status: 401 })
  })

  it('returns 401 when session not found in store', async () => {
    sr.findById.mockResolvedValue(null)
    await expect(POST(makeEvent())).rejects.toMatchObject({ status: 401 })
  })

  it('returns 409 when no active turn exists', async () => {
    tr.findCurrentForGame.mockResolvedValue(null)
    await expect(POST(makeEvent())).rejects.toMatchObject({ status: 409 })
  })

  it('returns 409 when turn belongs to a different player', async () => {
    tr.findCurrentForGame.mockResolvedValue(makeTurn({ playerId: 'other-player' }))
    await expect(POST(makeEvent())).rejects.toMatchObject({ status: 409 })
  })

  it('returns 409 when turn status is not rolling or locked', async () => {
    tr.findCurrentForGame.mockResolvedValue(makeTurn({ status: 'choosing' }))
    await expect(POST(makeEvent())).rejects.toMatchObject({ status: 409 })
  })

  it('returns 409 when no dice remain in cup', async () => {
    const dice = Array(6)
      .fill(null)
      .map(() => ({ value: 3, status: 'spent' as const }))
    tr.findCurrentForGame.mockResolvedValue(makeTurn({ dice }))
    await expect(POST(makeEvent())).rejects.toMatchObject({ status: 409 })
  })
})

// ─── roll mechanics ───────────────────────────────────────────────────────────

describe('POST /api/game/turn/roll — roll mechanics', () => {
  it('derives die values from random bytes via (byte % 6) + 1', async () => {
    const turn = makeTurn()
    tr.findCurrentForGame.mockResolvedValue(turn)
    gr.getBoardAndStaged.mockResolvedValue([Array<number>(12).fill(7), Array<number>(12).fill(0)])
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
      ;(arr as Uint8Array).set([0, 1, 2, 3, 4, 5])
      return arr
    })

    await POST(makeEvent())

    expect(turn.dice.map((d) => d.value)).toEqual([1, 2, 3, 4, 5, 6])
    expect(turn.dice.every((d) => d.status === 'active')).toBe(true)
  })

  it('only rolls in_cup dice; spent dice are left unchanged', async () => {
    const dice = [
      { value: 5, status: 'spent' as const },
      { value: 5, status: 'spent' as const },
      { value: 0, status: 'in_cup' as const },
      { value: 0, status: 'in_cup' as const },
      { value: 0, status: 'in_cup' as const },
      { value: 0, status: 'in_cup' as const },
    ]
    const turn = makeTurn({ dice })
    tr.findCurrentForGame.mockResolvedValue(turn)
    gr.getBoardAndStaged.mockResolvedValue([Array<number>(12).fill(7), Array<number>(12).fill(0)])
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
      ;(arr as Uint8Array).fill(0)
      return arr
    })

    await POST(makeEvent())

    expect(turn.dice[0]).toEqual({ value: 5, status: 'spent' })
    expect(turn.dice[1]).toEqual({ value: 5, status: 'spent' })
    for (let i = 2; i <= 5; i++) {
      expect(turn.dice[i]).toEqual({ value: 1, status: 'active' })
    }
  })

  it('appends a roll record with correct index, values, and slots', async () => {
    const turn = makeTurn()
    tr.findCurrentForGame.mockResolvedValue(turn)
    gr.getBoardAndStaged.mockResolvedValue([Array<number>(12).fill(7), Array<number>(12).fill(0)])
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
      ;(arr as Uint8Array).fill(0)
      return arr
    })

    await POST(makeEvent())

    expect(turn.rolls).toHaveLength(1)
    expect(turn.rolls[0]).toMatchObject({
      index: 0,
      values: [1, 1, 1, 1, 1, 1],
      slots: [0, 1, 2, 3, 4, 5],
    })
  })

  it('roll index increments on subsequent rolls within the same turn', async () => {
    const turn = makeTurn({
      rolls: [{ index: 0, values: [3, 3], slots: [0, 1], at: 0 }],
      dice: [
        { value: 3, status: 'spent' as const },
        { value: 3, status: 'spent' as const },
        { value: 0, status: 'in_cup' as const },
        { value: 0, status: 'in_cup' as const },
        { value: 0, status: 'in_cup' as const },
        { value: 0, status: 'in_cup' as const },
      ],
      target: 3,
      status: 'locked' as const,
    })
    tr.findCurrentForGame.mockResolvedValue(turn)
    const board = Array<number>(12).fill(7)
    const staged = Array<number>(12).fill(0)
    gr.getBoardAndStaged.mockResolvedValue([board, staged])
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
      ;(arr as Uint8Array).fill(2) // byte 2 → (2%6)+1 = 3
      return arr
    })

    await POST(makeEvent())

    expect(turn.rolls[1]).toMatchObject({ index: 1, slots: [2, 3, 4, 5] })
  })
})

// ─── first-roll, no valid targets → pending-end ───────────────────────────────

describe('POST /api/game/turn/roll — first roll with no valid targets', () => {
  it('transitions to pending-end when all board rows are already cleared', async () => {
    const turn = makeTurn()
    tr.findCurrentForGame.mockResolvedValue(turn)
    gr.getBoardAndStaged.mockResolvedValue([Array<number>(12).fill(0), Array<number>(12).fill(0)])

    // All dice land on 1 (byte 0 → (0 % 6) + 1 = 1); board[0] === 0 so unreachable.
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
      ;(arr as Uint8Array).fill(0)
      return arr
    })

    const res = await POST(makeEvent())
    const body = await res.json()

    expect(body).toEqual({ ok: true, status: 'pending-end' })
    expect(turn.status).toBe('pending-end')
  })

  it('publishes turn-rolled then turn-pending-end in order', async () => {
    const turn = makeTurn()
    tr.findCurrentForGame.mockResolvedValue(turn)
    gr.getBoardAndStaged.mockResolvedValue([Array<number>(12).fill(0), Array<number>(12).fill(0)])
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
      ;(arr as Uint8Array).fill(0)
      return arr
    })

    await POST(makeEvent())

    expect(pub).toHaveBeenNthCalledWith(1, 'game-1', { event: 'turn-rolled', turnId: 'turn-1' })
    expect(pub).toHaveBeenNthCalledWith(2, 'game-1', {
      event: 'turn-pending-end',
      turnId: 'turn-1',
    })
  })

  it('saves turn twice: choosing after roll, then pending-end', async () => {
    const turn = makeTurn()
    const savedStatuses: string[] = []
    tr.findCurrentForGame.mockResolvedValue(turn)
    gr.getBoardAndStaged.mockResolvedValue([Array<number>(12).fill(0), Array<number>(12).fill(0)])
    tr.save.mockImplementation(async (t: Turn) => {
      savedStatuses.push(t.status)
    })
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
      ;(arr as Uint8Array).fill(0)
      return arr
    })

    await POST(makeEvent())

    expect(savedStatuses).toEqual(['choosing', 'pending-end'])
  })

  it('stays in choosing when at least one board row with matching dice is not yet cleared', async () => {
    const turn = makeTurn()
    tr.findCurrentForGame.mockResolvedValue(turn)
    const board = Array<number>(12).fill(0)
    board[0] = 3 // row 1 still has pearls; dice all show 1 → reachable
    gr.getBoardAndStaged.mockResolvedValue([board, Array<number>(12).fill(0)])
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
      ;(arr as Uint8Array).fill(0)
      return arr
    })

    const res = await POST(makeEvent())
    const body = await res.json()

    expect(body).toMatchObject({ ok: true, status: 'choosing' })
    expect(turn.status).toBe('choosing')
    expect(pub).not.toHaveBeenCalledWith(
      'game-1',
      expect.objectContaining({ event: 'turn-pending-end' }),
    )
  })
})

// ─── re-roll with locked target ───────────────────────────────────────────────

describe('POST /api/game/turn/roll — re-roll with locked target', () => {
  it('calls commitAndAdvanceTurn and returns its outcome when target row is fully staged', async () => {
    const turn = makeTurn({ target: 3, status: 'locked' })
    tr.findCurrentForGame.mockResolvedValue(turn)
    const board = Array<number>(12).fill(7)
    board[2] = 2
    const staged = Array<number>(12).fill(0)
    staged[2] = 2 // effectiveRemaining = 2 - 2 = 0
    gr.getBoardAndStaged.mockResolvedValue([board, staged])
    ctf.mockResolvedValue('completed')
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
      ;(arr as Uint8Array).fill(0)
      return arr
    })

    const res = await POST(makeEvent())
    const body = await res.json()

    expect(ctf).toHaveBeenCalledOnce()
    expect(body).toEqual({ ok: true, status: 'completed' })
  })

  it('transitions to pending-end when locked target cannot be formed from rolled dice', async () => {
    // target=3, all dice show 1 → cannot form 3
    const turn = makeTurn({ target: 3, status: 'locked' })
    tr.findCurrentForGame.mockResolvedValue(turn)
    gr.getBoardAndStaged.mockResolvedValue([Array<number>(12).fill(7), Array<number>(12).fill(0)])
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
      ;(arr as Uint8Array).fill(0) // all → 1
      return arr
    })

    const res = await POST(makeEvent())
    const body = await res.json()

    expect(body).toEqual({ ok: true, status: 'pending-end' })
    expect(turn.status).toBe('pending-end')
  })

  it('publishes turn-rolled then turn-pending-end when locked target cannot be formed', async () => {
    const turn = makeTurn({ target: 3, status: 'locked' })
    tr.findCurrentForGame.mockResolvedValue(turn)
    gr.getBoardAndStaged.mockResolvedValue([Array<number>(12).fill(7), Array<number>(12).fill(0)])
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
      ;(arr as Uint8Array).fill(0)
      return arr
    })

    await POST(makeEvent())

    expect(pub).toHaveBeenNthCalledWith(1, 'game-1', { event: 'turn-rolled', turnId: 'turn-1' })
    expect(pub).toHaveBeenNthCalledWith(2, 'game-1', {
      event: 'turn-pending-end',
      turnId: 'turn-1',
    })
  })

  it('saves turn twice when locked target cannot be formed: choosing then pending-end', async () => {
    const turn = makeTurn({ target: 3, status: 'locked' })
    const savedStatuses: string[] = []
    tr.findCurrentForGame.mockResolvedValue(turn)
    gr.getBoardAndStaged.mockResolvedValue([Array<number>(12).fill(7), Array<number>(12).fill(0)])
    tr.save.mockImplementation(async (t: Turn) => {
      savedStatuses.push(t.status)
    })
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
      ;(arr as Uint8Array).fill(0)
      return arr
    })

    await POST(makeEvent())

    expect(savedStatuses).toEqual(['choosing', 'pending-end'])
  })

  it('publishes turn-rolled exactly once when target row is fully staged', async () => {
    const turn = makeTurn({ target: 3, status: 'locked' })
    tr.findCurrentForGame.mockResolvedValue(turn)
    const board = Array<number>(12).fill(7)
    board[2] = 2
    const staged = Array<number>(12).fill(0)
    staged[2] = 2 // effectiveRemaining = 2 - 2 = 0
    gr.getBoardAndStaged.mockResolvedValue([board, staged])
    ctf.mockResolvedValue('completed')
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
      ;(arr as Uint8Array).fill(0)
      return arr
    })

    await POST(makeEvent())

    const turnRolledCalls = pub.mock.calls.filter(([, payload]) => payload.event === 'turn-rolled')
    expect(turnRolledCalls).toHaveLength(1)
  })

  it('saves turn exactly once in cleared-row path (no duplicate save)', async () => {
    const turn = makeTurn({ target: 3, status: 'locked' })
    tr.findCurrentForGame.mockResolvedValue(turn)
    const board = Array<number>(12).fill(7)
    board[2] = 2
    const staged = Array<number>(12).fill(0)
    staged[2] = 2
    gr.getBoardAndStaged.mockResolvedValue([board, staged])
    ctf.mockResolvedValue('completed')
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
      ;(arr as Uint8Array).fill(0)
      return arr
    })

    await POST(makeEvent())

    expect(tr.save).toHaveBeenCalledOnce()
  })

  it('stays in choosing when locked target can still be formed', async () => {
    // target=3, first die byte=2 → (2%6)+1=3 → canFormTarget(3) = true
    const turn = makeTurn({ target: 3, status: 'locked' })
    tr.findCurrentForGame.mockResolvedValue(turn)
    gr.getBoardAndStaged.mockResolvedValue([Array<number>(12).fill(7), Array<number>(12).fill(0)])
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((arr) => {
      const a = arr as Uint8Array
      a.fill(0)
      a[0] = 2 // first die → 3
      return arr
    })

    const res = await POST(makeEvent())
    const body = await res.json()

    expect(body).toEqual({ ok: true, status: 'choosing' })
    expect(turn.status).toBe('choosing')
    expect(pub).not.toHaveBeenCalledWith(
      'game-1',
      expect.objectContaining({ event: 'turn-pending-end' }),
    )
  })
})
