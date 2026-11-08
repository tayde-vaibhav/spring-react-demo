import http from 'node:http'
import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestBackend } from './app.mjs'
import { MAX_RESPONSE_BYTES } from './policy.mjs'

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })
const input = () => ({ target: 'http://localhost:8080', method: 'GET', path: '/api/v1/products?q=qa', headers: {}, body: Buffer.alloc(0) })

function mockRequest(reply) {
  const request = new EventEmitter()
  request.destroy = vi.fn()
  request.end = vi.fn(() => reply())
  const spy = vi.spyOn(http, 'request').mockImplementation((options, callback) => {
    const response = new EventEmitter()
    response.statusCode = 302
    response.headers = { location: '/api/v1/auth/me' }
    response.destroy = vi.fn()
    request.end = vi.fn(() => { callback(response); reply(response, request) })
    return request
  })
  return { request, spy }
}

describe('native upstream adapter (HTTP module mocked; no sockets)', () => {
  it('uses only the configured host/path and returns redirects without following them', async () => {
    const { spy } = mockRequest(response => { response.emit('data', Buffer.from('')); response.emit('end') })
    const result = await requestBackend(input())
    expect(result.status).toBe(302)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toMatchObject({ hostname: 'localhost', port: '8080', path: '/api/v1/products?q=qa' })
  })

  it('terminates excessive responses without retaining them', async () => {
    const { request } = mockRequest(response => { response.emit('data', Buffer.alloc(MAX_RESPONSE_BYTES + 1)) })
    await expect(requestBackend(input())).rejects.toThrow('UPSTREAM_FAILED')
    expect(request.destroy).toHaveBeenCalled()
  })

  it('bounds the entire upstream operation, not merely socket inactivity', async () => {
    vi.useFakeTimers()
    const { request } = mockRequest(() => {})
    const result = expect(requestBackend(input())).rejects.toThrow('UPSTREAM_FAILED')
    await vi.advanceTimersByTimeAsync(10_000)
    await result
    expect(request.destroy).toHaveBeenCalled()
  })

  it('sanitizes upstream stream errors', async () => {
    mockRequest(response => response.emit('error', new Error('private upstream diagnostic')))
    await expect(requestBackend(input())).rejects.toThrow('UPSTREAM_FAILED')
  })
})
