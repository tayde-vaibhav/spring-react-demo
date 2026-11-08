import { test, expect } from './support/fixtures'
import { QaFailure, UI_ORIGIN } from './support/qa-api'

// 4C2: one real ADMIN login through the standalone Node proxy. No products
// fixture/adminApi, direct backend calls, API mocks, recordings or product writes.
test('4C2.admin-cookie-session-reads-and-logout', async ({ page, context }) => {
  const password = process.env.DEV_ADMIN_PASSWORD
  if (!password) throw new QaFailure('QA_MISSING_CREDENTIALS')
  let blockedLocalRequests = 0
  let loginRequests = 0
  let logoutRequests = 0
  let websocketAttempts = 0
  let pageErrors = 0
  page.on('pageerror', () => pageErrors++)
  await context.routeWebSocket('**/*', socket => { websocketAttempts++; socket.close() })
  await context.route('**/*', route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin !== UI_ORIGIN) return route.abort('blockedbyclient')
    const method = request.method()
    const api = url.pathname === '/api' || url.pathname.startsWith('/api/')
    const read = method === 'GET' && (!api || [
      '/api/v1/auth/me', '/api/v1/auth/csrf', '/api/v1/products', '/api/v1/products/stats',
    ].includes(url.pathname))
    if (read) return route.fallback()
    if (method === 'POST' && url.pathname === '/api/v1/auth/login' && ++loginRequests === 1) return route.fallback()
    if (method === 'POST' && url.pathname === '/api/v1/auth/logout' && ++logoutRequests === 1) return route.fallback()
    blockedLocalRequests++
    return route.abort('blockedbyclient')
  })

  const start = await page.goto('/login', { timeout: 10_000 })
  expect(start?.status()).toBe(200)
  expect(await start?.headerValue('cache-control')).toBe('no-store')
  const servingCandidate = await page.evaluate(() => {
    const nonce = document.querySelector<HTMLMetaElement>('meta[name="app-style-nonce"]')?.content
    return Boolean(nonce && nonce.length === 32) && !document.querySelector('script[src*="/@vite/client"]')
  })
  expect(servingCandidate).toBe(true)
  await expect(page.getByRole('heading', { name: 'Sign in to Fieldnote', exact: true })).toBeVisible()
  await page.getByLabel(/^Username(?:\s*\*)?\s*$/).fill('admin')
  await page.getByLabel(/^Password(?:\s*\*)?\s*$/).fill(password)
  const loginResult = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/login'
    && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const login = await loginResult
  if (login.status() === 429) throw new QaFailure('QA_RATE_LIMITED')
  if (login.status() !== 200) throw new QaFailure('QA_AUTH_FAILED')
  const body = await login.json()
  expect(body.username === 'admin' && Array.isArray(body.roles) && body.roles.includes('ADMIN')
    && Object.keys(body).every(key => ['username', 'roles'].includes(key))).toBe(true)
  await expect(page).toHaveURL(`${UI_ORIGIN}/dashboard`)
  await expect(page.getByRole('button', { name: 'Account menu for admin', exact: true })).toBeVisible()

  // Raw cookies/claims/headers stay in worker memory and never enter assertions,
  // attachments, stdout or storage-state files. Only boolean comparisons escape.
  const access = (await context.cookies(UI_ORIGIN)).filter(cookie => cookie.name === 'ACCESS_TOKEN')
  expect(access.length).toBe(1)
  const accessCookie = access[0]
  expect(accessCookie.httpOnly && accessCookie.sameSite === 'Lax' && accessCookie.path === '/').toBe(true)
  // Secure absence is expected in dev; HTTPS/non-dev enforcement is a separate test.
  const cookieHeaders = (await login.headersArray()).filter(header => header.name.toLowerCase() === 'set-cookie'
    && header.value.startsWith('ACCESS_TOKEN='))
  expect(cookieHeaders.length).toBe(1)
  const maxAgeText = cookieHeaders[0].value.match(/(?:^|;\s*)Max-Age=(\d+)(?:;|$)/i)?.[1]
  const maxAge = maxAgeText ? Number(maxAgeText) : 0
  const claims = JSON.parse(Buffer.from(accessCookie.value.split('.')[1], 'base64url').toString('utf8'))
  expect(Number.isSafeInteger(claims.exp) && Number.isSafeInteger(claims.iat)
    && maxAge > 0 && maxAge === claims.exp - claims.iat
    && Math.abs(accessCookie.expires - claims.exp) <= 2).toBe(true)
  const requestHeaders = await login.request().allHeaders()
  const xsrf = (await context.cookies(UI_ORIGIN)).find(cookie => cookie.name === 'XSRF-TOKEN')
  expect(Boolean(xsrf?.value) && requestHeaders['x-xsrf-token'] === xsrf?.value).toBe(true)
  const browserStorage = await page.evaluate(() => ({
    accessVisible: document.cookie.split(';').some(cookie => cookie.trim().startsWith('ACCESS_TOKEN=')),
    localItems: localStorage.length, sessionItems: sessionStorage.length,
  }))
  expect(browserStorage).toEqual({ accessVisible: false, localItems: 0, sessionItems: 0 })

  const reads = await page.evaluate(async () => {
    const read = async (path: string) => {
      const response = await fetch(path, { credentials: 'include', redirect: 'error', signal: AbortSignal.timeout(10_000) })
      if (response.status !== 200) return { status: response.status, body: null, noStore: false }
      return { status: response.status, body: await response.json(), noStore: response.headers.get('cache-control') === 'no-store' }
    }
    const me = await read('/api/v1/auth/me')
    if (me.status !== 200) return { failedStatus: me.status }
    const products = await read('/api/v1/products?page=0&size=1')
    if (products.status !== 200) return { failedStatus: products.status }
    const stats = await read('/api/v1/products/stats')
    if (stats.status !== 200) return { failedStatus: stats.status }
    return { failedStatus: 0, me: me.body?.username === 'admin' && me.body?.roles?.includes('ADMIN') === true,
      count: products.body?.totalElements, bounded: Array.isArray(products.body?.content) && products.body.content.length <= 1,
      stats: Array.isArray(stats.body) && stats.body.length > 0
        && stats.body.every((item: { count: number; averagePrice: number }) => Number.isSafeInteger(item.count)
          && item.count >= 0 && Number.isFinite(item.averagePrice) && item.averagePrice > 0)
        && stats.body.reduce((sum: number, item: { count: number }) => sum + item.count, 0) === 500,
      noStore: me.noStore && products.noStore && stats.noStore }
  })
  if (reads.failedStatus === 429) throw new QaFailure('QA_RATE_LIMITED')
  expect(reads).toEqual({ failedStatus: 0, me: true, count: 500, bounded: true, stats: true, noStore: true })
  await page.getByRole('link', { name: 'Products', exact: true }).click()
  await expect(page.getByRole('table', { name: 'Product catalogue', exact: true })).toBeVisible()
  await expect(page.getByText('1–10 of 500', { exact: true })).toBeVisible()
  const restored = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/me')
  const reloaded = await page.reload({ timeout: 10_000 })
  expect(reloaded?.status()).toBe(200)
  const restoredResponse = await restored
  if (restoredResponse.status() === 429) throw new QaFailure('QA_RATE_LIMITED')
  expect(restoredResponse.status()).toBe(200)
  const restoredBody = await restoredResponse.json()
  expect(restoredBody.username === 'admin' && restoredBody.roles.includes('ADMIN')).toBe(true)
  await expect(page.getByRole('button', { name: 'Account menu for admin', exact: true })).toBeVisible()
  await expect(page.getByText('1–10 of 500', { exact: true })).toBeVisible()

  const logoutResult = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/logout'
    && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Account menu for admin', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
  const logout = await logoutResult
  if (logout.status() === 429) throw new QaFailure('QA_RATE_LIMITED')
  expect(logout.status()).toBe(204)
  const clearing = (await logout.headersArray()).filter(header => header.name.toLowerCase() === 'set-cookie'
    && header.value.startsWith('ACCESS_TOKEN='))
  expect(clearing.length === 1 && /(?:^|;\s*)Max-Age=0(?:;|$)/i.test(clearing[0].value)).toBe(true)
  await expect(page).toHaveURL(`${UI_ORIGIN}/login`)
  expect((await context.cookies(UI_ORIGIN)).some(cookie => cookie.name === 'ACCESS_TOKEN')).toBe(false)
  const afterLogout = await page.evaluate(async () => {
    const response = await fetch('/api/v1/auth/me', { credentials: 'include', redirect: 'error', signal: AbortSignal.timeout(10_000) })
    return { status: response.status, problem: response.headers.get('content-type')?.startsWith('application/problem+json') === true }
  })
  if (afterLogout.status === 429) throw new QaFailure('QA_RATE_LIMITED')
  expect(afterLogout).toEqual({ status: 401, problem: true })
  expect({ blockedLocalRequests, loginRequests, logoutRequests, websocketAttempts, pageErrors })
    .toEqual({ blockedLocalRequests: 0, loginRequests: 1, logoutRequests: 1, websocketAttempts: 0, pageErrors: 0 })
})
