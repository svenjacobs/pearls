/**
 * Centralised client-side storage layer.
 *
 * All localStorage access goes through this module so keys are defined in one
 * place and SSR / private-browsing errors are handled uniformly.
 */

const KEYS = {
  mute: 'pearls:mute',
  playerName: 'pearls:playerName',
  theme: 'pearls:theme',
  reactions: 'pearls:reactions',
  pearlTheme: 'pearls:pearlTheme',
  installPromptDismissed: 'pearls:installPromptDismissed',
} as const

const read = (key: string): string | null => {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string): void => {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore (private browsing / storage quota exceeded)
  }
}

const erase = (key: string): void => {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

// ── Mute ──────────────────────────────────────────────────────────────────────

export const getMute = (): boolean => read(KEYS.mute) === '1'
export const setMute = (muted: boolean): void => write(KEYS.mute, muted ? '1' : '0')

// ── Player name ───────────────────────────────────────────────────────────────

export const getPlayerName = (): string | null => read(KEYS.playerName)
export const setPlayerName = (name: string): void => {
  if (name) write(KEYS.playerName, name)
  else erase(KEYS.playerName)
}

// ── Theme ─────────────────────────────────────────────────────────────────────

export type Theme = 'system' | 'light' | 'dark'

export const getTheme = (): Theme => {
  const v = read(KEYS.theme)
  return v === 'dark' ? 'dark' : v === 'light' ? 'light' : 'system'
}

export const setTheme = (theme: Theme): void => {
  if (theme === 'system') erase(KEYS.theme)
  else write(KEYS.theme, theme)
}

// ── Reactions ─────────────────────────────────────────────────────────────────

/** Defaults to `true` (reactions visible). */
export const getReactionsEnabled = (): boolean => read(KEYS.reactions) !== '0'
export const setReactionsEnabled = (enabled: boolean): void =>
  write(KEYS.reactions, enabled ? '1' : '0')

// ── Pearl theme ───────────────────────────────────────────────────────────────

export const getPearlTheme = (): string | null => read(KEYS.pearlTheme)
export const setPearlTheme = (id: string): void => write(KEYS.pearlTheme, id)

// ── Install prompt ──────────────────────────────────────────────────────────────

/** Whether the user dismissed the "install this app" info box ("don't show again"). */
export const getInstallPromptDismissed = (): boolean => read(KEYS.installPromptDismissed) === '1'
export const setInstallPromptDismissed = (): void => write(KEYS.installPromptDismissed, '1')
