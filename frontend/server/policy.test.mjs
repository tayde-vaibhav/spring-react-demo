import { describe, expect, it } from 'vitest'
import { htmlResponse, NONCE_MARKER, parseApiTarget, parseRequestPath, proxyHeaders } from './policy.mjs'

const template = `<html><meta name="app-style-nonce" content="${NONCE_MARKER}"></html>`

describe('standalone server policy (no sockets)', () => {
  it.each(['http://localhost:8080', 'https://api.example.test'])('accepts a configured origin: %s', target => {
    expect(parseApiTarget(target)).toBe(new URL(target).origin)
  })

  it.each([undefined, '', 'file:///tmp/build', 'ftp://api.example.test', 'http://name@localhost:8080',
    'http://localhost:8080/api', 'http://localhost:8080/?x=1', 'http://localhost:8080/#fragment'])('rejects invalid target %# without echoing it', target => {
    let message = ''
    try { parseApiTarget(target) } catch (error) { message = error.message }
    expect(message).toBe('FRONTEND_API_PROXY_TARGET must be an HTTP(S) origin without credentials or a path')
  })

  it.each(['/', '/login', '/assets/index-abc.js', '/api/v1/products?q=a%20b'])('accepts an origin-form path: %s', path => {
    expect(parseRequestPath(path)).toBe(path.split('?')[0])
  })

  it.each(['http://evil.example/api', '//evil.example/api', '/a/../index.html', '/a/./x', '/%2e%2e/x',
    '/%252e%252e/x', '/%2fapi', '/%5cfile', '/%00', '/bad%zz', '/a\\b', '/a#x', '/x\r\n', '/a b', '/x'.repeat(5000)])('rejects ambiguous paths %#', path => {
    expect(parseRequestPath(path)).toBeNull()
  })

  it('creates independent nonces and matching strict policy/body, without caching HTML', () => {
    const responses = Array.from({ length: 50 }, () => htmlResponse(template))
    const nonces = responses.map(r => r.body.toString().match(/content="([A-Za-z0-9+/]{32})"/)?.[1])
    expect(nonces.every(Boolean)).toBe(true)
    expect(new Set(nonces).size).toBe(50)
    expect(responses.every((r, i) => r.csp.includes(`'nonce-${nonces[i]}'`))).toBe(true)
    expect(responses.every(r => !r.body.toString().includes(NONCE_MARKER))).toBe(true)
    for (const response of responses) {
      expect(response.csp.includes('unsafe-inline')).toBe(false)
      expect(response.csp.includes('unsafe-eval')).toBe(false)
      expect(response.csp.includes('ws:')).toBe(false)
      expect(response.csp.includes("style-src-attr 'none'")).toBe(true)
      expect(response.csp.includes("script-src-attr 'none'")).toBe(true)
      expect(response.csp.includes("frame-ancestors 'none'")).toBe(true)
    }
  })

  it.each(['<html></html>', template + NONCE_MARKER, NONCE_MARKER])('rejects malformed/unsubstitutable builds %#', html => {
    expect(() => htmlResponse(html)).toThrow('Invalid frontend HTML build')
  })

  it('strips connection-nominated/hop headers and spoofed forwarding metadata, not auth/CSRF headers', () => {
    const cookie = ['qa', crypto.randomUUID()].join('=')
    const csrf = crypto.randomUUID()
    const result = proxyHeaders({ connection: 'keep-alive, x-hop', 'x-hop': 'remove', host: 'evil.example',
      forwarded: 'remove', 'x-forwarded-for': 'remove', 'x-forwarded-proto': 'remove',
      cookie, 'x-xsrf-token': csrf, origin: 'http://localhost:5173' }, true)
    expect(Object.keys(result).sort()).toEqual(['cookie', 'origin', 'x-xsrf-token'])
    expect(result.cookie === cookie && result['x-xsrf-token'] === csrf).toBe(true)
  })

  it('preserves separate Set-Cookie entries unchanged and removes server/hop headers', () => {
    const cookies = [crypto.randomUUID(), crypto.randomUUID()]
    const headers = proxyHeaders({ 'set-cookie': cookies, connection: 'x-hop', 'x-hop': 'remove',
      server: 'remove', 'x-powered-by': 'remove', 'content-type': 'application/json' })
    expect(headers['set-cookie'] === cookies).toBe(true)
    expect(Object.keys(headers).sort()).toEqual(['content-type', 'set-cookie'])
  })
})
