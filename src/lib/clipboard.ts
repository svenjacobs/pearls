/**
 * Writes text to the clipboard.
 *
 * Tries the async Clipboard API first (requires secure context + user gesture).
 * Falls back to the legacy execCommand approach when the API is unavailable or
 * the permission is denied — common on mobile browsers and non-HTTPS origins.
 *
 * Must be called from a user-initiated event handler (e.g. click) so that
 * transient activation is present for both paths.
 *
 * Returns true on success, false if both methods fail.
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Permission denied or API unavailable — fall through to execCommand.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '-9999px'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  try {
    return document.execCommand('copy')
  } finally {
    document.body.removeChild(textarea)
  }
}
