import { describe, expect, it } from 'vitest'

import { splitDuration } from './duration'

describe('splitDuration', () => {
  it('splits zero seconds', () => {
    expect(splitDuration(0)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  })

  it('splits pure seconds', () => {
    expect(splitDuration(45)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 45 })
  })

  it('splits minutes and seconds', () => {
    expect(splitDuration(90)).toEqual({ days: 0, hours: 0, minutes: 1, seconds: 30 })
  })

  it('splits hours, minutes, seconds', () => {
    expect(splitDuration(3_661)).toEqual({ days: 0, hours: 1, minutes: 1, seconds: 1 })
  })

  it('splits days, hours, minutes, seconds', () => {
    expect(splitDuration(90_061)).toEqual({ days: 1, hours: 1, minutes: 1, seconds: 1 })
  })

  it('handles exactly 1 day', () => {
    expect(splitDuration(86_400)).toEqual({ days: 1, hours: 0, minutes: 0, seconds: 0 })
  })
})
