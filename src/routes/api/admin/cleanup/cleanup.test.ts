import { describe, expect, it, vi } from 'vitest'

vi.mock('$lib/server/repository/cleanup', () => ({
  cleanupRepository: {
    deleteStaleGames: vi.fn().mockResolvedValue({ deleted: 3, errors: 0 }),
    deleteOrphanedSessions: vi.fn().mockResolvedValue({ deleted: 1, errors: 0 }),
  },
}))

const makeRequest = (auth?: string) =>
  new Request('http://localhost/api/admin/cleanup', {
    method: 'POST',
    headers: auth ? { Authorization: `Bearer ${auth}` } : {},
  })

describe('POST /api/admin/cleanup', () => {
  it('returns 401 when Authorization header is missing', async () => {
    vi.doMock('$env/dynamic/private', () => ({
      env: { CLEANUP_SECRET: 'secret', CLEANUP_STALE_GAME_DAYS: '7' },
    }))
    const { POST } = await import('./+server')
    const res = await POST({ request: makeRequest() } as never)
    expect(res.status).toBe(401)
    vi.resetModules()
  })

  it('returns 401 when secret is wrong', async () => {
    vi.doMock('$env/dynamic/private', () => ({
      env: { CLEANUP_SECRET: 'secret', CLEANUP_STALE_GAME_DAYS: '7' },
    }))
    const { POST } = await import('./+server')
    const res = await POST({ request: makeRequest('wrong') } as never)
    expect(res.status).toBe(401)
    vi.resetModules()
  })

  it('returns 503 when CLEANUP_SECRET is not set', async () => {
    vi.doMock('$env/dynamic/private', () => ({
      env: { CLEANUP_SECRET: '', CLEANUP_STALE_GAME_DAYS: '7' },
    }))
    const { POST } = await import('./+server')
    const res = await POST({ request: makeRequest('secret') } as never)
    expect(res.status).toBe(503)
    vi.resetModules()
  })

  it('returns 200 with deletion counts on success', async () => {
    vi.doMock('$env/dynamic/private', () => ({
      env: { CLEANUP_SECRET: 'secret', CLEANUP_STALE_GAME_DAYS: '7' },
    }))
    const { POST } = await import('./+server')
    const res = await POST({ request: makeRequest('secret') } as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      games: { deleted: 3, errors: 0 },
      sessions: { deleted: 1, errors: 0 },
    })
    expect(typeof body.durationMs).toBe('number')
    vi.resetModules()
  })
})
