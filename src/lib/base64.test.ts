import { describe, expect, it } from 'vitest'

import { urlBase64ToUint8Array } from './base64'

// Encodes bytes to a base64url string (no padding) so we can round-trip in tests.
const bytesToUrlBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

describe('urlBase64ToUint8Array', () => {
  it('decodes a string with no padding (3-byte aligned)', () => {
    // "AAA" stripped from "AAAA" — three zero bytes.
    expect(urlBase64ToUint8Array('AAAA')).toEqual(new Uint8Array([0, 0, 0]))
  })

  it('decodes a string needing one padding char (2 bytes)', () => {
    expect(urlBase64ToUint8Array('AAA')).toEqual(new Uint8Array([0, 0]))
  })

  it('decodes a string needing two padding chars (1 byte)', () => {
    expect(urlBase64ToUint8Array('AA')).toEqual(new Uint8Array([0]))
  })

  it('maps base64url-specific chars - and _ to + and /', () => {
    // "+/AA" in standard base64 → "-_AA" in base64url.
    expect(urlBase64ToUint8Array('-_AA')).toEqual(new Uint8Array([0xfb, 0xf0, 0x00]))
    expect(urlBase64ToUint8Array('____')).toEqual(new Uint8Array([0xff, 0xff, 0xff]))
  })

  it('decodes ASCII text', () => {
    expect(urlBase64ToUint8Array('SGVsbG8')).toEqual(
      new Uint8Array([72, 101, 108, 108, 111]), // "Hello"
    )
  })

  it('round-trips a 65-byte VAPID-style P-256 public key', () => {
    const key = new Uint8Array(65)
    key[0] = 0x04 // uncompressed EC point prefix
    for (let i = 1; i < 65; i++) key[i] = (i * 7 + 13) % 256
    const decoded = urlBase64ToUint8Array(bytesToUrlBase64(key))
    expect(decoded).toHaveLength(65)
    expect(decoded).toEqual(key)
  })
})
