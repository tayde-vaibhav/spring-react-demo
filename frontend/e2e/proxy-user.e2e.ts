import type { Page } from '@playwright/test'
import { test, expect } from './support/fixtures'
import { QaFailure, UI_ORIGIN } from './support/qa-api'

async function readOnlyCatalogue(page: Page) {
  await expect(page.getByRole('heading', { name: 'Products', exact: true })).toBeVisible()
  const table = page.getByRole('table', { name: 'Product catalogue', exact: true })
  // A populated table prevents an empty/loading screen from falsely passing.
  await expect(table.getByRole('row')).toHaveCount(11)
  await expect(page.getByText('1–10 of 500', { exact: true })).toBeVisible()
  const writeAction = /^(?:Add product$|Create product$|Edit(?:\s|$)|Delete(?:\s|$)|Remove product$)/
  await expect(page.getByRole('button', { name: writeAction, includeHidden: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: writeAction, includeHidden: true })).toHaveCount(0)
  await expect(table.getByRole('columnheader', { name: 'Actions', exact: true })).toHaveCount(0)
}

// 4C3 only: real USER login/reads/logout, never write attempts or ADMIN fixtures.
test('4C3.user-read-access-and-direct-route-guards', async ({ page, context }) => {
  const password = process.env.DEV_USER_PASSWORD
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
    const api = url.pathname === '/api' || url.pathname.startsWith('/api/')
    if (request.method() === 'GET' && (!api || [
      '/api/v1/auth/me', '/api/v1/auth/csrf', '/api/v1/products', '/api/v1/products/stats',
    ].includes(url.pathname))) return route.fallback()
    if (request.method() === 'POST' && url.pathname === '/api/v1/auth/login' && ++loginRequests === 1) return route.fallback()
    if (request.method() === 'POST' && url.pathname === '/api/v1/auth/logout' && ++logoutRequests === 1) return route.fallback()
    blockedLocalRequests++
    return route.abort('blockedbyclient')
  })
  const start = await page.goto('/login', { timeout: 10_000 })
  expect(start?.status()).toBe(200)
  expect(await start?.headerValue('cache-control')).toBe('no-store')
  expect(await page.evaluate(() => {
    const nonce = document.querySelector<HTMLMetaElement>('meta[name="app-style-nonce"]')?.content
    return Boolean(nonce && nonce.length === 32) && !document.querySelector('script[src*="/@vite/client"]')
  })).toBe(true)
  await expect(page.getByRole('heading', { name: 'Sign in to Fieldnote', exact: true })).toBeVisible()
  await page.getByLabel(/^Username(?:\s*\*)?\s*$/).fill('user')
  await page.getByLabel(/^Password(?:\s*\*)?\s*$/).fill(password)
  const loginResult = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/login'
    && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const login = await loginResult
  if (login.status() === 429) throw new QaFailure('QA_RATE_LIMITED')
  if (login.status() !== 200) throw new QaFailure('QA_AUTH_FAILED')
  const identity = await login.json()
  expect(identity.username === 'user' && Array.isArray(identity.roles)
    && identity.roles.includes('USER') && !identity.roles.includes('ADMIN')
    && Object.keys(identity).every(key => ['username', 'roles'].includes(key))).toBe(true)
  await expect(page).toHaveURL(`${UI_ORIGIN}/dashboard`)
  await expect(page.getByRole('img', { name: 'Bar chart showing product counts by category', exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Bar chart showing average prices by category', exact: true })).toBeVisible()

  const baseline = await page.evaluate(async () => {
    const response = await fetch('/api/v1/products?page=0&size=1', {
      credentials: 'include', redirect: 'error', signal: AbortSignal.timeout(10_000),
    })
    if (response.status !== 200) return { status: response.status, count: null, id: null }
    const body = await response.json()
    return { status: response.status, count: body.totalElements,
      id: Array.isArray(body.content) && typeof body.content[0]?.id === 'string' ? body.content[0].id as string : null }
  })
  if (baseline.status === 429) throw new QaFailure('QA_RATE_LIMITED')
  expect(baseline.status).toBe(200)
  expect(baseline.count).toBe(500)
  if (!baseline.id || !/^[A-Za-z0-9_-]{1,100}$/.test(baseline.id)) throw new QaFailure('QA_UNEXPECTED_RESPONSE')
  await page.getByRole('link', { name: 'Products', exact: true }).click()
  await expect(page).toHaveURL(`${UI_ORIGIN}/products`)
  await readOnlyCatalogue(page)
  for (const path of ['/products/new', `/products/${encodeURIComponent(baseline.id)}/edit`]) {
    const documentResponse = await page.goto(path, { timeout: 10_000 })
    expect(documentResponse?.status()).toBe(200)
    await expect(page).toHaveURL(`${UI_ORIGIN}/products`)
    await readOnlyCatalogue(page)
    await expect(page.getByRole('heading', { name: /^(?:Add a product|Edit product)$/ })).toHaveCount(0)
  }
  const final = await page.evaluate(async () => {
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
    return { failedStatus: 0,
      identity: me.body?.username === 'user' && Array.isArray(me.body?.roles)
        && me.body.roles.includes('USER') && !me.body.roles.includes('ADMIN'),
      count: products.body?.totalElements,
      stats: Array.isArray(stats.body) && stats.body.length > 0
        && stats.body.every((item: { count: number }) => Number.isSafeInteger(item.count) && item.count >= 0)
        && stats.body.reduce((sum: number, item: { count: number }) => sum + item.count, 0) === 500,
      noStore: me.noStore && products.noStore && stats.noStore }
  })
  if (final.failedStatus === 429) throw new QaFailure('QA_RATE_LIMITED')
  expect(final).toEqual({ failedStatus: 0, identity: true, count: 500, stats: true, noStore: true })
  const logoutResult = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/logout'
    && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Account menu for user', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
  const logout = await logoutResult
  if (logout.status() === 429) throw new QaFailure('QA_RATE_LIMITED')
  expect(logout.status()).toBe(204)
  await expect(page).toHaveURL(`${UI_ORIGIN}/login`)
  expect((await context.cookies(UI_ORIGIN)).some(cookie => cookie.name === 'ACCESS_TOKEN')).toBe(false)
  const anonymous = await page.evaluate(async () => (await fetch('/api/v1/auth/me', {
    credentials: 'include', redirect: 'error', signal: AbortSignal.timeout(10_000),
  })).status)
  if (anonymous === 429) throw new QaFailure('QA_RATE_LIMITED')
  expect(anonymous).toBe(401)
  expect({ blockedLocalRequests, loginRequests, logoutRequests, websocketAttempts, pageErrors })
    .toEqual({ blockedLocalRequests: 0, loginRequests: 1, logoutRequests: 1, websocketAttempts: 0, pageErrors: 0 })
})
