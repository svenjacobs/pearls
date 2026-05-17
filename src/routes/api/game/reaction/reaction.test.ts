import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('$lib/server/repository', () => ({
  sessionRepository: { findById: vi.fn() },
  gameRepository: { findById: vi.fn() },
  reactionRepository: {
    setThrottle: vi.fn(),
    add: vi.fn(),
  },
}))

vi.mock('$lib/server/pubsub', () => ({
  publishGameEvent: vi.fn(),
}))

vi.mock('$lib/server/session/session', () => ({
  getSessionId: vi.fn(),
}))

import { publishGameEvent } from '$lib/server/pubsub'
import { gameRepository, reactionRepository, sessionRepository } from '$lib/server/repository'
import type { Game, GameSession } from '$lib/server/repository/types'
import { getSessionId } from '$lib/server/session/session'

import { POST } from './+server'

const sr = vi.mocked(sessionRepository)
const gr = vi.mocked(gameRepository)
const rr = vi.mocked(reactionRepository)
const pub = vi.mocked(publishGameEvent)
const gsi = vi.mocked(getSessionId)

const GAME_ID = 'game-1'
const PLAYER_ID = 'player-1'
const SESSION_ID = 'session-1'

const makeSession = (overrides?: Partial<GameSession>): GameSession => ({
  id: SESSION_ID,
  gameId: GAME_ID,
  playerId: PLAYER_ID,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
})

const makeGame = (overrides?: Partial<Game>): Game => ({
  id: GAME_ID,
  inviteCode: 'ABCD',
  status: 'playing',
  playerIds: [PLAYER_ID, 'player-2'],
  boards: {},
  staged: {},
  currentPlayerId: 'player-2',
  winnerId: null,
  createdAt: 0,
  updatedAt: 0,
  startedAt: 0,
  ...overrides,
})

const makeEvent = (body: unknown = { type: 'smile' }) =>
  ({
    cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), getAll: vi.fn() },
    request: new Request('http://localhost/api/game/reaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  }) as unknown as Parameters<typeof POST>[0]

beforeEach(() => {
  vi.clearAllMocks()
  gsi.mockReturnValue(SESSION_ID)
  sr.findById.mockResolvedValue(makeSession())
  gr.findById.mockResolvedValue(makeGame())
  rr.setThrottle.mockResolvedValue(true)
  rr.add.mockResolvedValue({
    id: 'reaction-1',
    gameId: GAME_ID,
    playerId: PLAYER_ID,
    type: 'smile',
    emoji: '🙂',
    at: Date.now(),
  })
  pub.mockResolvedValue(undefined)
})

// ── guards ────────────────────────────────────────────────────────────────────

describe('POST /api/game/reaction — guards', () => {
  it('returns 401 when no session cookie', async () => {
    gsi.mockReturnValue(null)
    await expect(POST(makeEvent())).rejects.toMatchObject({ status: 401 })
  })

  it('returns 401 when session is not found in the store', async () => {
    sr.findById.mockResolvedValue(null)
    await expect(POST(makeEvent())).rejects.toMatchObject({ status: 401 })
  })

  it('returns 400 when reaction type is an unknown string', async () => {
    await expect(POST(makeEvent({ type: 'unknown-emoji' }))).rejects.toMatchObject({ status: 400 })
  })

  it('returns 400 when reaction type is missing from the body', async () => {
    await expect(POST(makeEvent({}))).rejects.toMatchObject({ status: 400 })
  })

  it('returns 400 when reaction type is a number', async () => {
    await expect(POST(makeEvent({ type: 42 }))).rejects.toMatchObject({ status: 400 })
  })

  it('returns 409 when the game is not found', async () => {
    gr.findById.mockResolvedValue(null)
    await expect(POST(makeEvent())).rejects.toMatchObject({ status: 409 })
  })

  it('returns 429 when the player is within the throttle window', async () => {
    rr.setThrottle.mockResolvedValue(false)
    await expect(POST(makeEvent())).rejects.toMatchObject({ status: 429 })
  })
})

// ── success path ──────────────────────────────────────────────────────────────

describe('POST /api/game/reaction — success', () => {
  it('returns 204 No Content on a valid request', async () => {
    const res = await POST(makeEvent())
    expect(res.status).toBe(204)
  })

  it('accepts all 6 valid reaction types', async () => {
    const types = ['smile', 'frown', 'astonished', 'thumbs-up', 'tada', 'clap'] as const
    for (const type of types) {
      rr.add.mockResolvedValueOnce({
        id: 'r',
        gameId: GAME_ID,
        playerId: PLAYER_ID,
        type,
        emoji: '?',
        at: 0,
      })
      const res = await POST(makeEvent({ type }))
      expect(res.status).toBe(204)
    }
  })

  it('calls setThrottle before add to prevent race-condition double-sends', async () => {
    const calls: string[] = []
    rr.setThrottle.mockImplementation(async () => {
      calls.push('setThrottle')
      return true
    })
    rr.add.mockImplementation(async () => {
      calls.push('add')
      return { id: 'r', gameId: GAME_ID, playerId: PLAYER_ID, type: 'smile', emoji: '🙂', at: 0 }
    })

    await POST(makeEvent())

    expect(calls).toEqual(['setThrottle', 'add'])
  })

  it('publishes a reaction game event with the correct payload', async () => {
    await POST(makeEvent({ type: 'tada' }))

    expect(pub).toHaveBeenCalledOnce()
    expect(pub).toHaveBeenCalledWith(GAME_ID, {
      event: 'reaction',
      playerId: PLAYER_ID,
      type: 'smile', // from the mocked rr.add return value
      emoji: '🙂',
    })
  })

  it('calls reactionRepository.add with the correct arguments', async () => {
    await POST(makeEvent({ type: 'clap' }))

    expect(rr.add).toHaveBeenCalledOnce()
    expect(rr.add).toHaveBeenCalledWith(GAME_ID, PLAYER_ID, 'clap')
  })

  it('does not call add or publishGameEvent when throttled', async () => {
    rr.setThrottle.mockResolvedValue(false)
    await expect(POST(makeEvent())).rejects.toMatchObject({ status: 429 })
    expect(rr.add).not.toHaveBeenCalled()
    expect(pub).not.toHaveBeenCalled()
  })
})
