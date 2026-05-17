import type { Cookies } from '@sveltejs/kit'

import { dev } from '$app/environment'
import { env } from '$env/dynamic/private'

import { deriveCookiePath } from './cookie-path'

export const SESSION_COOKIE = 'game_session'
const SESSIONS_COOKIE = 'game_sessions'
const MAX_SESSIONS = 10

const cookiePath = deriveCookiePath(env.ORIGIN)

const cookieOptions = () => ({
  path: cookiePath,
  httpOnly: true,
  // 'strict' would drop the cookie when players follow an invite link from an external source (email, chat),
  // causing a phantom session on first load. 'lax' keeps the cookie on top-level cross-site navigations.
  sameSite: 'lax' as const,
  secure: !dev,
  maxAge: 60 * 60 * 24 * 7, // 7 days
})

// ── Primary session (single active game — used by all API routes) ─────────────

export const getSessionId = (cookies: Cookies): string | null => cookies.get(SESSION_COOKIE) ?? null

export const setSessionId = (cookies: Cookies, sessionId: string): void => {
  cookies.set(SESSION_COOKIE, sessionId, cookieOptions())
}

export const clearSessionId = (cookies: Cookies): void => {
  cookies.delete(SESSION_COOKIE, { path: cookiePath })
}

// ── All-sessions list (for games overview) ────────────────────────────────────

const parseSessions = (raw: string): string[] => {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === 'string')
  } catch {
    // ignore malformed cookie values
  }
  return []
}

const persistAllSessions = (cookies: Cookies, ids: string[]): void => {
  if (ids.length === 0) {
    cookies.delete(SESSIONS_COOKIE, { path: cookiePath })
    return
  }
  cookies.set(SESSIONS_COOKIE, JSON.stringify(ids.slice(0, MAX_SESSIONS)), cookieOptions())
}

/** Returns all tracked session IDs. Falls back to the legacy primary cookie when
 *  the multi-session cookie is absent (backward compatibility). */
export const getAllSessionIds = (cookies: Cookies): string[] => {
  const raw = cookies.get(SESSIONS_COOKIE)
  if (raw) return parseSessions(raw)
  const primary = cookies.get(SESSION_COOKIE)
  return primary ? [primary] : []
}

/** Adds a session, making it the new primary. Deduplicates and caps at MAX_SESSIONS. */
export const addSession = (cookies: Cookies, sessionId: string): void => {
  setSessionId(cookies, sessionId)
  const all = getAllSessionIds(cookies).filter((id) => id !== sessionId)
  all.unshift(sessionId)
  persistAllSessions(cookies, all)
}

/** Removes a specific session. Promotes the next in line to primary if needed. */
export const removeSession = (cookies: Cookies, sessionId: string): void => {
  const all = getAllSessionIds(cookies).filter((id) => id !== sessionId)
  persistAllSessions(cookies, all)
  if (getSessionId(cookies) === sessionId) {
    if (all.length > 0) {
      setSessionId(cookies, all[0])
    } else {
      clearSessionId(cookies)
    }
  }
}

/** Promotes an existing session to primary without changing the sessions list order. */
export const promoteSession = (cookies: Cookies, sessionId: string): void => {
  setSessionId(cookies, sessionId)
  const all = getAllSessionIds(cookies)
  if (!all.includes(sessionId)) {
    all.unshift(sessionId)
    persistAllSessions(cookies, all)
  }
}
