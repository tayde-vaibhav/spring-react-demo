import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { createFrontendHandler } from './app.mjs'
import { MAX_BODY_BYTES, MAX_RESPONSE_BYTES, NONCE_MARKER } from './policy.mjs'

const template = `<html><meta name="app-style-nonce" content="${NONCE_MARKER}"><div id="root"></div></html>`
const assets = new Map([['/assets/app-test.js', { body: Buffer.from('export {}'), type: 'text/javascript' }]])
function setup(transport = vi.fn(async () => ({ status: 200, headers: {}, body: Buffer.from('{}') }))) {
  const handler = createFrontendHandler({ template, assets, apiTarget: 'http://localhost:8080', transport })
  async function call(url, { method = 'GET', headers = {}, chunks = [] } = {}) {
    const request = Readable.from(chunks)
    Object.assign(request, { url, method, headers })
    const response = { status: 0, headers: {}, body: Buffer.alloc(0),
      writeHead(status, values) { this.status = status; this.headers = values },
      end(body) { this.body = body === undefined ? Buffer.alloc(0) : Buffer.from(body) },
    }
    await handler(request, response)
    return response
  }
  return { call, transport }
}

describe('standalone frontend request handler (mock transport only)', () => {
  it.each(['/', '/index.html', '/login', '/dashboard', '/products', '/products/new', '/products/qa-id/edit'])('serves a known SPA route: %s', async path => {
    const { call, transport } = setup()
    const response = await call(path)
    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers['content-type']).toContain('text/html')
    expect(response.headers.etag).toBeUndefined()
    expect(response.body.includes(NONCE_MARKER)).toBe(false)
    expect(transport).not.toHaveBeenCalled()
  })

  it('does not return 304 for cached HTML and generates a new policy for each document', async () => {
    const { call } = setup()
    const results = await Promise.all(Array.from({ length: 20 }, () => call('/login', { headers: { 'if-none-match': '*' } })))
    expect(results.every(r => r.status === 200)).toBe(true)
    expect(new Set(results.map(r => r.headers['content-security-policy'])).size).toBe(20)
  })

  it('HEAD carries the GET metadata but no body', async () => {
    const { call } = setup()
    const result = await call('/login', { method: 'HEAD' })
    expect(result.status).toBe(200)
    expect(result.body.length).toBe(0)
    expect(result.headers['content-length']).toBeGreaterThan(0)
    expect(result.headers['content-security-policy']).toBeTruthy()
  })

  it.each(['/.env', '/.git/config', '/src/main.tsx', '/node_modules/x.js', '/assets/missing.js',
    '/assets/app-test.js.map', '/actuator/health', '/swagger-ui.html', '/v3/api-docs', '/app-test'])('never serves reserved/source paths: %s', async path => {
    const { call, transport } = setup()
    const result = await call(path, { headers: { accept: 'text/html' } })
    expect(result.status).toBe(404)
    expect(result.headers['content-type']).toBe('application/problem+json')
    expect(transport).not.toHaveBeenCalled()
  })

  it('serves only indexed static assets, with correct MIME and no nonce', async () => {
    const { call } = setup()
    const result = await call('/assets/app-test.js')
    expect(result.status).toBe(200)
    expect(result.headers['content-type']).toBe('text/javascript')
    expect(result.body.toString()).toBe('export {}')
    expect(result.headers['content-security-policy']).toBeUndefined()
  })

  it('returns the SPA 404 page only for unknown HTML navigation', async () => {
    const { call } = setup()
    expect((await call('/unknown', { headers: { accept: 'text/html' } })).headers['content-type']).toContain('text/html')
    expect((await call('/unknown', { headers: { accept: 'text/html' } })).status).toBe(404)
    expect((await call('/unknown')).headers['content-type']).toBe('application/problem+json')
  })

  it.each(['//evil.example/api', '/assets/../index.html', '/%2e%2e/.env'])('rejects malicious path %# before transport', async path => {
    const { call, transport } = setup()
    expect((await call(path)).status).toBe(400)
    expect(transport).not.toHaveBeenCalled()
  })

  it('forwards API method/path/query/body to only the configured target and preserves cookie metadata', async () => {
    const cookie = crypto.randomUUID()
    const csrf = crypto.randomUUID()
    const cookies = [crypto.randomUUID(), crypto.randomUUID()]
    const transport = vi.fn(async () => ({ status: 401, headers: { 'content-type': 'application/problem+json', 'set-cookie': cookies }, body: Buffer.from('{"status":401}') }))
    const { call } = setup(transport)
    const result = await call('/api/v1/auth/login?qa=1', { method: 'POST', headers: { cookie, 'x-xsrf-token': csrf, host: 'evil.example' }, chunks: ['{}'] })
    const sent = transport.mock.calls[0][0]
    expect(sent.target).toBe('http://localhost:8080')
    expect(sent.method).toBe('POST')
    expect(sent.path).toBe('/api/v1/auth/login?qa=1')
    expect(sent.body.toString()).toBe('{}')
    expect(sent.headers.cookie === cookie && sent.headers['x-xsrf-token'] === csrf).toBe(true)
    expect(sent.headers.host).toBeUndefined()
    expect(result.status).toBe(401)
    expect(result.headers['set-cookie'] === cookies).toBe(true)
    expect(result.headers['cache-control']).toBe('no-store')
  })

  it.each([400, 403, 404, 409, 429])('preserves upstream ProblemDetail status/body: %s', async status => {
    const body = Buffer.from(JSON.stringify({ type: 'urn:problem:qa-fixture', status }))
    const { call } = setup(vi.fn(async () => ({ status, headers: {}, body })))
    const result = await call('/api/v1/products')
    expect(result.status).toBe(status)
    expect(result.body.equals(body)).toBe(true)
  })

  it.each([undefined, '65537', 'invalid'])('bounds declared or streamed request bodies %#', async length => {
    const { call, transport } = setup()
    const headers = length === undefined ? {} : { 'content-length': length }
    const response = await call('/api/v1/products', { method: 'POST', headers, chunks: [Buffer.alloc(MAX_BODY_BYTES), Buffer.from('x')] })
    expect(response.status).toBe(413)
    expect(transport).not.toHaveBeenCalled()
  })

  it('returns only sanitized gateway errors on transport failure', async () => {
    const { call } = setup(vi.fn(async () => { throw new Error('private upstream diagnostic') }))
    const result = await call('/api/v1/products')
    expect(result.status).toBe(502)
    expect(JSON.parse(result.body.toString())).toEqual({ type: 'about:blank', title: 'Bad gateway', status: 502 })
  })

  it('rejects excessive upstream response size', async () => {
    const { call } = setup(vi.fn(async () => ({ status: 200, headers: {}, body: Buffer.alloc(MAX_RESPONSE_BYTES + 1) })))
    expect((await call('/api/v1/products')).status).toBe(502)
  })

  it('caps in-flight API requests and releases slots after completion', async () => {
    const releases = []
    const { call, transport } = setup(vi.fn(() => new Promise(resolve => releases.push(() => resolve({ status: 200, headers: {}, body: Buffer.alloc(0) })))))
    const pending = Array.from({ length: 16 }, () => call('/api/v1/products'))
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(16))
    expect((await call('/api/v1/products')).status).toBe(503)
    releases.forEach(release => release())
    expect((await Promise.all(pending)).every(result => result.status === 200)).toBe(true)
    transport.mockResolvedValueOnce({ status: 200, headers: {}, body: Buffer.alloc(0) })
    expect((await call('/api/v1/products')).status).toBe(200)
  })

  it('rejects unsupported methods without opening a transport', async () => {
    const { call, transport } = setup()
    expect((await call('/api/v1/products', { method: 'CONNECT' })).status).toBe(405)
    expect((await call('/login', { method: 'POST' })).status).toBe(405)
    expect(transport).not.toHaveBeenCalled()
  })
})
