import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('$lib/server/request-guards', () => ({ requireSession: vi.fn() }))
vi.mock('$lib/server/pubsub', () => ({ addGameListener: vi.fn() }))
vi.mock('$lib/server/push/activity', () => ({
  markPlayerActive: vi.fn(),
  markPlayerInactive: vi.fn(),
}))
vi.mock('$lib/server/push/pending', () => ({ clearPendingNotification: vi.fn() }))

import type { GameEvent } from '$lib/server/pubsub'
import { addGameListener } from '$lib/server/pubsub'
import { markPlayerActive, markPlayerInactive } from '$lib/server/push/activity'
import type { GameSession } from '$lib/server/repository/types'
import { requireSession } from '$lib/server/request-guards'

import { GET } from './+server'

const GAME_ID = 'game-1'
const PLAYER_ID = 'player-1'

const session: GameSession = {
  id: 'session-1',
  gameId: GAME_ID,
  playerId: PLAYER_ID,
  createdAt: 0,
  updatedAt: 0,
}

// The onEvent callback the endpoint registers via addGameListener — captured so
// tests can simulate published game events.
let emit: (event: GameEvent) => void
const removeListener = vi.fn()

const makeEvent = (headers?: Record<string, string>) =>
  ({
    cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), getAll: vi.fn() },
    request: new Request('http://localhost/api/game/events', { headers }),
  }) as unknown as Parameters<typeof GET>[0]

const decoder = new TextDecoder()
const readFrame = async (reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> => {
  const { value, done } = await reader.read()
  if (done || !value) throw new Error('stream closed unexpectedly')
  return decoder.decode(value)
}

// Resolve all pending microtasks so the async `start()` finishes registering.
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

// Read with a deadline — returns '__timeout__' if no frame arrives, used to
// assert the *absence* of further frames (coalescing).
const TIMEOUT = '__timeout__'
const readOrTimeout = (reader: ReadableStreamDefaultReader<Uint8Array>, ms: number) =>
  Promise.race([
    reader.read().then(({ value }) => (value ? decoder.decode(value) : TIMEOUT)),
    new Promise<string>((resolve) => setTimeout(() => resolve(TIMEOUT), ms)),
  ])

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireSession).mockResolvedValue(session)
  vi.mocked(addGameListener).mockImplementation(async (_gameId, onEvent) => {
    emit = onEvent
    return { remove: removeListener }
  })
})

describe('GET /api/game/events — stream setup', () => {
  it('responds with Server-Sent Events headers', async () => {
    const res = await GET(makeEvent())
    expect(res.headers.get('content-type')).toBe('text/event-stream')
    expect(res.headers.get('cache-control')).toBe('no-cache')
    expect(res.headers.get('x-accel-buffering')).toBe('no')
    await (res.body as ReadableStream<Uint8Array>).cancel()
  })

  it('marks the player active on connect', async () => {
    const res = await GET(makeEvent())
    await flush()
    expect(markPlayerActive).toHaveBeenCalledWith(GAME_ID, PLAYER_ID)
    await (res.body as ReadableStream<Uint8Array>).cancel()
  })

  it('flushes a refresh immediately when reconnecting (Last-Event-ID present)', async () => {
    const res = await GET(makeEvent({ 'last-event-id': '123' }))
    const reader = (res.body as ReadableStream<Uint8Array>).getReader()
    expect(await readFrame(reader)).toContain('event: refresh')
    await reader.cancel()
  })

  it('does not flush a refresh on a fresh connection', async () => {
    const res = await GET(makeEvent())
    await flush()
    const reader = (res.body as ReadableStream<Uint8Array>).getReader()
    expect(await readOrTimeout(reader, 30)).toBe(TIMEOUT)
    await reader.cancel()
  })
})

describe('GET /api/game/events — event delivery', () => {
  it('sends a refresh frame for a non-reaction game event', async () => {
    const res = await GET(makeEvent())
    await flush()
    const reader = (res.body as ReadableStream<Uint8Array>).getReader()

    emit({ event: 'turn-ended', turnId: 't1' })

    expect(await readFrame(reader)).toContain('event: refresh')
    await reader.cancel()
  })

  it('sends a reaction frame carrying the reaction payload', async () => {
    const res = await GET(makeEvent())
    await flush()
    const reader = (res.body as ReadableStream<Uint8Array>).getReader()

    const reaction: GameEvent = {
      event: 'reaction',
      playerId: PLAYER_ID,
      type: 'tada',
      emoji: '🎉',
    }
    emit(reaction)

    const frame = await readFrame(reader)
    expect(frame).toContain('event: reaction')
    expect(frame).toContain(JSON.stringify(reaction))
    await reader.cancel()
  })

  it('coalesces refreshes under backpressure (3 events → 2 frames)', async () => {
    const res = await GET(makeEvent())
    await flush()
    const reader = (res.body as ReadableStream<Uint8Array>).getReader()

    // Nothing has been read, so the queue backs up after the first frame.
    emit({ event: 'turn-rolled', turnId: 't1' })
    emit({ event: 'board', playerId: PLAYER_ID, board: [] })
    emit({ event: 'staged', playerId: PLAYER_ID, staged: [] })

    // One enqueued directly, one coalesced and flushed by pull() on drain.
    expect(await readFrame(reader)).toContain('event: refresh')
    expect(await readFrame(reader)).toContain('event: refresh')
    // No third frame — the middle/last events collapsed into one.
    expect(await readOrTimeout(reader, 30)).toBe(TIMEOUT)
    await reader.cancel()
  })

  it('emits a named heartbeat frame on the 25s interval', async () => {
    vi.useFakeTimers()
    try {
      const res = await GET(makeEvent())
      await vi.advanceTimersByTimeAsync(0)
      const reader = (res.body as ReadableStream<Uint8Array>).getReader()
      const pending = reader.read()
      await vi.advanceTimersByTimeAsync(25_000)
      const { value } = await pending
      expect(decoder.decode(value)).toContain('event: heartbeat')
      await reader.cancel()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('GET /api/game/events — teardown', () => {
  it('removes the listener and marks the player inactive on cancel', async () => {
    const res = await GET(makeEvent())
    await flush()
    await (res.body as ReadableStream<Uint8Array>).cancel()
    expect(removeListener).toHaveBeenCalledOnce()
    expect(markPlayerInactive).toHaveBeenCalledWith(GAME_ID, PLAYER_ID)
  })
})

afterEach(() => {
  vi.useRealTimers()
})
