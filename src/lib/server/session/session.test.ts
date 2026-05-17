import type { Cookies } from '@sveltejs/kit'
import { describe, expect, it } from 'vitest'

import {
  addSession,
  getAllSessionIds,
  getSessionId,
  promoteSession,
  removeSession,
} from './session'

const makeCookies = (): Cookies & { store: Record<string, string> } => {
  const store: Record<string, string> = {}
  return {
    store,
    get: (name: string) => store[name] ?? undefined,
    getAll: () => Object.entries(store).map(([name, value]) => ({ name, value, path: '/' })),
    set: (name: string, value: string) => {
      store[name] = value
    },
    delete: (name: string) => {
      delete store[name]
    },
    serialize: () => '',
  } as unknown as Cookies & { store: Record<string, string> }
}

describe('getAllSessionIds', () => {
  it('returns [] when no cookies set', () => {
    expect(getAllSessionIds(makeCookies())).toEqual([])
  })

  it('seeds from legacy game_session when game_sessions absent', () => {
    const c = makeCookies()
    c.store['game_session'] = 'abc'
    expect(getAllSessionIds(c)).toEqual(['abc'])
  })

  it('parses game_sessions JSON array', () => {
    const c = makeCookies()
    c.store['game_sessions'] = JSON.stringify(['a', 'b', 'c'])
    expect(getAllSessionIds(c)).toEqual(['a', 'b', 'c'])
  })
})

describe('addSession', () => {
  it('sets game_session and game_sessions', () => {
    const c = makeCookies()
    addSession(c, 'id1')
    expect(getSessionId(c)).toBe('id1')
    expect(getAllSessionIds(c)).toContain('id1')
  })

  it('prepends new id and deduplicates', () => {
    const c = makeCookies()
    addSession(c, 'id1')
    addSession(c, 'id2')
    addSession(c, 'id1')
    const ids = getAllSessionIds(c)
    expect(ids[0]).toBe('id1')
    expect(ids.filter((x) => x === 'id1').length).toBe(1)
  })
})

describe('removeSession', () => {
  it('removes id from game_sessions', () => {
    const c = makeCookies()
    addSession(c, 'id1')
    addSession(c, 'id2')
    removeSession(c, 'id1')
    expect(getAllSessionIds(c)).not.toContain('id1')
    expect(getAllSessionIds(c)).toContain('id2')
  })

  it('promotes next session to primary when primary is removed', () => {
    const c = makeCookies()
    addSession(c, 'id1')
    addSession(c, 'id2') // id2 is now primary
    removeSession(c, 'id2')
    expect(getSessionId(c)).toBe('id1')
  })

  it('clears game_session cookie when all sessions removed', () => {
    const c = makeCookies()
    addSession(c, 'id1')
    removeSession(c, 'id1')
    expect(getSessionId(c)).toBeNull()
    expect(getAllSessionIds(c)).toEqual([])
  })
})

describe('promoteSession', () => {
  it('sets the id as game_session', () => {
    const c = makeCookies()
    addSession(c, 'id1')
    addSession(c, 'id2')
    promoteSession(c, 'id1')
    expect(getSessionId(c)).toBe('id1')
  })

  it('adds id to game_sessions if not already present', () => {
    const c = makeCookies()
    promoteSession(c, 'newid')
    expect(getAllSessionIds(c)).toContain('newid')
  })
})
