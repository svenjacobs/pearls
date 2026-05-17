// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { connectSse } from './sse'

class MockEventSource {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2

  readyState: number = MockEventSource.OPEN
  private handlers = new Map<string, Array<(e: Event) => void>>()

  constructor(public url: string) {
    MockEventSource.instances.push(this)
  }

  addEventListener(type: string, handler: (e: Event) => void): void {
    if (!this.handlers.has(type)) this.handlers.set(type, [])
    this.handlers.get(type)!.push(handler)
  }

  removeEventListener(type: string, handler: (e: Event) => void): void {
    const list = this.handlers.get(type)
    if (list)
      this.handlers.set(
        type,
        list.filter((h) => h !== handler),
      )
  }

  dispatch(type: string): void {
    this.handlers.get(type)?.forEach((h) => h(new Event(type)))
  }

  close(): void {
    this.readyState = MockEventSource.CLOSED
  }

  static instances: MockEventSource[] = []
  static reset(): void {
    MockEventSource.instances = []
  }
}

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

const fireVisibilityChange = () => document.dispatchEvent(new Event('visibilitychange'))

describe('connectSse', () => {
  beforeEach(() => {
    MockEventSource.reset()
    vi.stubGlobal('EventSource', MockEventSource)
    setVisibility('visible')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens EventSource immediately on connect', () => {
    const cleanup = connectSse('/api/game/events', vi.fn())
    expect(MockEventSource.instances).toHaveLength(1)
    expect(MockEventSource.instances[0].url).toBe('/api/game/events')
    cleanup()
  })

  it('calls onRefresh when refresh event fires', () => {
    const onRefresh = vi.fn()
    const cleanup = connectSse('/api/game/events', onRefresh)
    MockEventSource.instances[0].dispatch('refresh')
    expect(onRefresh).toHaveBeenCalledOnce()
    cleanup()
  })

  it('registers extra event listeners', () => {
    const onReaction = vi.fn()
    const cleanup = connectSse('/api/game/events', vi.fn(), { reaction: onReaction })
    MockEventSource.instances[0].dispatch('reaction')
    expect(onReaction).toHaveBeenCalledOnce()
    cleanup()
  })

  it('closes source and removes listener on cleanup', () => {
    const cleanup = connectSse('/api/game/events', vi.fn())
    const source = MockEventSource.instances[0]
    cleanup()
    expect(source.readyState).toBe(MockEventSource.CLOSED)
    // Firing visibilitychange after cleanup must not reconnect
    setVisibility('visible')
    fireVisibilityChange()
    expect(MockEventSource.instances).toHaveLength(1)
  })

  it('closes SSE when tab becomes hidden', () => {
    const cleanup = connectSse('/api/game/events', vi.fn())
    const source = MockEventSource.instances[0]
    expect(source.readyState).toBe(MockEventSource.OPEN)

    setVisibility('hidden')
    fireVisibilityChange()

    expect(source.readyState).toBe(MockEventSource.CLOSED)
    cleanup()
  })

  it('does not call onRefresh when tab becomes hidden', () => {
    const onRefresh = vi.fn()
    const cleanup = connectSse('/api/game/events', onRefresh)

    setVisibility('hidden')
    fireVisibilityChange()

    expect(onRefresh).not.toHaveBeenCalled()
    cleanup()
  })

  it('calls onRefresh and reconnects when tab becomes visible after hidden', () => {
    const onRefresh = vi.fn()
    const cleanup = connectSse('/api/game/events', onRefresh)

    setVisibility('hidden')
    fireVisibilityChange()
    expect(MockEventSource.instances[0].readyState).toBe(MockEventSource.CLOSED)

    setVisibility('visible')
    fireVisibilityChange()

    expect(onRefresh).toHaveBeenCalledOnce()
    expect(MockEventSource.instances).toHaveLength(2)
    cleanup()
  })

  it('calls onRefresh on visibility-visible even when source is already open', () => {
    const onRefresh = vi.fn()
    const cleanup = connectSse('/api/game/events', onRefresh)
    // source stays OPEN (no hidden transition)
    setVisibility('visible')
    fireVisibilityChange()
    expect(onRefresh).toHaveBeenCalledOnce()
    // no new EventSource created since readyState is OPEN
    expect(MockEventSource.instances).toHaveLength(1)
    cleanup()
  })
})
