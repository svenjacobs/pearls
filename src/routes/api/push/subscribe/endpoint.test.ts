import { describe, expect, it } from 'vitest'

import { isValidPushEndpoint } from './endpoint'

describe('isValidPushEndpoint', () => {
  it('accepts https URL', () => {
    expect(isValidPushEndpoint('https://fcm.googleapis.com/push/abc123')).toBe(true)
  })

  it('accepts https URL with port', () => {
    expect(isValidPushEndpoint('https://push.example.com:8443/endpoint')).toBe(true)
  })

  it('rejects http URL', () => {
    expect(isValidPushEndpoint('http://internal-host/admin')).toBe(false)
  })

  it('rejects file URL', () => {
    expect(isValidPushEndpoint('file:///etc/passwd')).toBe(false)
  })

  it('rejects javascript URL', () => {
    expect(isValidPushEndpoint('javascript:alert(1)')).toBe(false)
  })

  it('rejects plain string', () => {
    expect(isValidPushEndpoint('not-a-url')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidPushEndpoint('')).toBe(false)
  })
})
