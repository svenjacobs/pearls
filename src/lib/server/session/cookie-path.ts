/**
 * Derives the cookie path from a base URL string.
 * If the URL has no path (or a bare "/"), returns "/".
 * Trailing slashes are stripped so the path is always in canonical form.
 * Falls back to "/" if the URL is malformed.
 */
export const deriveCookiePath = (baseUrl: string): string => {
  try {
    const { pathname } = new URL(baseUrl)
    return pathname.endsWith('/') ? pathname.slice(0, -1) || '/' : pathname
  } catch {
    return '/'
  }
}
