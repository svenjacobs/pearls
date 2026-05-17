import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('notification', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const load = async () => {
    const mod = await import('./notification.svelte')
    return mod.notification
  }

  it('notify sets current with text and default type info', async () => {
    const n = await load()
    n.notify('hello')
    expect(n.current?.text).toBe('hello')
    expect(n.current?.type).toBe('info')
  })

  it('notify sets the given type', async () => {
    const n = await load()
    n.notify('oops', 'error')
    expect(n.current?.type).toBe('error')
  })

  it('notify assigns incrementing ids', async () => {
    const n = await load()
    n.notify('first')
    const id1 = n.current?.id
    n.notify('second')
    const id2 = n.current?.id
    expect(typeof id1).toBe('number')
    expect(typeof id2).toBe('number')
    expect(id2).toBeGreaterThan(id1 as number)
  })

  it('dismiss clears current immediately', async () => {
    const n = await load()
    n.notify('hi')
    expect(n.current).not.toBeNull()
    n.dismiss()
    expect(n.current).toBeNull()
  })

  it('auto-dismisses after duration', async () => {
    const n = await load()
    n.notify('bye', 'info', 1_000)
    expect(n.current).not.toBeNull()
    vi.advanceTimersByTime(999)
    expect(n.current).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(n.current).toBeNull()
  })

  it('notify with null duration does not auto-dismiss', async () => {
    const n = await load()
    n.notify('sticky', 'info', null)
    vi.advanceTimersByTime(60_000)
    expect(n.current).not.toBeNull()
    expect(n.current?.text).toBe('sticky')
  })

  it('second notify replaces first and resets timer', async () => {
    const n = await load()
    n.notify('first', 'info', 1_000)
    vi.advanceTimersByTime(500)
    n.notify('second', 'warning', 1_000)
    expect(n.current?.text).toBe('second')
    // original timer would have fired at 1000ms total; advance past that
    vi.advanceTimersByTime(600)
    expect(n.current).not.toBeNull()
    vi.advanceTimersByTime(400)
    expect(n.current).toBeNull()
  })
})
