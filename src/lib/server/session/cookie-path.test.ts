import { describe, expect, it } from 'vitest'

import { deriveCookiePath } from './cookie-path'

describe('deriveCookiePath', () => {
  it('returns / when ORIGIN has no path', () => {
    expect(deriveCookiePath('https://example.com')).toBe('/')
  })

  it('returns / when ORIGIN path is /', () => {
    expect(deriveCookiePath('https://example.com/')).toBe('/')
  })

  it('returns the path when ORIGIN has a sub-path', () => {
    expect(deriveCookiePath('https://example.com/game')).toBe('/game')
  })

  it('strips a trailing slash from the path', () => {
    expect(deriveCookiePath('https://example.com/game/')).toBe('/game')
  })

  it('handles nested paths', () => {
    expect(deriveCookiePath('https://example.com/apps/pearls')).toBe('/apps/pearls')
  })

  it('returns / when ORIGIN is malformed', () => {
    expect(deriveCookiePath('not-a-url')).toBe('/')
  })

  it('returns / when ORIGIN is empty', () => {
    expect(deriveCookiePath('')).toBe('/')
  })
})
