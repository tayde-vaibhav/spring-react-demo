import { test, expect } from './support/fixtures'
import { QaFailure, UI_ORIGIN } from './support/qa-api'

// 4C1 only: real anonymous GETs via Node's same-origin proxy. No credential
// fixtures, authentication, product requests, recordings or API mocks.
test('4C1.anonymous-proxy-and-csrf', async ({ page, context }) => {
  let disallowedLocalRequests = 0
  let websocketAttempts = 0
  let pageErrors = 0
  page.on('pageerror', () => pageErrors++)
  await context.routeWebSocket('**/*', socket => { websocketAttempts++; socket.close() })
  await context.route('**/*', route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin !== UI_ORIGIN) return route.abort('blockedbyclient')
    const api = url.pathname === '/api' || url.pathname.startsWith('/api/')
    if (request.method() !== 'GET' || (api && ![
      '/api/v1/auth/me', '/api/v1/auth/csrf',
    ].includes(url.pathname))) {
      disallowedLocalRequests++
      return route.abort('blockedbyclient')
    }
    return route.fallback()
  })
  expect((await context.cookies()).length).toBe(0)
  const meResult = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/me')
  const documentResponse = await page.goto('/login', { timeout: 10_000 })
  expect(documentResponse?.status()).toBe(200)
  expect(await documentResponse?.headerValue('cache-control')).toBe('no-store')
  await expect(page.getByRole('heading', { name: 'Sign in to Fieldnote', exact: true })).toBeVisible()
  const me = await meResult
  if (me.status() === 429) throw new QaFailure('QA_RATE_LIMITED')
  expect(me.status()).toBe(401)
  expect((await me.headerValue('content-type'))?.startsWith('application/problem+json')).toBe(true)
  // Parse only in memory; never attach/print a response body or raw headers.
  const problem = await me.json()
  expect(problem.status === 401 && problem.title === 'Authentication required'
    && typeof problem.type === 'string'
    && problem.detail === 'Authentication failed or is required to access this resource.'
    && Object.keys(problem).every(key => ['type', 'title', 'status', 'detail', 'instance'].includes(key))).toBe(true)

  const csrf = await page.evaluate(async () => {
    const response = await fetch('/api/v1/auth/csrf', {
      credentials: 'include', redirect: 'error', signal: AbortSignal.timeout(10_000),
    })
    if (response.status !== 200) return { status: response.status, valid: false, noStore: false }
    const body = await response.json()
    const cookie = document.cookie.split(';').map(item => item.trim())
      .find(item => item.startsWith('XSRF-TOKEN='))?.slice('XSRF-TOKEN='.length)
    return { status: response.status,
      valid: response.headers.get('content-type')?.includes('application/json') === true
        && typeof body.token === 'string' && body.token.length > 0
        && cookie !== undefined && decodeURIComponent(cookie) === body.token,
      noStore: response.headers.get('cache-control') === 'no-store' }
  })
  if (csrf.status === 429) throw new QaFailure('QA_RATE_LIMITED')
  expect(csrf).toEqual({ status: 200, valid: true, noStore: true })
  const cookies = await context.cookies(UI_ORIGIN)
  const xsrf = cookies.filter(cookie => cookie.name === 'XSRF-TOKEN')
  expect(xsrf.length).toBe(1)
  expect(xsrf.every(cookie => !cookie.httpOnly && cookie.sameSite === 'Lax' && cookie.path === '/')).toBe(true)
  // Secure is profile-dependent: its absence under dev is not a failure.
  expect(cookies.some(cookie => cookie.name === 'ACCESS_TOKEN')).toBe(false)
  expect(disallowedLocalRequests).toBe(0)
  expect(websocketAttempts).toBe(0)
  expect(pageErrors).toBe(0)
})
