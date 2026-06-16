import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('$lib/server/pubsub', () => ({ addGlobalGameHook: vi.fn() }))

import { addGlobalGameHook } from '$lib/server/pubsub'

import { GET } from './+server'

// The global hook the endpoint registers (only when the first client connects)
// and its removal spy — captured so tests can simulate published events and
// assert teardown.
let fireGlobalEvent: () => void
const removeGlobalHook = vi.fn()

const makeEvent = (headers?: Record<string, string>) =>
  ({
    request: new Request('http://localhost/api/status/events', { headers }),
  }) as unknown as Parameters<typeof GET>[0]

const decoder = new TextDecoder()
const readFrame = async (reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> => {
  const { value, done } = await reader.read()
  if (done || !value) throw new Error('stream closed unexpectedly')
  return decoder.decode(value)
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const TIMEOUT = '__timeout__'
const readOrTimeout = (reader: ReadableStreamDefaultReader<Uint8Array>, ms: number) =>
  Promise.race([
    reader.read().then(({ value }) => (value ? decoder.decode(value) : TIMEOUT)),
    new Promise<string>((resolve) => setTimeout(() => resolve(TIMEOUT), ms)),
  ])

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(addGlobalGameHook).mockImplementation((hook) => {
    // The status endpoint's hook ignores its args and fans out to all clients.
    fireGlobalEvent = () => hook('game-1', { event: 'refresh' })
    return removeGlobalHook
  })
})

describe('GET /api/status/events', () => {
  it('responds with Server-Sent Events headers', async () => {
    const res = await GET(makeEvent())
    expect(res.headers.get('content-type')).toBe('text/event-stream')
    expect(res.headers.get('x-accel-buffering')).toBe('no')
    await (res.body as ReadableStream<Uint8Array>).cancel()
  })

  it('flushes a heartbeat immediately on a fresh connection (no refresh)', async () => {
    // The first byte forces the response headers out so the browser fires `open`
    // right away instead of stalling until the first 25 s heartbeat — otherwise
    // the client would sit "reconnecting" for the whole interval.
    const res = await GET(makeEvent())
    const reader = (res.body as ReadableStream<Uint8Array>).getReader()
    const frame = await readFrame(reader)
    expect(frame).toContain('event: heartbeat')
    expect(frame).not.toContain('event: refresh')
    await reader.cancel()
  })

  it('flushes a refresh immediately when reconnecting (Last-Event-ID present)', async () => {
    const res = await GET(makeEvent({ 'last-event-id': '123' }))
    const reader = (res.body as ReadableStream<Uint8Array>).getReader()
    expect(await readFrame(reader)).toContain('event: refresh')
    await reader.cancel()
  })

  it('sends a refresh frame when a global game event fires', async () => {
    const res = await GET(makeEvent())
    await flush()
    const reader = (res.body as ReadableStream<Uint8Array>).getReader()
    expect(await readFrame(reader)).toContain('event: heartbeat') // initial flush

    fireGlobalEvent()

    expect(await readFrame(reader)).toContain('event: refresh')
    await reader.cancel()
  })

  it('coalesces refreshes under backpressure (3 events → 1 frame after heartbeat)', async () => {
    const res = await GET(makeEvent())
    await flush()
    const reader = (res.body as ReadableStream<Uint8Array>).getReader()

    // The initial heartbeat occupies the only queue slot, so all three events
    // back up behind it and coalesce.
    fireGlobalEvent()
    fireGlobalEvent()
    fireGlobalEvent()

    expect(await readFrame(reader)).toContain('event: heartbeat') // initial flush
    expect(await readFrame(reader)).toContain('event: refresh')
    expect(await readOrTimeout(reader, 30)).toBe(TIMEOUT)
    await reader.cancel()
  })

  it('removes the global hook when the last client disconnects', async () => {
    const res = await GET(makeEvent())
    await flush()
    await (res.body as ReadableStream<Uint8Array>).cancel()
    expect(removeGlobalHook).toHaveBeenCalledOnce()
  })
})
