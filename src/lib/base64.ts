/**
 * Decodes a base64url-encoded string (e.g. a VAPID public key) into a
 * Uint8Array. Used for `pushManager.subscribe`'s `applicationServerKey`.
 *
 * Replaces `Uint8Array.fromBase64`, which is unsupported on iOS Safari < 18.2
 * and throws there, breaking push subscription.
 */
export const urlBase64ToUint8Array = (base64Url: string): Uint8Array<ArrayBuffer> => {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replaceAll('-', '+').replaceAll('_', '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}
