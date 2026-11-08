import { randomBytes } from 'node:crypto'

export const NONCE_MARKER = '__FRONTEND_STYLE_NONCE__'
export const MAX_BODY_BYTES = 65_536
export const MAX_RESPONSE_BYTES = 4 * 1024 * 1024

export function parseApiTarget(value) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash) throw new Error()
    return url.origin
  } catch {
    throw new Error('FRONTEND_API_PROXY_TARGET must be an HTTP(S) origin without credentials or a path')
  }
}

export function parseRequestPath(value) {
  if (typeof value !== 'string' || value.length > 8192 || !value.startsWith('/')
    || value.startsWith('//') || [...value].some(character => character.charCodeAt(0) <= 32
      || character.charCodeAt(0) === 127 || character === '\\' || character === '#')) return null
  const pathname = value.split('?')[0]
  let decoded
  try { decoded = decodeURIComponent(pathname) } catch { return null }
  if (decoded !== pathname || pathname.split('/').some(part => part === '.' || part === '..')) return null
  return pathname
}

export function htmlResponse(template) {
  if (template.split(NONCE_MARKER).length !== 2
    || !template.includes('name="app-style-nonce"')) throw new Error('Invalid frontend HTML build')
  const nonce = randomBytes(24).toString('base64')
  const csp = [
    "default-src 'self'", "script-src 'self'", "script-src-attr 'none'",
    `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com`,
    `style-src-elem 'self' 'nonce-${nonce}' https://fonts.googleapis.com`,
    "style-src-attr 'none'", "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:", "connect-src 'self'", "object-src 'none'",
    "base-uri 'none'", "form-action 'self'", "frame-src 'none'", "frame-ancestors 'none'",
  ].join('; ')
  return { body: Buffer.from(template.replace(NONCE_MARKER, nonce)), csp }
}

const HOP_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate',
  'proxy-authorization', 'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade'])

export function proxyHeaders(headers, incoming = false) {
  const connection = String(headers.connection || '').split(',').map(name => name.trim().toLowerCase())
  const result = {}
  for (const [name, value] of Object.entries(headers)) {
    const key = name.toLowerCase()
    if (value === undefined || HOP_HEADERS.has(key) || connection.includes(key)
      || (incoming && (key === 'host' || key === 'forwarded' || key.startsWith('x-forwarded-')))
      || (!incoming && ['server', 'x-powered-by'].includes(key))) continue
    Object.defineProperty(result, key, { value, enumerable: true, configurable: true })
  }
  return result
}

export const BASE_HEADERS = Object.freeze({
  'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer', 'cache-control': 'no-store',
})
