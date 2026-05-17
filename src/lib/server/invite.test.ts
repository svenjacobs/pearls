import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('inviteUrl', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('combines ORIGIN with the join path and invite code', async () => {
    vi.doMock('$env/dynamic/private', () => ({ env: { ORIGIN: 'https://example.com' } }))
    const { inviteUrl } = await import('./invite')
    expect(inviteUrl('ABCD')).toBe('https://example.com/join/ABCD')
  })

  it('preserves the exact invite code casing', async () => {
    vi.doMock('$env/dynamic/private', () => ({ env: { ORIGIN: 'https://example.com' } }))
    const { inviteUrl } = await import('./invite')
    expect(inviteUrl('xYzW')).toBe('https://example.com/join/xYzW')
  })

  it('handles invite codes with digits', async () => {
    vi.doMock('$env/dynamic/private', () => ({ env: { ORIGIN: 'https://example.com' } }))
    const { inviteUrl } = await import('./invite')
    expect(inviteUrl('AB12')).toBe('https://example.com/join/AB12')
  })

  describe('when ORIGIN contains a subpath', () => {
    it('includes the subpath in the URL', async () => {
      vi.doMock('$env/dynamic/private', () => ({ env: { ORIGIN: 'https://example.com/pearls' } }))
      const { inviteUrl } = await import('./invite')
      expect(inviteUrl('ABCD')).toBe('https://example.com/pearls/join/ABCD')
    })
  })
})
