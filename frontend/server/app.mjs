import http from 'node:http'
import https from 'node:https'
import { BASE_HEADERS, MAX_BODY_BYTES, MAX_RESPONSE_BYTES, htmlResponse, parseApiTarget, parseRequestPath, proxyHeaders } from './policy.mjs'

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let bytes = 0
    let failed = false
    request.on('data', chunk => {
      if (failed) return
      const buffer = Buffer.from(chunk)
      bytes += buffer.length
      if (bytes > MAX_BODY_BYTES) {
        failed = true
        chunks.length = 0
        reject(new Error('BODY_LIMIT'))
      } else chunks.push(buffer)
    })
    request.on('end', () => { if (!failed) resolve(Buffer.concat(chunks)) })
    request.on('error', () => reject(new Error('BODY_READ_FAILED')))
    request.on('aborted', () => reject(new Error('BODY_READ_FAILED')))
  })
}

// No redirect following, credential logging, client-selected host or forwarded-IP trust.
export function requestBackend({ target, method, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const url = new URL(target)
    const send = url.protocol === 'https:' ? https.request : http.request
    let settled = false
    let timer
    const fail = () => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error('UPSTREAM_FAILED')) } }
    const upstream = send({ protocol: url.protocol, hostname: url.hostname.replace(/^\[|\]$/g, ''), port: url.port,
      method, path, headers: { ...headers, host: url.host, 'content-length': body.length },
    }, response => {
      const chunks = []
      let bytes = 0
      response.on('data', chunk => {
        bytes += chunk.length
        if (bytes > MAX_RESPONSE_BYTES) { response.destroy(); upstream.destroy(); fail() }
        else chunks.push(chunk)
      })
      response.on('error', fail)
      response.on('aborted', fail)
      response.on('end', () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) })
      })
    })
    upstream.on('error', fail)
    timer = setTimeout(() => { upstream.destroy(); fail() }, 10_000)
    upstream.end(body)
  })
}

function send(response, status, headers, body, head) {
  response.writeHead(status, { ...BASE_HEADERS, ...headers, 'content-length': body.length })
  response.end(head ? undefined : body)
}

function problem(response, status, head = false) {
  const title = new Map([[400, 'Bad request'], [404, 'Not found'], [405, 'Method not allowed'],
    [413, 'Content too large'], [502, 'Bad gateway'], [503, 'Service unavailable']]).get(status) || 'Request failed'
  send(response, status, { 'content-type': 'application/problem+json', connection: 'close' },
    Buffer.from(JSON.stringify({ type: 'about:blank', title, status })), head)
}

const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'])
const PAGES = new Set(['/', '/index.html', '/login', '/dashboard', '/products', '/products/new'])
const RESERVED = ['/api', '/actuator', '/swagger-ui', '/swagger-ui.html', '/v3', '/app-test', '/src', '/node_modules', '/@vite']

export function createFrontendHandler({ template, assets, apiTarget, transport = requestBackend }) {
  const target = parseApiTarget(apiTarget)
  htmlResponse(template) // Fail startup on an invalid/missing build marker.
  let pending = 0
  return async (request, response) => {
    const head = request.method === 'HEAD'
    const pathname = parseRequestPath(request.url)
    if (!pathname) return problem(response, 400, head)
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      if (!METHODS.has(request.method)) return problem(response, 405, head)
      if (pending >= 16) return problem(response, 503, head)
      pending++
      try {
        const length = request.headers['content-length']
        if (length !== undefined && (!/^\d{1,9}$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
          return problem(response, 413, head)
        }
        const body = await readBody(request)
        const result = await transport({ target, method: request.method, path: request.url,
          headers: proxyHeaders(request.headers, true), body })
        if (!Number.isInteger(result.status) || result.status < 200 || result.status > 599
          || result.body.length > MAX_RESPONSE_BYTES) return problem(response, 502, head)
        return send(response, result.status, { ...proxyHeaders(result.headers), 'cache-control': 'no-store' }, result.body, head)
      } catch (error) {
        return problem(response, error instanceof Error && error.message === 'BODY_LIMIT' ? 413 : 502, head)
      } finally { pending-- }
    }
    if (request.method !== 'GET' && !head) return problem(response, 405)
    const asset = assets.get(pathname)
    if (asset) return send(response, 200, { 'content-type': asset.type,
      'cache-control': 'public, max-age=3600' }, asset.body, head)
    const reserved = pathname.split('/').some(part => part.startsWith('.') && part !== '')
      || pathname.startsWith('/assets/')
      || RESERVED.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
      || pathname.split('/').at(-1).includes('.')
    const known = PAGES.has(pathname) || /^\/products\/[A-Za-z0-9_-]{1,100}\/edit$/.test(pathname)
    if (reserved && !PAGES.has(pathname)) return problem(response, 404, head)
    if (!known && !String(request.headers.accept || '').includes('text/html')) return problem(response, 404, head)
    const html = htmlResponse(template)
    return send(response, known ? 200 : 404, { 'content-type': 'text/html; charset=utf-8',
      'content-security-policy': html.csp }, html.body, head)
  }
}
