import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('$lib/storage', () => ({
  getMute: vi.fn(),
  setMute: vi.fn(),
}))

import { getMute, setMute } from '$lib/storage'

const mockGetMute = vi.mocked(getMute)
const mockSetMute = vi.mocked(setMute)

describe('audio mute', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetMute.mockReset()
    mockSetMute.mockReset()
  })

  const load = async () => {
    const mod = await import('./audio')
    return { isMuted: mod.isMuted, toggleMute: mod.toggleMute }
  }

  it('isMuted returns the value from storage', async () => {
    mockGetMute.mockReturnValue(true)
    const { isMuted } = await load()
    expect(isMuted()).toBe(true)
  })

  it('isMuted returns false when storage says false', async () => {
    mockGetMute.mockReturnValue(false)
    const { isMuted } = await load()
    expect(isMuted()).toBe(false)
  })

  it('toggleMute flips false to true and calls setMute', async () => {
    mockGetMute.mockReturnValue(false)
    const { toggleMute } = await load()
    const result = toggleMute()
    expect(result).toBe(true)
    expect(mockSetMute).toHaveBeenCalledWith(true)
  })

  it('toggleMute flips true to false and calls setMute', async () => {
    mockGetMute.mockReturnValue(true)
    const { toggleMute } = await load()
    const result = toggleMute()
    expect(result).toBe(false)
    expect(mockSetMute).toHaveBeenCalledWith(false)
  })

  it('toggleMute called twice returns to original value', async () => {
    let muted = false
    mockGetMute.mockImplementation(() => muted)
    mockSetMute.mockImplementation((v) => {
      muted = v
    })
    const { toggleMute } = await load()
    toggleMute()
    expect(muted).toBe(true)
    toggleMute()
    expect(muted).toBe(false)
  })
})
