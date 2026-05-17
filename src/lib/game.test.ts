import { describe, expect, it } from 'vitest'

import { generateInviteCode } from './game'

// Characters that may appear in invite codes (excludes visually similar 0/O/1/I/L).
const VALID_CHARS = new Set('ABCDEFGHJKMNPQRSTUVWXYZ23456789')

describe('generateInviteCode', () => {
  it('returns an 8-character string', () => {
    expect(generateInviteCode()).toHaveLength(8)
  })

  it('contains only characters from the allowed alphabet', () => {
    const code = generateInviteCode()
    for (const ch of code) {
      expect(VALID_CHARS.has(ch), `unexpected character "${ch}"`).toBe(true)
    }
  })

  it('excludes visually ambiguous characters (0, O, 1, I, L)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateInviteCode()
      expect(code).not.toMatch(/[01OIL]/)
    }
  })

  it('returns uppercase characters only', () => {
    const code = generateInviteCode()
    expect(code).toBe(code.toUpperCase())
  })

  it('produces different codes on successive calls', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateInviteCode()))
    // With 31^8 ≈ 850 billion combinations the chance of a collision is negligible.
    expect(codes.size).toBe(20)
  })
})
