import { beforeEach, describe, expect, it, vi } from 'vitest'

// Provide a minimal in-memory localStorage so the SSR guard passes.
const makeLocalStorage = () => {
  const store: Record<string, string> = {}
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v
    },
    removeItem: (k: string) => {
      delete store[k]
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k]
    },
  }
}

describe('storage', () => {
  let ls: ReturnType<typeof makeLocalStorage>

  beforeEach(async () => {
    vi.resetModules()
    ls = makeLocalStorage()
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', ls)
  })

  // ── Mute ────────────────────────────────────────────────────────────────────

  describe('getMute / setMute', () => {
    it('returns false when key is absent', async () => {
      const { getMute } = await import('./storage')
      expect(getMute()).toBe(false)
    })

    it('returns true after setMute(true)', async () => {
      const { getMute, setMute } = await import('./storage')
      setMute(true)
      expect(getMute()).toBe(true)
    })

    it('returns false after setMute(false)', async () => {
      const { getMute, setMute } = await import('./storage')
      setMute(true)
      setMute(false)
      expect(getMute()).toBe(false)
    })

    it('persists "1" / "0" string in localStorage', async () => {
      const { setMute } = await import('./storage')
      setMute(true)
      expect(ls.getItem('pearls:mute')).toBe('1')
      setMute(false)
      expect(ls.getItem('pearls:mute')).toBe('0')
    })
  })

  // ── Player name ─────────────────────────────────────────────────────────────

  describe('getPlayerName / setPlayerName', () => {
    it('returns null when absent', async () => {
      const { getPlayerName } = await import('./storage')
      expect(getPlayerName()).toBeNull()
    })

    it('returns stored name', async () => {
      const { getPlayerName, setPlayerName } = await import('./storage')
      setPlayerName('Alice')
      expect(getPlayerName()).toBe('Alice')
    })

    it('removes key when empty string is set', async () => {
      const { getPlayerName, setPlayerName } = await import('./storage')
      setPlayerName('Bob')
      setPlayerName('')
      expect(getPlayerName()).toBeNull()
      expect(ls.getItem('pearls:playerName')).toBeNull()
    })
  })

  // ── Theme ───────────────────────────────────────────────────────────────────

  describe('getTheme / setTheme', () => {
    it('returns "system" when absent', async () => {
      const { getTheme } = await import('./storage')
      expect(getTheme()).toBe('system')
    })

    it('returns "dark" after setTheme("dark")', async () => {
      const { getTheme, setTheme } = await import('./storage')
      setTheme('dark')
      expect(getTheme()).toBe('dark')
    })

    it('returns "light" after setTheme("light")', async () => {
      const { getTheme, setTheme } = await import('./storage')
      setTheme('light')
      expect(getTheme()).toBe('light')
    })

    it('removes key (returns "system") after setTheme("system")', async () => {
      const { getTheme, setTheme } = await import('./storage')
      setTheme('dark')
      setTheme('system')
      expect(getTheme()).toBe('system')
      expect(ls.getItem('pearls:theme')).toBeNull()
    })

    it('treats unknown stored value as "system"', async () => {
      const { getTheme } = await import('./storage')
      ls.setItem('pearls:theme', 'bogus')
      expect(getTheme()).toBe('system')
    })
  })

  // ── Reactions ────────────────────────────────────────────────────────────────

  describe('getReactionsEnabled / setReactionsEnabled', () => {
    it('returns true when absent (default on)', async () => {
      const { getReactionsEnabled } = await import('./storage')
      expect(getReactionsEnabled()).toBe(true)
    })

    it('returns false after setReactionsEnabled(false)', async () => {
      const { getReactionsEnabled, setReactionsEnabled } = await import('./storage')
      setReactionsEnabled(false)
      expect(getReactionsEnabled()).toBe(false)
    })

    it('returns true after setReactionsEnabled(true)', async () => {
      const { getReactionsEnabled, setReactionsEnabled } = await import('./storage')
      setReactionsEnabled(false)
      setReactionsEnabled(true)
      expect(getReactionsEnabled()).toBe(true)
    })

    it('persists "1" / "0" string in localStorage', async () => {
      const { setReactionsEnabled } = await import('./storage')
      setReactionsEnabled(false)
      expect(ls.getItem('pearls:reactions')).toBe('0')
      setReactionsEnabled(true)
      expect(ls.getItem('pearls:reactions')).toBe('1')
    })
  })

  // ── Pearl theme ──────────────────────────────────────────────────────────────

  describe('getPearlTheme / setPearlTheme', () => {
    it('returns null when not set', async () => {
      const { getPearlTheme } = await import('./storage')
      expect(getPearlTheme()).toBeNull()
    })

    it('returns stored theme ID after setPearlTheme', async () => {
      const { getPearlTheme, setPearlTheme } = await import('./storage')
      setPearlTheme('german')
      expect(getPearlTheme()).toBe('german')
    })

    it('persists theme ID string in localStorage', async () => {
      const { setPearlTheme } = await import('./storage')
      setPearlTheme('pride')
      expect(ls.getItem('pearls:pearlTheme')).toBe('pride')
    })

    it('returns updated theme after second call', async () => {
      const { getPearlTheme, setPearlTheme } = await import('./storage')
      setPearlTheme('ocean')
      setPearlTheme('sunset')
      expect(getPearlTheme()).toBe('sunset')
    })
  })

  // ── SSR guard ────────────────────────────────────────────────────────────────

  describe('SSR guard (window undefined)', () => {
    it('getMute returns false when window is undefined', async () => {
      vi.stubGlobal('window', undefined)
      const { getMute } = await import('./storage')
      expect(getMute()).toBe(false)
    })

    it('getPlayerName returns null when window is undefined', async () => {
      vi.stubGlobal('window', undefined)
      const { getPlayerName } = await import('./storage')
      expect(getPlayerName()).toBeNull()
    })

    it('getTheme returns "system" when window is undefined', async () => {
      vi.stubGlobal('window', undefined)
      const { getTheme } = await import('./storage')
      expect(getTheme()).toBe('system')
    })

    it('getReactionsEnabled returns true when window is undefined', async () => {
      vi.stubGlobal('window', undefined)
      const { getReactionsEnabled } = await import('./storage')
      expect(getReactionsEnabled()).toBe(true)
    })

    it('getPearlTheme returns null when window is undefined', async () => {
      vi.stubGlobal('window', undefined)
      const { getPearlTheme } = await import('./storage')
      expect(getPearlTheme()).toBeNull()
    })
  })
})
