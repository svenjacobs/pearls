import { describe, expect, it } from 'vitest'

import { DEFAULT_THEME_ID, getThemeColors, PEARL_THEMES } from './pearlThemes'

describe('PEARL_THEMES', () => {
  it('every theme has exactly 12 colors', () => {
    for (const theme of PEARL_THEMES) {
      expect(theme.colors).toHaveLength(12)
    }
  })

  it('all color values are valid 6-digit hex strings', () => {
    const hex6 = /^#[0-9a-f]{6}$/i
    for (const theme of PEARL_THEMES) {
      for (const color of theme.colors) {
        expect(color).toMatch(hex6)
      }
    }
  })

  it('DEFAULT_THEME_ID exists in PEARL_THEMES', () => {
    expect(PEARL_THEMES.some((t) => t.id === DEFAULT_THEME_ID)).toBe(true)
  })
})

describe('getThemeColors', () => {
  it('returns default theme colors for an unknown ID', () => {
    const defaultColors = PEARL_THEMES.find((t) => t.id === DEFAULT_THEME_ID)!.colors
    expect(getThemeColors('nonexistent')).toEqual(defaultColors)
  })

  it('returns default theme colors for null', () => {
    const defaultColors = PEARL_THEMES.find((t) => t.id === DEFAULT_THEME_ID)!.colors
    expect(getThemeColors(null)).toEqual(defaultColors)
  })

  it('returns default theme colors for undefined', () => {
    const defaultColors = PEARL_THEMES.find((t) => t.id === DEFAULT_THEME_ID)!.colors
    expect(getThemeColors(undefined)).toEqual(defaultColors)
  })

  it('returns correct colors for each known theme ID', () => {
    for (const theme of PEARL_THEMES) {
      expect(getThemeColors(theme.id)).toEqual(theme.colors)
    }
  })
})
